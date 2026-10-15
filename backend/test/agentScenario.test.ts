import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calculateScenario, addMonthsClamped, fullMonthsBetween, daysInMonth, type RateLookup } from '../services/agent/scenario';
import { decimalCents, formatCents } from '../services/agent/validation';

/** calculate_scenario: a pure projection in integer cents over plain day strings. */

const noRates: RateLookup = async () => assert.fail('no conversion expected');
const today = '2026-10-14';
const run = (input: Record<string, unknown>, rate: RateLookup = noRates) => calculateScenario(input, today, rate);
const event = (over: Record<string, unknown> = {}) => ({ label: 'Rent', kind: 'expense', amount: '900', date: '2026-11-01', ...over });
const base = { currency: 'CAD', start: '2026-10-14', end_exclusive: '2027-01-01' };
const rejects = (input: Record<string, unknown>) => assert.rejects(run(input), { code: 'agent_invalid_input' });

describe('amount helpers', () => {
  test('decimal strings become exact cents and back', () => {
    assert.equal(decimalCents('0.1'), 10);
    assert.equal(decimalCents('12'), 1200);
    assert.equal(decimalCents('99999999.99'), 9_999_999_999);
    assert.equal(decimalCents('-5.05', { min: -1000, negative: true }), -505);
    for (const bad of ['1.234', '1e3', '-1', ' 1', '', '100000000', '0x10']) assert.throws(() => decimalCents(bad), { code: 'agent_invalid_input' });
    assert.throws(() => decimalCents('0', { min: 1 }), { code: 'agent_invalid_input' });
    assert.equal(formatCents(-1234), '-12.34');
    assert.equal(formatCents(5), '0.05');
    assert.equal(formatCents(0), '0.00');
  });
});

