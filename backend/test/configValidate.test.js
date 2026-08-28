const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/**
 * The startup check exits the process, so it is exercised in a child rather
 * than in-process.
 *
 * dotenv reads .env from the working directory, so each run happens in a temp
 * directory holding an empty one — otherwise the developer's real .env would
 * satisfy every case and these would all pass vacuously.
 */

const VALIDATE = path.join(__dirname, '..', 'config', 'validate.js');
let cwd;

before(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'mindgo-config-'));
  fs.writeFileSync(path.join(cwd, '.env'), '');
});

after(() => fs.rmSync(cwd, { recursive: true, force: true }));

/**
 * Runs the validator with exactly `env` set, and nothing inherited.
 * spawnSync rather than execFileSync because the warnings go to stderr, which
 * execFileSync discards on a zero exit.
 */
function runWith(env) {
  const result = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(VALIDATE)})()`], {
    cwd,
    env: { PATH: process.env.PATH, ...env },
    encoding: 'utf8',
  });
  return { code: result.status, output: `${result.stdout || ''}${result.stderr || ''}` };
}

const GOOD_SECRET = 'x'.repeat(40);

describe('startup configuration check', () => {
  test('exits non-zero when nothing is configured', () => {
    const { code, output } = runWith({});
    assert.equal(code, 1);
    assert.match(output, /JWT_SECRET is not set/);
    assert.match(output, /No database configuration/);
  });

  test('exits when only the database is configured', () => {
    const { code, output } = runWith({ DATABASE_URL: 'postgres://x/y' });
    assert.equal(code, 1);
    assert.match(output, /JWT_SECRET is not set/);
    assert.doesNotMatch(output, /No database configuration/);
  });

  test('exits when only the secret is configured', () => {
    const { code, output } = runWith({ JWT_SECRET: GOOD_SECRET });
    assert.equal(code, 1);
    assert.match(output, /No database configuration/);
    assert.doesNotMatch(output, /JWT_SECRET is not set/);
  });

  test('names which discrete database parts are missing', () => {
    const { code, output } = runWith({ JWT_SECRET: GOOD_SECRET, DB_USER: 'u' });
    assert.equal(code, 1);
    assert.match(output, /missing: DB_HOST, DB_DATABASE/);
  });

  test('accepts a complete set of discrete parts instead of a URL', () => {
    const { code } = runWith({
      JWT_SECRET: GOOD_SECRET,
      DB_USER: 'u',
      DB_HOST: 'h',
      DB_DATABASE: 'd',
    });
    assert.equal(code, 0);
  });

  test('starts, but warns, on a short secret', () => {
    const { code, output } = runWith({ JWT_SECRET: 'short', DATABASE_URL: 'postgres://x/y' });
    assert.equal(code, 0, 'a weak secret is a warning, not a refusal to boot');
    assert.match(output, /JWT_SECRET is only 5 characters/);
  });

  test('warns for each missing optional key, naming what it breaks', () => {
    const { code, output } = runWith({ JWT_SECRET: GOOD_SECRET, DATABASE_URL: 'postgres://x/y' });
    assert.equal(code, 0);
    assert.match(output, /OPENAI_API_KEY is not set/);
    assert.match(output, /MAILBOXLAYER_API_KEY is not set/);
    // The consequence matters more than the name: this key is documented as
    // optional but registration 500s without it.
    assert.match(output, /registration fails outright/);
  });

  test('is silent when everything is present', () => {
    const { code, output } = runWith({
      JWT_SECRET: GOOD_SECRET,
      DATABASE_URL: 'postgres://x/y',
      OPENAI_API_KEY: 'k',
      EMAIL_USER: 'u',
      EMAIL_PASS: 'p',
      FINNHUB_API_KEY: 'k',
      MAILBOXLAYER_API_KEY: 'k',
    });
    assert.equal(code, 0);
    assert.equal(output.trim(), '');
  });
});
