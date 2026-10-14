import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const root=process.env.TERMPOCKET_PROBE_ROOT||'/private/tmp/termpocket-agent-probe';
const read=n=>JSON.parse(readFileSync(`${root}/${n}.private.json`));
const metadata=n=>JSON.parse(readFileSync(`${root}/${n}.metadata.private.json`));
const files=path=>readdirSync(path,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path+'/'+e.name):[path+'/'+e.name]);
const final=a=>a.findLast(m=>m.type==='result');
const blocks=(a,type)=>a.filter(m=>m.type===type).flatMap(m=>m.message?.content??[]);
const multi=read('multiple'), resume=read('continuation'), restricted=read('restriction'), errors=read('tool-errors'), invalid=read('invalid-credentials');
assert.equal(final(multi).is_error,false);
for(const a of [multi,resume,restricted,errors,invalid]){const init=a.find(m=>m.type==='system'&&m.subtype==='init');assert.ok(init);assert.ok(init.tools.every(t=>t.startsWith('mcp__fiction__')));}
assert.equal(metadata('restriction').calls.includes('FORBIDDEN_EXECUTED'),false);
for(const code of ['CANARY-318','CANARY-271']) {assert.ok(final(multi).result.includes(code));assert.ok(final(resume).result.includes(code));}
assert.equal(final(multi).session_id,final(resume).session_id);
assert.equal(blocks(multi,'assistant').filter(b=>b.type==='tool_use').length,2);
assert.equal(blocks(multi,'user').filter(b=>b.type==='tool_result').length,2);
assert.equal(blocks(resume,'assistant').filter(b=>b.type==='tool_use').length,0);
assert.equal(final(restricted).permission_denials[0].tool_name,'mcp__fiction__forbidden');
assert.ok(blocks(restricted,'user').some(b=>b.type==='tool_result'&&b.is_error));
assert.equal(blocks(errors,'user').filter(b=>b.type==='tool_result'&&b.is_error).length,2);
assert.equal(final(invalid).api_error_status,401);assert.equal(final(invalid).is_error,true);
for(const name of ['cancel','deadline'])assert.ok(read(name).some(m=>m.caught));
assert.ok(final(multi).usage.input_tokens>0);assert.ok(final(multi).usage.output_tokens>0);
for(const name of ['turn-limit','stateless','stateless-replay']){const r=final(read(name));assert.equal(files(root+'/private-config').some(f=>f.endsWith('/'+r.session_id+'.jsonl')),false);}
assert.equal(final(read('turn-limit')).subtype,'error_max_turns');
assert.ok(final(read('stateless-replay')).result.includes('CANARY-318'));
assert.deepEqual(metadata('stateless-replay').calls,[]);
assert.ok(metadata('deadline').deadline);
assert.deepEqual(metadata('restriction').calls,[]);
const report={sdkVersion:'0.3.300',claudeCodeVersion:'2.1.300',model:'deepseek-flash',endpoint:'https://api.deepseek.com/anthropic',turnLimitEnforced:true,persistSessionFalseVerified:true,statelessApplicationHistoryReplayVerified:true,realToolRoundtrips:2,resumeRecalledBothToolResultCanaries:true,restrictionAttemptDenied:true,controlledErrorsReceived:2,cancelAndDeadlineAborted:true,invalidKeyStatus:401,usageTokensReported:true,priceBasis:final(multi).modelUsage['deepseek-flash'].costBasis,builtinToolsExposed:false};
writeFileSync(root+'/verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
