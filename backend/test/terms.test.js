const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  isTermId, termOf, boundsOf, labelOf,
  currentTerm, previousTerm, nextTerm, lastNTerms,
} = require('../utils/terms');

/**
 * The term calendar. Two callers will depend on this agreeing with itself: the
 * summary views and the retention job, which deletes whole terms. A boundary
 * that is wrong here is wrong in both, and the disagreement between a chart and
 * a deletion is not something anyone would notice quickly.
 *
 * Run under three timezones by `npm test` (see package.json) — the module
 * formats dates by arithmetic rather than `toISOString()`, and this is what
 * holds it to that.
 */

describe('termOf', () => {
  test('maps each term to its four months', () => {
    for (const [date, expected] of [
      ['2026-01-01', '2026-winter'], ['2026-04-30', '2026-winter'],
      ['2026-05-01', '2026-spring'], ['2026-08-31', '2026-spring'],
      ['2026-09-01', '2026-fall'],   ['2026-12-31', '2026-fall'],
    ]) {
      assert.equal(termOf(date), expected, date);
    }
  });

  test('accepts a Date as well as a string', () => {
    // pg materialises a DATE column as local midnight, so the local getters are
    // what round-trip what the driver produced.
    assert.equal(termOf(new Date(2026, 5, 15)), '2026-spring');
  });

  test('accepts a full timestamp string', () => {
    assert.equal(termOf('2026-06-15T23:59:59.999Z'), '2026-spring');
  });

  test('handles a leap day', () => {
    assert.equal(termOf('2028-02-29'), '2028-winter');
  });

  test('rejects what is not a date', () => {
    for (const junk of [undefined, null, '', 'yesterday', '2026-6-1', 42, new Date('nope')]) {
      assert.throws(() => termOf(junk), TypeError, `accepted ${JSON.stringify(junk)}`);
    }
  });
});

describe('boundsOf', () => {
  test('gives half-open bounds', () => {
    assert.deepEqual(boundsOf('2026-winter'), { start: '2026-01-01', end: '2026-05-01' });
    assert.deepEqual(boundsOf('2026-spring'), { start: '2026-05-01', end: '2026-09-01' });
  });

  test('rolls Fall into January of the next year', () => {
    assert.deepEqual(boundsOf('2026-fall'), { start: '2026-09-01', end: '2027-01-01' });
  });

  test('consecutive terms share a boundary exactly', () => {
    // What makes the half-open form worth having: no gaps, no overlaps, and no
    // end-of-month arithmetic anywhere.
    let term = '2025-winter';
    for (let i = 0; i < 8; i++) {
      const next = nextTerm(term);
      assert.equal(boundsOf(term).end, boundsOf(next).start, `${term} -> ${next}`);
      term = next;
    }
  });

  test('rejects a malformed id', () => {
    for (const junk of ['2026-summer', '26-spring', 'spring-2026', '2026', '', null]) {
      assert.throws(() => boundsOf(junk), TypeError, `accepted ${JSON.stringify(junk)}`);
    }
  });
});

describe('every day of a year lands in exactly one term', () => {
  // The property that matters, checked exhaustively rather than at the corners:
  // a transaction can never fall outside every term, or inside two.
  test('and inside that term\'s own bounds', () => {
    for (const year of [2025, 2026, 2028]) {
      for (let month = 0; month < 12; month++) {
        for (const day of [1, 15, 28]) {
          const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const term = termOf(date);
          const { start, end } = boundsOf(term);
          assert.ok(date >= start && date < end, `${date} not within ${term} [${start}, ${end})`);
        }
      }
    }
  });
});

describe('stepping between terms', () => {
  test('previousTerm crosses the year boundary', () => {
    assert.equal(previousTerm('2026-winter'), '2025-fall');
  });

  test('nextTerm crosses it the other way', () => {
    assert.equal(nextTerm('2025-fall'), '2026-winter');
  });

  test('they invert each other', () => {
    for (const term of ['2026-winter', '2026-spring', '2026-fall']) {
      assert.equal(previousTerm(nextTerm(term)), term);
      assert.equal(nextTerm(previousTerm(term)), term);
    }
  });
});

