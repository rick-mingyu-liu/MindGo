const { extractAmounts, parseDateDetail, splitLeadingDate, toCents } = require('./tokens');

/**
 * A bank app's transaction list: one transaction per row that ends in an
 * amount, dated by the row itself or by the nearest date header above it.
 *
 * OCR can drop a minus sign with high confidence (measured 2026-09-16:
 * "-$23.47" read as "$23.47"), so an unsigned amount is never a confirmed
 * expense: it always carries `type_guessed`.
 *
 * A row with no amount after the first transaction is taken to be a date
 * header even when it does not read as a date — OCR misreads bold grey
 * headers ("Yesterday" -> "Yer", measured) — and ends the previous header's
 * reach. A row with an unknown date is flagged; a row silently given the
 * previous section's date is not.
 */
const INCOME_WORDS = /\b(payroll|salary|deposit|e-?transfer (received|from)|refund|interest|dividend)\b/i;
const STATUS_WORDS = /\b(pending|posted)\b/gi;

function parseBankList(rows, today) {
  const drafts = [];
  let header = null;

  for (const row of rows) {
    const whole = parseDateDetail(row.text, today);
    if (whole) {
      header = { ...whole, conf: row.conf };
      continue;
    }

    const amounts = [];
    const words = [];
    for (const line of row.lines) {
      const { amounts: found, label } = extractAmounts(line.text);
      if (label) words.push({ text: label, conf: line.conf });
      for (const amount of found) amounts.push({ ...amount, conf: line.conf, box: line.box });
    }
    if (amounts.length === 0) {
      if (drafts.length > 0) header = null;
      continue;
    }

    const txn = amounts.length >= 2 ? amounts[amounts.length - 2] : amounts[0];
    const balance = amounts.length >= 2 ? amounts[amounts.length - 1] : null;
    if (toCents(txn.value) === 0) continue;

    let label = words.map((w) => w.text).join(' ').replace(STATUS_WORDS, ' ').replace(/\s+/g, ' ').trim();
    let date = null;
    const lead = splitLeadingDate(label, today);
    if (lead) {
      date = { day: lead.day, inferredYear: lead.inferredYear, conf: row.conf };
      label = lead.rest;
    } else if (header) {
      date = header;
    }

    const flags = [];
    let type;
    if (txn.sign === -1) type = 'expense';
    else if (txn.sign === 1) type = 'income';
    else {
      type = INCOME_WORDS.test(label) ? 'income' : 'expense';
      flags.push('type_guessed');
    }
    if (!date) flags.push('missing_date');
    if (/\bpending\b/i.test(row.text)) flags.push('pending');
    if (txn.corrected) flags.push('corrected_chars');

    drafts.push({
      date: date ? date.day : null,
      amount: txn.value,
      currency: txn.currency || 'CAD',
      description: label,
      type,
      flags,
      conf: {
        amount: txn.conf * (txn.corrected ? 0.8 : 1),
        date: date ? date.conf * (date.inferredYear ? 0.9 : 1) : 0,
        description: label ? Math.min(...words.map((w) => w.conf)) : 0,
        type: flags.includes('type_guessed') ? 0.9 : 1,
      },
      balance,
      boxes: row.lines.map((l) => l.box),
    });
  }

  verifyBalances(drafts);
  return { drafts: drafts.map(({ balance: _balance, ...draft }) => draft) };
}

/**
 * Consecutive running balances must differ by exactly the transaction between
 * them. Lists run newest-first or oldest-first; whichever order more pairs
 * agree with is taken as the list's order. A row the check agrees with is
 * `arithmetic_verified`; a row it disagrees with is `balance_mismatch`.
 *
 * This verifies the amount only, never the direction. A credit card's balance
 * rises with each purchase, and OCR drops minus signs from balances as readily
 * as from amounts, so the sign of a difference proves nothing about whether
 * money came in or went out.
 */
function verifyBalances(drafts) {
  const signedBalance = (d) => (d.balance.sign === -1 ? -1 : 1) * toCents(d.balance.value);
  const pairs = [];
  for (let i = 0; i + 1 < drafts.length; i++) {
    if (drafts[i].balance && drafts[i + 1].balance) pairs.push(i);
  }
  if (pairs.length === 0) return;

  let newestFirst = 0;
  let oldestFirst = 0;
  for (const i of pairs) {
    const diff = Math.abs(signedBalance(drafts[i]) - signedBalance(drafts[i + 1]));
    if (diff === toCents(drafts[i].amount)) newestFirst++;
    if (diff === toCents(drafts[i + 1].amount)) oldestFirst++;
  }

  for (const i of pairs) {
    const diff = Math.abs(signedBalance(drafts[i]) - signedBalance(drafts[i + 1]));
    const target = newestFirst >= oldestFirst ? drafts[i] : drafts[i + 1];
    target.flags.push(diff === toCents(target.amount) ? 'arithmetic_verified' : 'balance_mismatch');
  }
}

module.exports = { parseBankList };
