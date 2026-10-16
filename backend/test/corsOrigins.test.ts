import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

/** config is read once at load, so each value is checked in a fresh process. */
const originsWith = (value: string | undefined): unknown => {
  const env = { ...process.env };
  if (value === undefined) delete env.CORS_ORIGIN; else env.CORS_ORIGIN = value;
  const result = spawnSync(process.execPath, ['-e',
    `process.stdout.write(JSON.stringify(require(${JSON.stringify(require.resolve('../config'))}).cors.origin))`,
  ], { encoding: 'utf8', env, timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};

test('CORS_ORIGIN takes one origin or a comma-separated list', () => {
  assert.deepEqual(originsWith(undefined), ['http://localhost:3000']);
  assert.deepEqual(originsWith('https://mind-go.vercel.app'), ['https://mind-go.vercel.app']);
  assert.deepEqual(originsWith('https://www.termpocket.com, https://termpocket.com/ ,https://mind-go.vercel.app,'),
    ['https://www.termpocket.com', 'https://termpocket.com', 'https://mind-go.vercel.app']);
});
