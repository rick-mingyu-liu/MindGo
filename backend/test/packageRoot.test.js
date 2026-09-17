const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { packageRoot } = require('../utils/packageRoot');

/**
 * Compiled code runs from dist/, one level below the source it came from, so
 * a path built from __dirname points somewhere else after the build. Files
 * that are not code (schema.sql, test fixtures, eval/) are found from the
 * package root instead, which is the same directory either way.
 */
describe('packageRoot', () => {
  test('finds backend/ from inside it, source or compiled', () => {
    const root = packageRoot(__dirname);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).name,
      'personal-finance-backend');
    assert.ok(fs.existsSync(path.join(root, 'db', 'schema.sql')));
  });

  test('stops at the nearest package.json', () => {
    const top = fs.mkdtempSync(path.join(os.tmpdir(), 'mindgo-root-'));
    try {
      fs.writeFileSync(path.join(top, 'package.json'), '{}');
      const deep = path.join(top, 'a', 'b');
      fs.mkdirSync(deep, { recursive: true });
      assert.equal(packageRoot(deep), top);
    } finally {
      fs.rmSync(top, { recursive: true, force: true });
    }
  });

  test('throws when there is none', () => {
    assert.throws(() => packageRoot(path.parse(process.cwd()).root), /no package\.json above/);
  });
});