describe('calendar arithmetic', () => {
  test('monthly repeats keep the day of month, clamped to the month end, leap years included', () => {
    assert.deepEqual([0, 1, 2, 3].map(n => addMonthsClamped('2027-01-31', n)), ['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
    assert.equal(addMonthsClamped('2028-01-31', 1), '2028-02-29');
    assert.equal(addMonthsClamped('2026-12-15', 1), '2027-01-15');
    assert.equal(daysInMonth(2100, 2), 28);
    assert.equal(daysInMonth(2000, 2), 29);
  });

  test('whole months between two days', () => {
    assert.equal(fullMonthsBetween('2026-10-14', '2027-04-14'), 6);
    assert.equal(fullMonthsBetween('2026-10-14', '2027-04-13'), 5);
    assert.equal(fullMonthsBetween('2026-10-14', '2026-10-01'), 0);
    assert.equal(fullMonthsBetween('2026-10-14', '2026-10-14'), 0);
  });
});

describe('validation', () => {
  test('window: start inclusive before end, at most 731 days, real days', async () => {
    await rejects({ ...base, end_exclusive: base.start });
    await rejects({ ...base, end_exclusive: '2028-10-15', events: [event()] });
    await rejects({ ...base, start: '2026-02-30', events: [event()] });
    const ok = await run({ ...base, end_exclusive: '2028-10-14', events: [event()] });
    assert.equal(ok.window.days, 731);
  });

  test('events, amounts, currencies, repeats and unknown keys are bounded', async () => {
    await rejects({ ...base, events: [] });
    await rejects({ ...base, events: Array.from({ length: 41 }, () => event()) });
    await rejects({ ...base, events: [event({ amount: '0' })] });
    await rejects({ ...base, events: [event({ amount: '100000000.00' })] });
    await rejects({ ...base, events: [event({ amount: 900 })] });
    await rejects({ ...base, events: [event({ currency: 'JPY' })] });
    await rejects({ ...base, events: [event({ label: 'x'.repeat(61) })] });
    await rejects({ ...base, events: [event({ kind: 'transfer' })] });
    await rejects({ ...base, events: [event({ repeat: { every: 'day', until_exclusive: '2027-01-01' } })] });
    await rejects({ ...base, events: [event({ repeat: { every: 'week', until_exclusive: '2026-11-01' } })] });
    await rejects({ ...base, events: [event({ user_id: 1 })] });
    await rejects({ ...base, user_id: 1, events: [event()] });
    await rejects({ ...base, events: [event()], starting_cash: { amount: '100', as_of: '2026-10-15' } });
    await rejects({ ...base, events: [event()], goal: { target_amount: '0', current_amount: '0', deadline: '2027-01-01' } });
  });

  test('more than 600 occurrences inside the window is refused', async () => {
    const weekly = (label: string) => event({ label, date: '2026-10-14', repeat: { every: 'week', until_exclusive: '2028-10-14' } });
    // 105 weekly occurrences each: five events fit (525), six do not (630).
    const window = { ...base, end_exclusive: '2028-10-14' };
    assert.equal((await run({ ...window, events: ['a', 'b', 'c', 'd', 'e'].map(weekly) })).occurrences, 525);
    await rejects({ ...window, events: ['a', 'b', 'c', 'd', 'e', 'f'].map(weekly) });
  });

  test('start defaults to the conversation day', async () => {
    const out = await run({ currency: 'CAD', end_exclusive: '2026-11-01', events: [event({ date: '2026-10-20' })] });
    assert.deepEqual(out.window, { start: today, end_exclusive: '2026-11-01', days: 18 });
  });
});

describe('projection', () => {
  test('repeats expand inside [start, end), outside dates are counted as ignored', async () => {
    const out = await run({
      ...base,
      events: [
        event({ label: 'Pay', kind: 'income', amount: '1000.10', date: '2026-09-30', repeat: { every: 'month', until_exclusive: '2030-01-01' } }),
        event({ label: 'Groceries', amount: '50.05', date: '2026-10-14', repeat: { every: 'week', until_exclusive: '2026-11-04' } }),
        event({ label: 'Last day', amount: '1', date: '2026-12-31' }),
        event({ label: 'Too late', amount: '1', date: '2027-01-01' }),
      ],
    });
    // Pay: Oct 30 (Sep 30 anchor), Nov 30, Dec 30. Groceries: Oct 14, 21, 28.
    assert.equal(out.totals.income, '3000.30');
    assert.equal(out.totals.expenses, '151.15');
    assert.equal(out.totals.net, '2849.15');
    assert.deepEqual(out.by_month.map(m => [m.month, m.income, m.expenses, m.closing_balance]), [
      ['2026-10', '1000.10', '150.15', null], ['2026-11', '1000.10', '0.00', null], ['2026-12', '1000.10', '1.00', null],
    ]);
    assert.deepEqual(out.ignored, [{ label: 'Pay', before_start: 1, after_end: 36 }, { label: 'Too late', before_start: 0, after_end: 1 }]);
  });

  test('two_weeks repeats every 14 days from the anchor: biweekly pay, not twice a month and not weekly', async () => {
    const pay = (every: string) => event({ label: 'Co-op pay', kind: 'income', amount: '2400', date: '2026-09-04', repeat: { every, until_exclusive: '2027-01-01' } });
    const out = await run({ ...base, events: [pay('two_weeks')] });
    // Sep 4, 18 and Oct 2 fall before the window; Oct 16, 30, Nov 13, 27, Dec 11, 25 inside; Jan 8 is past until_exclusive.
    assert.equal(out.occurrences, 6);
    assert.equal(out.totals.income, '14400.00');
    assert.deepEqual(out.by_month.map(m => [m.month, m.income]), [['2026-10', '4800.00'], ['2026-11', '4800.00'], ['2026-12', '4800.00']]);
    assert.deepEqual(out.ignored, [{ label: 'Co-op pay', before_start: 3, after_end: 0 }]);
    // The same pay repeated weekly would nearly double it: the mistake two_weeks exists to prevent.
    assert.equal((await run({ ...base, events: [pay('week')] })).occurrences, 11);
    // Across a leap day the step stays 14 calendar days.
    const leap = await run({ currency: 'CAD', start: '2028-02-01', end_exclusive: '2028-03-15', events: [event({ date: '2028-02-15', repeat: { every: 'two_weeks', until_exclusive: '2028-03-15' } })], starting_cash: { amount: '5000', as_of: '2028-02-01' } });
    assert.equal(leap.occurrences, 3);
    assert.deepEqual(leap.lowest, { balance: '2300.00', date: '2028-03-14' });
    await rejects({ ...base, events: [event({ repeat: { every: 'two_weeks', until_exclusive: '2026-11-01' } })] });
  });

  test('month-end repeats clamp through February in a leap year', async () => {
    const out = await run({ currency: 'CAD', start: '2028-01-01', end_exclusive: '2028-05-01', events: [event({ date: '2028-01-31', amount: '10', repeat: { every: 'month', until_exclusive: '2028-05-01' } })], starting_cash: { amount: '100', as_of: '2028-01-01' } });
    assert.deepEqual(out.by_month.map(m => m.expenses), ['10.00', '10.00', '10.00', '10.00']);
    assert.deepEqual(out.lowest, { balance: '60.00', date: '2028-04-30' });
  });

  test('without starting cash: no balances, incomplete, and the model is told not to claim affordability', async () => {
    const out = await run({ ...base, reserve: '500', events: [event()] });
    assert.equal(out.status, 'incomplete');
    assert.deepEqual(out.missing, ['starting_cash']);
    assert.equal(out.starting_cash, null);
    assert.equal(out.lowest, null);
    assert.deepEqual(out.reserve, { amount: '500.00', shortfall: null, first_breach_date: null });
    assert.ok(out.by_month.every(m => m.closing_balance === null));
    assert.ok(out.notes.some(n => /do not say anything is affordable/.test(n)));
  });

  test('with starting cash: end-of-day balances, lowest point, closing balances and the first reserve breach', async () => {
    const out = await run({
      ...base, reserve: '200', starting_cash: { amount: '1000', as_of: '2026-10-01' },
      events: [
        event({ label: 'Pay', kind: 'income', amount: '300', date: '2026-11-15' }),
        event({ label: 'Rent', amount: '900', date: '2026-11-01' }),
        // Same day as the pay: the day nets out before the balance is read.
        event({ label: 'Books', amount: '250', date: '2026-11-15' }),
      ],
    });
    assert.equal(out.status, 'complete');
    assert.deepEqual(out.missing, []);
    assert.deepEqual(out.starting_cash, { amount: '1000.00', as_of: '2026-10-01' });
    assert.deepEqual(out.lowest, { balance: '100.00', date: '2026-11-01' });
    assert.deepEqual(out.reserve, { amount: '200.00', shortfall: '100.00', first_breach_date: '2026-11-01' });
    assert.deepEqual(out.by_month.map(m => m.closing_balance), ['1000.00', '150.00', '150.00']);
    assert.ok(out.notes.some(n => /as of 2026-10-01/.test(n)));
  });

  test('a reserve never breached has zero shortfall; negative starting cash breaches on day one', async () => {
    const fine = await run({ ...base, reserve: '10', starting_cash: { amount: '100', as_of: base.start }, events: [event({ amount: '5' })] });
    assert.deepEqual(fine.reserve, { amount: '10.00', shortfall: '0.00', first_breach_date: null });
    const owing = await run({ ...base, reserve: '0', starting_cash: { amount: '-20.50', as_of: base.start }, events: [event({ kind: 'income', amount: '100' })] });
    assert.deepEqual(owing.reserve, { amount: '0.00', shortfall: '20.50', first_breach_date: base.start });
    assert.deepEqual(owing.lowest, { balance: '-20.50', date: base.start });
  });

  test('the start day is read after its own events: income that day prevents a breach, an expense that day is the low point', async () => {
    const saved = await run({ ...base, reserve: '200', starting_cash: { amount: '100', as_of: base.start }, events: [event({ kind: 'income', amount: '500', date: base.start })] });
    assert.deepEqual(saved.lowest, { balance: '600.00', date: base.start });
    assert.deepEqual(saved.reserve, { amount: '200.00', shortfall: '0.00', first_breach_date: null });
    const spent = await run({ ...base, reserve: '500', starting_cash: { amount: '1000', as_of: base.start }, events: [event({ amount: '900', date: base.start }), event({ kind: 'income', amount: '50', date: '2026-10-20' })] });
    assert.deepEqual(spent.lowest, { balance: '100.00', date: base.start });
    assert.deepEqual(spent.reserve, { amount: '500.00', shortfall: '400.00', first_breach_date: base.start });
  });

  test('other currencies convert once per event at the listed rate; a missing rate is an error', async () => {
    const calls: string[] = [];
    const rate = async (from: string, to: string) => { calls.push(`${from}>${to}`); return from === 'USD' ? 1.3333 : 0.19; };
    const out = await run({ ...base, events: [
      event({ label: 'US', amount: '10.00', currency: 'USD', repeat: { every: 'month', until_exclusive: '2027-01-01' } }),
      event({ label: 'CN', kind: 'income', amount: '100', currency: 'CNY' }),
      event({ label: 'US again', amount: '1', currency: 'USD' }),
    ] }, rate);
    assert.deepEqual(calls, ['CNY>CAD', 'USD>CAD']);
    // 10.00 USD * 1.3333 = 13.333 -> 13.33, twice; 1 USD -> 1.33; 100 CNY -> 19.00.
    assert.equal(out.totals.expenses, '27.99');
    assert.equal(out.totals.income, '19.00');
    assert.deepEqual(out.rates, [{ from: 'CNY', to: 'CAD', rate: 0.19 }, { from: 'USD', to: 'CAD', rate: 1.3333 }]);
    assert.ok(out.notes.some(n => /current exchange rates/.test(n)));
    await assert.rejects(run({ ...base, events: [event({ currency: 'USD' })] }, async () => { throw new Error('offline'); }), { code: 'agent_rate_unavailable' });
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      await assert.rejects(run({ ...base, events: [event({ currency: 'USD' })] }, async () => bad), { code: 'agent_rate_unavailable' });
    }
  });

  test('goal: remaining, whole months left and the monthly amount rounded up to the cent', async () => {
    const out = await run({ ...base, events: [event({ kind: 'income', amount: '400', date: '2026-11-01' })], goal: { target_amount: '1000', current_amount: '0.01', deadline: '2027-01-14' } });
    // 999.99 over 3 months is 333.33 rounded up to 333.33; covered needs the window to reach the deadline.
    assert.deepEqual(out.goal, { remaining: '999.99', months_left: 3, monthly_needed: '333.33', covered_by_projected_net: null });
    const odd = await run({ ...base, end_exclusive: '2027-02-01', events: [event({ kind: 'income', amount: '1000', date: '2026-12-01' })], goal: { target_amount: '100', current_amount: '0', deadline: '2027-01-14' } });
    // 100.00 / 3 = 33.333... -> 33.34
    assert.deepEqual(odd.goal, { remaining: '100.00', months_left: 3, monthly_needed: '33.34', covered_by_projected_net: true });
  });

  test('goal: a deadline in the past or this month needs everything now; a reached goal needs nothing', async () => {
    const past = await run({ ...base, events: [event()], goal: { target_amount: '500', current_amount: '100', deadline: '2026-01-01' } });
    assert.deepEqual(past.goal, { remaining: '400.00', months_left: 0, monthly_needed: '400.00', covered_by_projected_net: false });
    const reached = await run({ ...base, events: [event()], goal: { target_amount: '500', current_amount: '600', deadline: '2026-12-01' } });
    assert.deepEqual(reached.goal, { remaining: '0.00', months_left: 1, monthly_needed: '0.00', covered_by_projected_net: true });
  });

  test('goal coverage counts events on the deadline day and none after it', async () => {
    const goal = { target_amount: '100', current_amount: '0', deadline: '2026-11-01' };
    const onDay = await run({ ...base, events: [event({ kind: 'income', amount: '100', date: '2026-11-01' })], goal });
    assert.equal(onDay.goal!.covered_by_projected_net, true);
    const after = await run({ ...base, events: [event({ kind: 'income', amount: '100', date: '2026-11-02' })], goal });
    assert.equal(after.goal!.covered_by_projected_net, false);
  });

  test('month buckets follow day strings, so the result is identical in any process timezone', async () => {
    const input = { ...base, starting_cash: { amount: '0', as_of: base.start }, events: [event({ date: '2026-10-31' }), event({ date: '2026-11-01', kind: 'income' })] };
    const original = process.env.TZ;
    const results = [];
    try {
      for (const tz of ['Pacific/Kiritimati', 'America/Los_Angeles', 'UTC']) { process.env.TZ = tz; results.push(await run(input)); }
    } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
    assert.deepEqual(results[0]!.by_month.map(m => [m.month, m.expenses, m.income]), [['2026-10', '900.00', '0.00'], ['2026-11', '0.00', '900.00'], ['2026-12', '0.00', '0.00']]);
    assert.deepEqual(results[1], results[0]);
    assert.deepEqual(results[2], results[0]);
  });
});
