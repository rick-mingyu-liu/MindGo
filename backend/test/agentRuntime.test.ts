import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import type { Options, Query, SDKMessage, SdkMcpToolDefinition } from '@anthropic-ai/claude-agent-sdk';
import { createAgentRuntime } from '../services/agent/runtime';
import config = require('../config');

const input = { content: 'Coffee 5 CAD today', history: [], pendingRows: [], currency: 'CAD', timezone: 'America/Toronto', language: 'en' as const, today: '2026-10-14', signal: new AbortController().signal };
const row = { amount: '5.00', description: 'Coffee', category: 'Dining Out', type: 'expense', date: '2026-10-14', currency: 'CAD' };
const success = { type: 'result', subtype: 'success', is_error: false, result: 'Please review the draft.', usage: { input_tokens: 20, output_tokens: 10 }, modelUsage: { model: {inputTokens: 20,outputTokens:10,cacheReadInputTokens:7,cacheCreationInputTokens:3} } };

async function fixture(events: (options: Options, tools: SdkMcpToolDefinition[]) => AsyncGenerator<unknown>) {
  const sdk = await import('@anthropic-ai/claude-agent-sdk');
  let captured: Options | undefined;
  let registered: SdkMcpToolDefinition[] = [];
  let closed = false;
  const runtime = createAgentRuntime(async () => ({ ...sdk,
    createSdkMcpServer: (options: Parameters<typeof sdk.createSdkMcpServer>[0]) => { registered = options.tools ?? []; return sdk.createSdkMcpServer(options); },
    query: ({ options }: { options?: Options }) => {
      captured = options!;
      const generator = events(options!, registered);
      return Object.assign(generator, { close: () => { closed = true; } }) as unknown as Query;
    },
  }));
  return { runtime, options: () => captured!, closed: () => closed };
}

test('provider errors never leak raw details, including success subtype with is_error', async () => {
  config.agent.enabled = true; config.agent.apiKey = 'fictional-test-key';
  for (const event of [{...success,is_error:true,result:'secret raw provider error'}, {...success,subtype:'error_during_execution',errors:['secret']}]) {
    const f = await fixture(async function* () { yield event; });
    await assert.rejects(f.runtime(input), { code: 'agent_provider_error', message: 'agent_provider_error' });
    assert.equal(f.closed(), true);
    await assert.rejects(access(f.options().cwd!));
  }
});

test('tool replaces whole pending batch with validated rows and actual tokens, never USD estimates', async () => {
  const f = await fixture(async function* (_options, tools) {
    assert.equal(tools.length, 1);
    await tools[0]!.handler({rows:[row]}, {});
    await tools[0]!.handler({rows:[{...row,amount:'7.00'}]}, {});
    yield success;
  });
  const result = await f.runtime(input);
  assert.equal(result.toolCalls, 2);
  assert.equal(result.proposedRows?.length, 1);
  assert.equal((result.proposedRows?.[0] as {amount:string}).amount, '7.00');
  assert.match((result.proposedRows?.[0] as {id:string}).id, /^[\da-f-]{36}$/);
  assert.deepEqual(result.usage, {inputTokens:30,outputTokens:10});
  assert.equal(f.closed(), true);
  await assert.rejects(access(f.options().cwd!));
});

test('unknown tools denied, built-ins/settings disabled, config isolated and sessions unpersisted', async () => {
  const f = await fixture(async function* (options) {
    assert.deepEqual(options.tools, []);
    assert.deepEqual(options.settingSources, []);
    assert.equal(options.persistSession, false);
    assert.equal(options.strictMcpConfig, true);
    assert.deepEqual(Object.keys(options.mcpServers!), ['draft']);
    const denied = await options.canUseTool!('Bash', {}, {} as never);
    assert.equal(denied?.behavior, 'deny');
    assert.equal(options.env?.DATABASE_URL, undefined);
    assert.equal(options.env?.JWT_SECRET, undefined);
    assert.equal(options.env?.ANTHROPIC_API_KEY, 'fictional-test-key');
    assert.ok(options.env?.CLAUDE_CONFIG_DIR?.startsWith(options.cwd!));
    yield success;
  });
  await f.runtime(input);
});

test('tool budget rejects a ninth call and discards all proposals', async () => {
  const f = await fixture(async function* (_options, tools) {
    for(let i=0;i<9;i++) await tools[0]!.handler({rows:[row]}, {});
    yield success;
  });
  await assert.rejects(f.runtime(input), {code:'agent_limit_exceeded'});
});

