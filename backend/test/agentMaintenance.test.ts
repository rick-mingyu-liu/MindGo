import { test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import config = require('../config');
import scheduler = require('../services/schedulerService');
import * as cleanup from '../services/cleanupService';
import * as agent from '../services/agent/store';
const wasEnabled=config.agent.enabled;
afterEach(()=>{config.agent.enabled=wasEnabled;mock.restoreAll();});
test('agent cleanup shares hourly sweep and never queries absent tables while disabled',async()=>{
  mock.method(cleanup,'deleteUnverifiedAccounts',async()=>0);
  let calls=0;mock.method(agent,'cleanupAgentData',async()=>{calls++;return 3;});
  config.agent.enabled=false;await scheduler.runMaintenance();assert.equal(calls,0);
  config.agent.enabled=true;const result=await scheduler.runMaintenance();assert.equal(calls,1);assert.equal(result.agentData,3);
});
