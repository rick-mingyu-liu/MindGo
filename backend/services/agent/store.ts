import { randomUUID, createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { getPool } from '../../db/connection';
import config = require('../../config');
import type { AgentConversationRow, AgentDraftRow, AgentRunRow, AgentReceiptRow, AgentTransactionVersion } from '../../types/db';
import { AgentError, type Conversation, type ConversationSettings, type ConversationState, type Message, type DraftRow, type TurnInput, type TurnResult, type BeginTurnResult } from './types';
import { validateSettings, validateRows, validateUuid, validateMessage } from './validation';

const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const conversationColumns = 'id,title,currency,timezone,language,created_at,updated_at';
const receiptColumns = 'id,request_id,transaction_ids,undo_until,undone_at,created_at';
const runColumns = 'id,status,error_code';
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
  return { conversation: c.rows[0], messages: messages.rows,
    draft: draft ? { id:draft.id,version:draft.version,status: draft.expired && draft.status==='pending' ? 'expired' : draft.status, rows: draft.expired ? [] : draft.rows,expires_at:draft.expires_at } : null,
    receipts: receipts.rows,run: runs.rows[0] ?? null };
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
  return owned(userId,async client=>{
    await conversation(client,userId,id);await active(client,userId,id,runId);
    if(rows!==undefined) await revision(client,userId,id,rows,rows.length?'pending':'cancelled');
    await client.query("INSERT INTO agent_messages(id,conversation_id,user_id,run_id,role,content,status) VALUES($1,$2,$3,$4,'assistant',$5,'complete')",[randomUUID(),id,userId,runId,result.text.trim()]);
    await client.query("UPDATE agent_runs SET status='complete',finished_at=now(),input_tokens=$2,output_tokens=$3,tool_calls=$4 WHERE id=$1",[runId,result.usage?.inputTokens??null,result.usage?.outputTokens??null,result.toolCalls??null]);
    await client.query('UPDATE agent_conversations SET updated_at=now() WHERE id=$1',[id]); return state(client,userId,id);
  });
}
export async function failTurn(userId:number,id:string,runId:string,errorCode:string):Promise<ConversationState> {
  if(!/^agent_[a-z_]{1,50}$/.test(errorCode)) errorCode='agent_provider_error';
  return owned(userId,async client=>{
    await conversation(client,userId,id);
    await client.query("UPDATE agent_runs SET status='failed',error_code=$4,finished_at=now() WHERE id=$1 AND conversation_id=$2 AND user_id=$3 AND status='running'",[runId,id,userId,errorCode]);
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
    await client.query('COMMIT');client.release();return (drafts.rowCount??0)+(runs.rowCount??0)+(receipts.rowCount??0)+(admissions.rowCount??0);
  }catch(error){return rollback(client,error);}
}
