import { randomUUID, createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { getPool } from '../../db/connection';
import config = require('../../config');
import type { AgentConversationRow, AgentDraftRow, AgentGoalProposalRow, AgentRunRow, AgentReceiptRow, AgentTransactionVersion } from '../../types/db';
import { AgentError, type RunUsage, type Conversation, type ConversationSettings, type ConversationState, type GoalProposal, type Message, type DraftRow, type TurnInput, type TurnResult, type BeginTurnResult } from './types';
import { validateSettings, validateRows, validateUuid, validateMessage } from './validation';
import { validateGoalDraft, goalProposalsAvailable, GOAL_VERSION_SQL } from './planning';
import logger = require('../../utils/logger');
import { errorSummary } from '../../utils/errorSummary';

const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const conversationColumns = 'id,title,currency,timezone,language,created_at,updated_at';
const receiptColumns = 'id,request_id,transaction_ids,undo_until,undone_at,created_at';
const runColumns = 'id,status,error_code';
const proposalColumns = 'id,action,goal_id,before,after,status,expires_at,result_goal_id';
const limits = config.agent;

// A failed ROLLBACK leaves the connection in an unknown transaction state, so
// it is destroyed rather than returned to the pool; the original error wins.
async function rollback(client: PoolClient, error: unknown): Promise<never> {
  try { await client.query('ROLLBACK'); } catch { client.release(true); throw error; }
  client.release(); throw error;
}

// Every mutation takes the same owner lock before conversation/receipt locks.
// No database transaction remains open while a provider is executing.
async function owned<T>(userId: number, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    // NO KEY UPDATE serializes agent work without blocking FK checks from
    // ordinary inserts (transactions, tokens) that reference the user row.
    if (!(await client.query('SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE', [userId])).rowCount) throw new AgentError('agent_not_found', 404);
    // Lease enforcement applies on every storage interaction, not just sweep.
    await client.query(`WITH stale AS (UPDATE agent_runs SET status='failed',error_code='agent_timeout',finished_at=now()
      WHERE user_id=$1 AND status='running' AND lease_until<=now() RETURNING id)
      UPDATE agent_messages SET status='failed' WHERE run_id IN (SELECT id FROM stale) AND role='user'`, [userId]);
    const result = await work(client);
    await client.query('COMMIT');
    client.release();
    return result;
  } catch (error) { return rollback(client, error); }
}
async function conversation(client: PoolClient, userId: number, id: string): Promise<AgentConversationRow> {
  validateUuid(id);
  const result = await client.query<AgentConversationRow>('SELECT * FROM agent_conversations WHERE id=$1 AND user_id=$2 FOR UPDATE', [id, userId]);
  if (!result.rows[0]) throw new AgentError('agent_not_found', 404);
  return result.rows[0];
}
async function state(client: PoolClient, userId: number, id: string): Promise<ConversationState> {
  const c = await client.query<Conversation>(`SELECT ${conversationColumns} FROM agent_conversations WHERE id=$1 AND user_id=$2`, [id, userId]);
  if (!c.rows[0]) throw new AgentError('agent_not_found', 404);
  const messages = await client.query<Message>(`SELECT id,role,content,status,created_at FROM agent_messages WHERE conversation_id=$1 AND user_id=$2 ORDER BY created_at,id LIMIT $3`, [id,userId,limits.maxMessagesPerConversation]);
  // Expiry is judged by the database clock, the same one every write checks.
  const drafts = await client.query<AgentDraftRow & {expired:boolean}>(`SELECT *,expires_at<=now() AS expired FROM agent_drafts WHERE conversation_id=$1 AND user_id=$2 ORDER BY version DESC LIMIT 1`, [id,userId]);
  const draft = drafts.rows[0];
  const receipts = await client.query<AgentReceiptRow>(`SELECT ${receiptColumns} FROM agent_receipts WHERE conversation_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 100`, [id,userId]);
  const runs = await client.query<AgentRunRow>(`SELECT ${runColumns} FROM agent_runs WHERE conversation_id=$1 AND user_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1`, [id,userId]);
  // The conversation's most recent proposal; a superseded one (never the newest
  // in practice) shows nothing. Without migration 015 there are none.
  const proposals = await goalProposalsAvailable(sql=>client.query(sql)) ? await client.query<Pick<AgentGoalProposalRow,'id'|'action'|'goal_id'|'before'|'after'|'status'|'expires_at'|'result_goal_id'> & {expired:boolean}>(`SELECT ${proposalColumns},(status='pending' AND expires_at<=now()) AS expired FROM agent_goal_proposals WHERE conversation_id=$1 AND user_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1`, [id,userId]) : {rows:[]};
  const proposal = proposals.rows[0]?.status==='superseded' ? undefined : proposals.rows[0];
  return { conversation: c.rows[0], messages: messages.rows,
    draft: draft ? { id:draft.id,version:draft.version,status: draft.expired && draft.status==='pending' ? 'expired' : draft.status, rows: draft.expired ? [] : draft.rows,expires_at:draft.expires_at } : null,
    receipts: receipts.rows,run: runs.rows[0] ?? null,
    goalProposal: proposal ? { id:proposal.id,action:proposal.action,goal_id:proposal.goal_id,before:proposal.before,after:proposal.after,status:proposal.expired?'expired':proposal.status as GoalProposal['status'],expires_at:proposal.expires_at,result_goal_id:proposal.result_goal_id } : null };
}
async function noActiveRun(client: PoolClient, userId: number, conversationId: string): Promise<void> {
  if ((await client.query("SELECT id FROM agent_runs WHERE conversation_id=$1 AND user_id=$2 AND status='running' AND lease_until>now()",[conversationId,userId])).rowCount) throw new AgentError('agent_busy',409);
}
async function active(client: PoolClient, userId: number, conversationId: string, runId: string): Promise<AgentRunRow> {
  validateUuid(runId);
  const result = await client.query<AgentRunRow & {lease_expired:boolean}>('SELECT *,lease_until<=now() AS lease_expired FROM agent_runs WHERE id=$1 AND conversation_id=$2 AND user_id=$3 FOR UPDATE',[runId,conversationId,userId]);
  const run=result.rows[0]; if(!run) throw new AgentError('agent_not_found',404);
  if(run.lease_expired || run.error_code==='agent_timeout') throw new AgentError('agent_timeout',409);
  if(run.status!=='running') throw new AgentError('agent_cancelled',409);
  return run;
}
async function currentDraft(client: PoolClient,userId:number,conversationId:string,version:number):Promise<AgentDraftRow> {
  if(!Number.isSafeInteger(version)||version<1) throw new AgentError('agent_invalid_input');
  const result=await client.query<AgentDraftRow & {expired:boolean}>('SELECT *,expires_at<=now() AS expired FROM agent_drafts WHERE conversation_id=$1 AND user_id=$2 ORDER BY version DESC LIMIT 1 FOR UPDATE',[conversationId,userId]);
  const draft=result.rows[0];
  if(!draft || draft.version!==version) throw new AgentError('agent_version_conflict',409);
  if(draft.expired) throw new AgentError('agent_expired',409);
  if(draft.status!=='pending') throw new AgentError('agent_version_conflict',409);
  return draft;
}
async function revision(client:PoolClient,userId:number,conversationId:string,rows:DraftRow[],status='pending',expiresAt?:Date):Promise<void> {
  const result=await client.query<{draft_version:number}>('UPDATE agent_conversations SET draft_version=draft_version+1,updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING draft_version',[conversationId,userId]);
  await client.query(`INSERT INTO agent_drafts(id,conversation_id,user_id,version,status,rows,expires_at) VALUES($1,$2,$3,$4,$5,$6,COALESCE($7,now()+interval '24 hours'))`,[randomUUID(),conversationId,userId,result.rows[0]!.draft_version,status,JSON.stringify(rows),expiresAt ?? null]);
}
// Only completed exchanges are context: a cancelled or failed user turn never
// happened as far as the model is concerned, so it must not be replayed.
function historyBound(messages:Message[]):Message[] {
  const output:Message[]=[]; let remaining=limits.maxHistoryChars;
  for(const message of messages.filter(m=>m.status==='complete').slice(-limits.maxHistoryMessages).reverse()) { if(message.content.length>remaining) break;output.unshift(message);remaining-=message.content.length; }
  return output;
}
export async function createConversation(userId:number,settings:ConversationSettings):Promise<Conversation> {
  const safe=validateSettings(settings);
  return owned(userId,async client=>{
    // The owner lock serializes admission with concurrent creates and deletes.
    // Match the listing bound so every accepted conversation remains reachable.
    const count=await client.query<{count:string}>('SELECT count(*) FROM agent_conversations WHERE user_id=$1',[userId]);
    if(Number(count.rows[0]!.count)>=limits.maxConversations) throw new AgentError('agent_conversation_limit',409);
    const result=await client.query<Conversation>(`INSERT INTO agent_conversations(id,user_id,currency,timezone,language) VALUES($1,$2,$3,$4,$5) RETURNING ${conversationColumns}`,[randomUUID(),userId,safe.currency,safe.timezone,safe.language]); return result.rows[0]!;
  });
}
export async function listConversations(userId:number):Promise<Conversation[]> {
  return owned(userId,async client=>(await client.query<Conversation>(`SELECT ${conversationColumns} FROM agent_conversations WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2`,[userId,limits.maxConversations])).rows);
}
export async function getConversation(userId:number,id:string):Promise<ConversationState> {
  return owned(userId,async client=>{await conversation(client,userId,id);return state(client,userId,id);});
}
export async function deleteConversation(userId:number,id:string):Promise<void> {
  await owned(userId,async client=>{await conversation(client,userId,id);await client.query('DELETE FROM agent_conversations WHERE id=$1 AND user_id=$2',[id,userId]);});
}
export async function deleteConversations(userId:number):Promise<void> {
  await owned(userId,async client=>{await client.query('DELETE FROM agent_conversations WHERE user_id=$1',[userId]);});
}
/** `canStart` false still answers an exact replay from saved state, but refuses to admit a new run. */
export async function beginTurn(userId:number,id:string,input:TurnInput,canStart=true):Promise<BeginTurnResult> {
  const settings=validateSettings(input); const content=validateMessage(input.content);const requestId=validateUuid(input.requestId);
  const requestHash=hash({id,content:input.content,...settings});
  return owned(userId,async client=>{
    await conversation(client,userId,id);
    const previous=await client.query<AgentRunRow>('SELECT * FROM agent_runs WHERE id=$1',[requestId]);
    if(previous.rows[0]) {
      const run=previous.rows[0]; if(run.user_id!==userId||run.conversation_id!==id||run.request_hash!==requestHash) throw new AgentError('agent_request_conflict',409);
      const s=await state(client,userId,id);return {started:false,state:s,history:historyBound(s.messages),pendingRows:s.draft?.status==='pending'?s.draft.rows:[]};
    }
    if(!canStart) throw new AgentError('agent_unavailable',503);
    if((await client.query('SELECT id FROM agent_admissions WHERE id=$1',[requestId])).rowCount) throw new AgentError('agent_request_conflict',409);
    if((await client.query("SELECT id FROM agent_runs WHERE user_id=$1 AND status='running'",[userId])).rowCount) throw new AgentError('agent_busy',409);
    const admitted=await client.query<{count:string}>("SELECT count(*) FROM agent_admissions WHERE user_id=$1 AND created_at>now()-interval '1 hour'",[userId]);
    if(Number(admitted.rows[0]!.count)>=limits.maxTurnsPerHour) throw new AgentError('agent_rate_limited',429);
    const count=await client.query<{count:string}>('SELECT count(*) FROM agent_messages WHERE conversation_id=$1 AND user_id=$2',[id,userId]);
    // Leave room for this turn's user message and the assistant reply.
    if(Number(count.rows[0]!.count)+2>limits.maxMessagesPerConversation) throw new AgentError('agent_conversation_full',409);
    const prior=await state(client,userId,id);
    await client.query('INSERT INTO agent_admissions(id,user_id) VALUES($1,$2)',[requestId,userId]);
    await client.query("INSERT INTO agent_runs(id,conversation_id,user_id,request_hash,status) VALUES($1,$2,$3,$4,'running')",[requestId,id,userId,requestHash]);
    await client.query("INSERT INTO agent_messages(id,conversation_id,user_id,run_id,role,content,status) VALUES($1,$2,$3,$4,'user',$5,'complete')",[randomUUID(),id,userId,requestId,content]);
    await client.query('UPDATE agent_conversations SET currency=$3,timezone=$4,language=$5,title=CASE WHEN $6 THEN $7 ELSE title END,updated_at=now() WHERE id=$1 AND user_id=$2',[id,userId,settings.currency,settings.timezone,settings.language,Number(count.rows[0]!.count)===0,content.slice(0,80)]);
    return {started:true,state:await state(client,userId,id),history:historyBound(prior.messages),pendingRows:prior.draft?.status==='pending'?prior.draft.rows:[]};
  });
}
export async function assertRunActive(userId:number,id:string,runId:string):Promise<void> {
  await owned(userId,async client=>{await conversation(client,userId,id);await active(client,userId,id,runId);});
}
export async function finishTurn(userId:number,id:string,runId:string,result:TurnResult):Promise<ConversationState> {
  if(typeof result.text!=='string'||!result.text.trim()||result.text.length>16000||result.text.includes('\0')) throw new AgentError('agent_invalid_proposal');
  const rows=result.proposedRows===undefined?undefined:validateRows(result.proposedRows,true);
  const goal=result.goalProposal===undefined?undefined:validateGoalDraft(result.goalProposal);
  return owned(userId,async client=>{
    await conversation(client,userId,id);await active(client,userId,id,runId);
    if(rows!==undefined) await revision(client,userId,id,rows,rows.length?'pending':'cancelled');
    // A table that vanished mid-turn (015 not applied) loses the proposal, not the reply.
    if(goal!==undefined && await goalProposalsAvailable(sql=>client.query(sql))) {
      // One pending goal change per conversation: a new proposal replaces the last.
      await client.query("UPDATE agent_goal_proposals SET status='superseded',decided_at=now() WHERE conversation_id=$1 AND user_id=$2 AND status='pending'",[id,userId]);
      await client.query('INSERT INTO agent_goal_proposals(id,conversation_id,user_id,run_id,action,goal_id,expected_updated_at,before,after) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [randomUUID(),id,userId,runId,goal.action,goal.goal_id,goal.expected_updated_at,goal.before===null?null:JSON.stringify(goal.before),JSON.stringify(goal.after)]);
    }
    await client.query("INSERT INTO agent_messages(id,conversation_id,user_id,run_id,role,content,status) VALUES($1,$2,$3,$4,'assistant',$5,'complete')",[randomUUID(),id,userId,runId,result.text.trim()]);
    await client.query("UPDATE agent_runs SET status='complete',finished_at=now(),input_tokens=$2,output_tokens=$3,tool_calls=$4 WHERE id=$1",[runId,result.usage?.inputTokens??null,result.usage?.outputTokens??null,result.toolCalls??null]);
    await client.query('UPDATE agent_conversations SET updated_at=now() WHERE id=$1',[id]); return state(client,userId,id);
  });
}
/** `usage` is what the runtime counted before it stopped (counts only), so a failed run still shows what it cost. */
export async function failTurn(userId:number,id:string,runId:string,errorCode:string,usage?:RunUsage):Promise<ConversationState> {
  if(!/^agent_[a-z_]{1,50}$/.test(errorCode)) errorCode='agent_provider_error';
  // Out-of-range counts become null: the columns are int4 and tool_calls is checked 0-8, and a
  // violation would make this UPDATE throw and strand the run as 'running'.
  const counted=(n:number|undefined,max=2_147_483_647)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=max?n:null;
  return owned(userId,async client=>{
    await conversation(client,userId,id);
    await client.query("UPDATE agent_runs SET status='failed',error_code=$4,finished_at=now(),input_tokens=$5,output_tokens=$6,tool_calls=$7 WHERE id=$1 AND conversation_id=$2 AND user_id=$3 AND status='running'",[runId,id,userId,errorCode,counted(usage?.inputTokens),counted(usage?.outputTokens),counted(usage?.toolCalls,8)]);
    await client.query("UPDATE agent_messages SET status='failed' WHERE run_id=$1 AND conversation_id=$2 AND user_id=$3 AND role='user' AND EXISTS(SELECT 1 FROM agent_runs WHERE id=$1 AND status='failed')",[runId,id,userId]);return state(client,userId,id);
  });
}
export async function cancelRun(userId:number,id:string,runId:string):Promise<ConversationState> {
  validateUuid(runId);
  return owned(userId,async client=>{
    await conversation(client,userId,id);
    const existing=await client.query('SELECT id FROM agent_runs WHERE id=$1 AND conversation_id=$2 AND user_id=$3',[runId,id,userId]);if(!existing.rowCount) throw new AgentError('agent_not_found',404);
    await client.query("UPDATE agent_runs SET status='cancelled',error_code='agent_cancelled',finished_at=now() WHERE id=$1 AND status='running'",[runId]);
    await client.query("UPDATE agent_messages SET status='cancelled' WHERE run_id=$1 AND role='user' AND EXISTS(SELECT 1 FROM agent_runs WHERE id=$1 AND status='cancelled')",[runId]);return state(client,userId,id);
  });
}
export async function editDraft(userId:number,id:string,version:number,input:unknown):Promise<ConversationState> {
  const rows=validateRows(input);
  return owned(userId,async client=>{await conversation(client,userId,id);await noActiveRun(client,userId,id);const draft=await currentDraft(client,userId,id,version);
    const ids=new Set(draft.rows.map(row=>row.id));if(rows.some(row=>!ids.has(row.id))) throw new AgentError('agent_invalid_input');
    await revision(client,userId,id,rows,'pending',draft.expires_at);return state(client,userId,id);
  });
}
export async function cancelDraft(userId:number,id:string,version:number):Promise<ConversationState> {
  return owned(userId,async client=>{await conversation(client,userId,id);await noActiveRun(client,userId,id);const draft=await currentDraft(client,userId,id,version);await revision(client,userId,id,[],'cancelled',draft.expires_at);return state(client,userId,id);});
}
export async function confirmDraft(userId:number,id:string,input:{version:number;rowIds:string[];requestId:string}):Promise<ConversationState> {
  const requestId=validateUuid(input.requestId);
  if(!Array.isArray(input.rowIds)||!input.rowIds.length||input.rowIds.length>limits.maxRows) throw new AgentError('agent_invalid_input');
  const rowIds=input.rowIds.map(validateUuid).sort();if(new Set(rowIds).size!==rowIds.length) throw new AgentError('agent_invalid_input');
  const requestHash=hash({id,version:input.version,rowIds});
  return owned(userId,async client=>{
    await conversation(client,userId,id);
    const prior=await client.query<AgentReceiptRow>('SELECT * FROM agent_receipts WHERE user_id=$1 AND request_id=$2',[userId,requestId]);
    if(prior.rows[0]) {if(prior.rows[0].request_hash!==requestHash) throw new AgentError('agent_request_conflict',409);return state(client,userId,id);}
    await noActiveRun(client,userId,id);const draft=await currentDraft(client,userId,id,input.version);
    const selected=new Set(rowIds);const rows=validateRows(draft.rows).filter(row=>selected.has(row.id));if(rows.length!==rowIds.length) throw new AgentError('agent_invalid_input');
    const versions:AgentTransactionVersion[]=[];
    for(const row of rows) {
      const saved=await client.query<AgentTransactionVersion>(`INSERT INTO transactions(user_id,amount,description,category,type,date,currency,source) VALUES($1,$2,$3,$4,$5,$6,$7,'agent') RETURNING id,updated_at::text,xmin::text`,[userId,row.amount,row.description,row.category,row.type,row.date,row.currency]);versions.push(saved.rows[0]!);
    }
    await client.query(`INSERT INTO agent_receipts(id,conversation_id,user_id,request_id,request_hash,transaction_ids,transaction_versions) VALUES($1,$2,$3,$4,$5,$6,$7)`,[randomUUID(),id,userId,requestId,requestHash,versions.map(v=>v.id),JSON.stringify(versions)]);
    const remaining=draft.rows.filter(row=>!selected.has(row.id));await revision(client,userId,id,remaining,remaining.length?'pending':'confirmed',draft.expires_at);
    return state(client,userId,id);
  });
}
async function proposalsReady(client:PoolClient):Promise<void> {
  if(!(await goalProposalsAvailable(sql=>client.query(sql)))) throw new AgentError('agent_unavailable',503);
}
async function latestProposal(client:PoolClient,userId:number,conversationId:string,proposalId:string):Promise<AgentGoalProposalRow> {
  const result=await client.query<AgentGoalProposalRow & {expired:boolean}>('SELECT *,expires_at<=now() AS expired FROM agent_goal_proposals WHERE conversation_id=$1 AND user_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE',[conversationId,userId]);
  const proposal=result.rows[0];
  if(!proposal || proposal.id!==proposalId) throw new AgentError('agent_version_conflict',409);
  // Expiry is stored by the sweep, and judged by the database clock before it runs.
  if(proposal.status==='expired' || (proposal.status==='pending' && proposal.expired)) throw new AgentError('agent_expired',409);
  if(proposal.status!=='pending') throw new AgentError('agent_version_conflict',409);
  return proposal;
}
/**
 * Applies the conversation's latest pending goal proposal, exactly once per
 * request ID. An update applies only while the goal still carries the
 * version it was proposed against, to the microsecond; otherwise the proposal
 * is marked 'conflict' (committed) and the call answers agent_goal_conflict
 * without touching the goal. A create whose target date has passed in the
 * conversation's timezone is marked 'conflict' too and answers
 * agent_goal_invalid. A replay of either answers the same code.
 */
export async function confirmGoalProposal(userId:number,id:string,input:{proposalId:string;requestId:string}):Promise<ConversationState> {
  const proposalId=validateUuid(input.proposalId);const requestId=validateUuid(input.requestId);
  const requestHash=hash({id,proposalId});
  const outcome=await owned<{conflict?:string;state?:ConversationState}>(userId,async client=>{
    const owner=await conversation(client,userId,id);await proposalsReady(client);
    const prior=await client.query<AgentGoalProposalRow>('SELECT * FROM agent_goal_proposals WHERE user_id=$1 AND request_id=$2',[userId,requestId]);
    if(prior.rows[0]) {
      if(prior.rows[0].request_hash!==requestHash) throw new AgentError('agent_request_conflict',409);
      return prior.rows[0].status==='conflict'?{conflict:prior.rows[0].action==='create'?'agent_goal_invalid':'agent_goal_conflict'}:{state:await state(client,userId,id)};
    }
    await noActiveRun(client,userId,id);
    const proposal=await latestProposal(client,userId,id,proposalId);const after=proposal.after;
    const markConflict=()=>client.query("UPDATE agent_goal_proposals SET status='conflict',request_id=$2,request_hash=$3,decided_at=now() WHERE id=$1",[proposal.id,requestId,requestHash]);
    let goalId:number;
    if(proposal.action==='create') {
      // The goal form's rule, judged on the database clock in the conversation's timezone.
      const past=await client.query<{past:boolean}>('SELECT $1::date < (now() AT TIME ZONE $2)::date AS past',[after.target_date,owner.timezone]);
      if(after.target_date===null || past.rows[0]!.past) { await markConflict(); return {conflict:'agent_goal_invalid'}; }
      const created=await client.query<{id:number}>('INSERT INTO savings_goals(user_id,name,target_amount,current_amount,currency,target_date,description) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
        [userId,after.name,after.target_amount,after.current_amount,after.currency,after.target_date,after.description]);
      goalId=created.rows[0]!.id;
    } else {
      // Compared as PostgreSQL text, never through a JavaScript Date (milliseconds).
      const current=await client.query<{version:string|null}>(`SELECT ${GOAL_VERSION_SQL} AS version FROM savings_goals WHERE id=$1 AND user_id=$2 FOR UPDATE`,[proposal.goal_id,userId]);
      if(!current.rows[0] || current.rows[0].version!==proposal.expected_updated_at) { await markConflict(); return {conflict:'agent_goal_conflict'}; }
      await client.query('UPDATE savings_goals SET name=$3,target_amount=$4,current_amount=$5,currency=$6,target_date=$7,description=$8 WHERE id=$1 AND user_id=$2',
        [proposal.goal_id,userId,after.name,after.target_amount,after.current_amount,after.currency,after.target_date,after.description]);
      goalId=proposal.goal_id!;
    }
    await client.query("UPDATE agent_goal_proposals SET status='confirmed',request_id=$2,request_hash=$3,result_goal_id=$4,decided_at=now() WHERE id=$1",[proposal.id,requestId,requestHash,goalId]);
    return {state:await state(client,userId,id)};
  });
  if(outcome.conflict||!outcome.state) throw new AgentError(outcome.conflict ?? 'agent_goal_conflict',409);
  return outcome.state;
}
export async function cancelGoalProposal(userId:number,id:string,proposalId:string):Promise<ConversationState> {
  const proposalKey=validateUuid(proposalId);
  return owned(userId,async client=>{
    await conversation(client,userId,id);await proposalsReady(client);await noActiveRun(client,userId,id);
    const proposal=await latestProposal(client,userId,id,proposalKey);
    await client.query("UPDATE agent_goal_proposals SET status='cancelled',decided_at=now() WHERE id=$1",[proposal.id]);
    return state(client,userId,id);
  });
}
export async function undoReceipt(userId:number,id:string):Promise<void> {
  validateUuid(id);
  await owned(userId,async client=>{
    const result=await client.query<AgentReceiptRow & {expired:boolean}>('SELECT *,undo_until<=now() AS expired FROM agent_receipts WHERE id=$1 AND user_id=$2 FOR UPDATE',[id,userId]);const receipt=result.rows[0];if(!receipt) throw new AgentError('agent_not_found',404);
    if(receipt.undone_at) return;
    if(receipt.expired) throw new AgentError('agent_expired',409);
    const saved=await client.query<AgentTransactionVersion>('SELECT id,updated_at::text,xmin::text FROM transactions WHERE user_id=$1 AND id=ANY($2::int[]) ORDER BY id FOR UPDATE',[userId,receipt.transaction_ids]);
    if(saved.rows.length!==receipt.transaction_versions.length || receipt.transaction_versions.some(v=>!saved.rows.some(s=>s.id===v.id&&s.updated_at===v.updated_at&&s.xmin===v.xmin))) throw new AgentError('agent_undo_conflict',409);
    await client.query('DELETE FROM transactions WHERE user_id=$1 AND id=ANY($2::int[])',[userId,receipt.transaction_ids]);await client.query('UPDATE agent_receipts SET undone_at=now() WHERE id=$1',[id]);
  });
}
// Called only by the existing hourly job when the feature is configured.
export async function cleanupAgentData():Promise<number> {
  const client=await getPool().connect();
  try {await client.query('BEGIN');
    await client.query(`WITH stale AS (UPDATE agent_runs SET status='failed',error_code='agent_timeout',finished_at=now()
      WHERE status='running' AND lease_until<=now() RETURNING id)
      UPDATE agent_messages SET status='failed' WHERE run_id IN (SELECT id FROM stale) AND role='user'`);
    const drafts=await client.query('DELETE FROM agent_drafts WHERE expires_at<=now()');
    const runs=await client.query("DELETE FROM agent_runs WHERE created_at<now()-interval '30 days' AND status<>'running'");
    const receipts=await client.query("DELETE FROM agent_receipts WHERE (conversation_id IS NULL AND undo_until<=now()) OR created_at<now()-interval '30 days'");
    const admissions=await client.query("DELETE FROM agent_admissions WHERE created_at<now()-interval '30 days'");
    let proposals=0;
    // Isolated: a missing table (015 not applied) or a failure here must not
    // roll back the cleanups above.
    if(await goalProposalsAvailable(sql=>client.query(sql))) {
      await client.query('SAVEPOINT goal_proposals');
      try {
        const expired=await client.query("UPDATE agent_goal_proposals SET status='expired',decided_at=now() WHERE status='pending' AND expires_at<=now()");
        const removed=await client.query("DELETE FROM agent_goal_proposals WHERE status<>'pending' AND COALESCE(decided_at,created_at)<now()-interval '30 days'");
        await client.query('RELEASE SAVEPOINT goal_proposals');
        proposals=(expired.rowCount??0)+(removed.rowCount??0);
      } catch(error) {
        await client.query('ROLLBACK TO SAVEPOINT goal_proposals');
        logger.error('Agent goal proposal cleanup failed',errorSummary(error));
      }
    }
    await client.query('COMMIT');client.release();return (drafts.rowCount??0)+(runs.rowCount??0)+(receipts.rowCount??0)+(admissions.rowCount??0)+proposals;
  }catch(error){return rollback(client,error);}
}
