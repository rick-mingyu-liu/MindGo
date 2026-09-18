import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseOcr } from '../services/import/parse';
import { packageRoot } from '../utils/packageRoot';

const ROOT = packageRoot(__dirname);
const { scoreImage, sumCounts, rates } = require(path.join(ROOT, '..', 'eval', 'lib', 'score.cjs'));

/**
 * Replays recorded OCR output from the synthetic benchmark through the parser.
 *
 * The fixtures are what the shipped OCR model actually returned for each
 * image (eval/exportFixtures.mjs writes them), so this is the benchmark
 * without the model: fast, deterministic, and runnable in CI.
 *
 * What must never regress is the silent part. A parser change that makes some
 * row wrong *and unflagged* fails here, whatever it does to the averages.
 */
const DIR = path.join(ROOT, 'test', 'fixtures', 'ocr');
const fixtures = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()
  .map((file) => ({ file, ...JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8')) }));

describe('recorded OCR fixtures', () => {
  test('are present', () => {
    assert.ok(fixtures.length >= 40, `only ${fixtures.length} fixtures; run eval/exportFixtures.mjs`);
  });

  const all: unknown[] = [];
  for (const fixture of fixtures) {
    test(fixture.file, () => {
      const result = parseOcr({ lines: fixture.lines, image: fixture.image, today: fixture.today });
      assert.equal(result.layout, fixture.layout, 'layout');
      const { counts, failures, extra } = scoreImage(result.rows, fixture.truth);
      all.push(counts);
      const detail = JSON.stringify({ failures, extra }, null, 2);
      assert.equal(counts.silentAmountErrors, 0, `a wrong amount went unflagged:\n${detail}`);
      assert.equal(counts.silentTypeErrors, 0, `a wrong direction went unflagged:\n${detail}`);
      assert.equal(counts.silentExtraRows, 0, `an invented row went unflagged:\n${detail}`);
    });
  }

  test('find nearly every row, with the right amount', () => {
    const r = rates(sumCounts(all));
    assert.ok(r.recall >= 0.95, `recall ${r.recall}`);
    assert.ok(r.amountExact >= 0.98, `amounts exact ${r.amountExact}`);
  });
});