test('invalid dates cannot become a proposal and model can repair after safe tool error', async () => {
  const f = await fixture(async function* (_options, tools) {
    const invalid = await tools[0]!.handler({rows:[{...row,date:'2026-02-30'}]}, {});
    assert.equal(invalid.isError, true);
    assert.ok(!JSON.stringify(invalid).includes('2026-02-30'));
    await tools[0]!.handler({rows:[row]}, {});
    yield success;
  });
  assert.equal((await f.runtime(input)).proposedRows?.length, 1);
});

test('cancelled calls clean up even when SDK next never settles', async () => {
  const controller = new AbortController();
  const f = await fixture(async function* () { controller.abort(); await new Promise(() => {}); yield success; });
  await assert.rejects(f.runtime({...input,signal:controller.signal}), {code:'agent_cancelled'});
  assert.equal(f.closed(), true);
  await assert.rejects(access(f.options().cwd!));
});

test('oversized output and token usage are rejected', async () => {
  for (const event of [{...success,result:'x'.repeat(8001)}, {...success,modelUsage:{model:{inputTokens:32000,outputTokens:10}}}]) {
    const f = await fixture(async function* () { yield event as unknown as SDKMessage; });
    await assert.rejects(f.runtime(input), {code:'agent_limit_exceeded'});
  }
});

test('remote run cancellation prevents tool execution', async () => {
  const f = await fixture(async function* (_options, tools) {
    await tools[0]!.handler({rows:[row]}, {}); yield success;
  });
  await assert.rejects(f.runtime({...input,assertActive:async () => {throw new Error('remote cancelled');}}), {code:'agent_cancelled'});
});

test('deadline and synchronous SDK failures always remove private directories', async () => {
  const oldTimeout = config.agent.timeoutMs; config.agent.timeoutMs = 15;
  try {
    const f = await fixture(async function* () {await new Promise(() => {});yield success;});
    await assert.rejects(f.runtime(input), {code:'agent_timeout'});
    await assert.rejects(access(f.options().cwd!));
    const broken = await fixture(async function* () {yield {type:'system'}; throw new Error('secret provider payload');});
    await assert.rejects(broken.runtime(input), {code:'agent_provider_error',message:'agent_provider_error'});
    await assert.rejects(access(broken.options().cwd!));
  } finally {config.agent.timeoutMs = oldTimeout;}
});

test('spawn override drops injected SDK environment secrets and private directory is deleted', async () => {
  const f = await fixture(async function* (options) {
    const child = options.spawnClaudeCodeProcess!({command:process.execPath,args:['-e','process.stdout.write(JSON.stringify({db:process.env.DATABASE_URL,jwt:process.env.JWT_SECRET,proxy:process.env.HTTPS_PROXY,config:process.env.CLAUDE_CONFIG_DIR}))'],env:{DATABASE_URL:'private-db',JWT_SECRET:'private-jwt',HTTPS_PROXY:'private-proxy'},signal:new AbortController().signal});
    let data = '';
    for await (const chunk of child.stdout) data += String(chunk);
    assert.deepEqual(JSON.parse(data), {config:options.env!.CLAUDE_CONFIG_DIR});
    yield success;
  });
  await f.runtime(input);
  await assert.rejects(access(f.options().cwd!));
});

test('token budget stops an active SDK loop before another tool can run', async () => {
  const f = await fixture(async function* (_options, tools) {
    yield {type:'assistant',message:{id:'one',content:[],usage:{input_tokens:32000,output_tokens:2}}};
    await tools[0]!.handler({rows:[row]}, {});
    yield success;
  });
  await assert.rejects(f.runtime(input), {code:'agent_limit_exceeded'});
});

test('unexpected built-in tools in SDK initialization fail closed', async () => {
  const f = await fixture(async function* () {yield {type:'system',subtype:'init',tools:['Bash', 'mcp__draft__propose_transactions']};yield success;});
  await assert.rejects(f.runtime(input), {code:'agent_provider_error'});
});

test('tool hook bounds attempts even when schema validation prevents the handler', async () => {
  const f = await fixture(async function* (options) {
    const hook = options.hooks!.PreToolUse![0]!.hooks[0]!;
    for(let i=0;i<9;i++) await hook({hook_event_name:'PreToolUse',tool_name:'mcp__draft__propose_transactions',tool_input:{bad:'schema'},tool_use_id:String(i)} as never, String(i), {signal:new AbortController().signal});
    yield success;
  });
  await assert.rejects(f.runtime(input), {code:'agent_limit_exceeded'});
});