describe('lastNTerms', () => {
  const AUG_2026 = new Date(2026, 7, 29);

  test('returns n terms, oldest first, ending with the current one', () => {
    assert.deepEqual(lastNTerms(6, AUG_2026), [
      '2024-fall', '2025-winter', '2025-spring', '2025-fall', '2026-winter', '2026-spring',
    ]);
  });

  test('six terms is two years', () => {
    // The retention number from item 20. The cutoff is the first term's start.
    const terms = lastNTerms(6, AUG_2026);
    assert.equal(boundsOf(terms[0]).start, '2024-09-01');
    assert.equal(termOf(AUG_2026), terms[terms.length - 1]);
  });

  test('one term is just the current one', () => {
    assert.deepEqual(lastNTerms(1, AUG_2026), ['2026-spring']);
  });

  test('has no duplicates and is strictly ordered', () => {
    const terms = lastNTerms(12, AUG_2026);
    assert.equal(new Set(terms).size, 12);
    for (let i = 1; i < terms.length; i++) {
      assert.equal(nextTerm(terms[i - 1]), terms[i]);
    }
  });

  test('rejects a count that is not a positive whole number', () => {
    for (const n of [0, -1, 1.5, NaN, '6', undefined]) {
      assert.throws(() => lastNTerms(n, AUG_2026), RangeError, `accepted ${String(n)}`);
    }
  });
});

describe('labels and validation', () => {
  test('labelOf reads as a chart title', () => {
    assert.equal(labelOf('2026-spring'), 'Spring 2026');
    assert.equal(labelOf('2025-fall'), 'Fall 2025');
  });

  test('isTermId accepts ids and rejects everything else', () => {
    for (const good of ['2026-winter', '2026-spring', '2026-fall', '1999-fall']) {
      assert.ok(isTermId(good), good);
    }
    for (const bad of ['2026-summer', '2026-SPRING', ' 2026-spring', '2026-spring ', '', null, undefined, 2026]) {
      assert.ok(!isTermId(bad), JSON.stringify(bad));
    }
  });

  test('currentTerm agrees with termOf on the same instant', () => {
    const now = new Date();
    assert.equal(currentTerm(now), termOf(now));
  });
});

describe('output does not depend on the process timezone', () => {
  // The bug this rules out: `new Date(2026, 4, 1).toISOString()` yields
  // '2026-04-30' under TZ=Asia/Shanghai, because local midnight on May 1 is
  // April 30 in UTC. getRollingSummary builds its window exactly that way
  // today; it only escapes because the server runs UTC.
  //
  // Node applies a change to process.env.TZ to Date objects created after it,
  // so the sweep runs in-process — no wrapper script to remember, and it runs
  // in CI like everything else. `node --test` gives each file its own process,
  // but TZ is restored anyway so ordering here cannot matter.
  const saved = process.env.TZ;
  after(() => { process.env.TZ = saved; });

  for (const tz of ['UTC', 'America/Toronto', 'Asia/Shanghai', 'Pacific/Kiritimati']) {
    test(`same answers under TZ=${tz}`, () => {
      process.env.TZ = tz;

      assert.equal(termOf('2026-05-01'), '2026-spring');
      assert.deepEqual(boundsOf('2026-spring'), { start: '2026-05-01', end: '2026-09-01' });
      assert.deepEqual(boundsOf('2026-fall'), { start: '2026-09-01', end: '2027-01-01' });

      // A Date built locally must land in the right term in every zone. This is
      // the shape pg hands back for a DATE column.
      assert.equal(termOf(new Date(2026, 4, 1)), '2026-spring');
      assert.equal(termOf(new Date(2026, 8, 1)), '2026-fall');

      assert.deepEqual(lastNTerms(2, new Date(2026, 7, 29)), ['2026-winter', '2026-spring']);
    });
  }

  test('Kiritimati is UTC+14, so it would catch a toISOString() slip', () => {
    // Guards the guard: if the sweep above silently stopped changing anything,
    // this fails and says so.
    process.env.TZ = 'Pacific/Kiritimati';
    assert.notEqual(
      new Date(2026, 4, 1).toISOString().split('T')[0],
      '2026-05-01',
      'the timezone sweep is not taking effect; these tests prove nothing'
    );
    assert.equal(boundsOf('2026-spring').start, '2026-05-01');
  });
});
