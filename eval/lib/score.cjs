/**
 * Scores parsed rows against ground truth for one image.
 *
 * CommonJS and dependency-free so that both the eval runner (ESM) and the
 * backend's fixture test (CommonJS) use this one definition of "correct".
 */
const { WARNING_FLAGS } = require('../../backend/services/import/parse');

const normalize = (text) => String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Dice coefficient over character bigrams: 1 for equal strings, 0 for disjoint. */
function similarity(a, b) {
  const x = normalize(a);
  const y = normalize(b);
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;
  const grams = (s) => {
    const counts = new Map();
    for (let i = 0; i < s.length - 1; i++) counts.set(s.slice(i, i + 2), (counts.get(s.slice(i, i + 2)) || 0) + 1);
    return counts;
  };
  const gx = grams(x);
  const gy = grams(y);
  let shared = 0;
  for (const [gram, n] of gx) shared += Math.min(n, gy.get(gram) || 0);
  return (2 * shared) / (x.length - 1 + y.length - 1);
}

/**
 * Pairs predicted rows with true rows. Exact date+amount first, then amount
 * alone, then description — the last pass is what catches a row whose amount
 * was misread, which is the error this benchmark exists to count.
 */
function matchRows(predicted, truth) {
  const passes = [
    (p, t) => p.date === t.date && p.amount === t.amount,
    (p, t) => p.amount === t.amount,
    (p, t) => similarity(p.description, t.description) >= 0.6,
  ];
  const pairs = [];
  const usedPredicted = new Set();
  const matchedTruth = new Set();
  for (const matches of passes) {
    truth.forEach((t, ti) => {
      if (matchedTruth.has(ti)) return;
      const pi = predicted.findIndex((p, i) => !usedPredicted.has(i) && matches(p, t));
      if (pi === -1) return;
      usedPredicted.add(pi);
      matchedTruth.add(ti);
      pairs.push({ predicted: predicted[pi], truth: t });
    });
  }
  return {
    pairs,
    extra: predicted.filter((_, i) => !usedPredicted.has(i)),
    missed: truth.filter((_, i) => !matchedTruth.has(i)),
  };
}

const warned = (row) => row.flags.some((flag) => WARNING_FLAGS.includes(flag));

function scoreImage(predicted, truth) {
  const { pairs, extra, missed } = matchRows(predicted, truth);
  const counts = {
    images: 1,
    truthRows: truth.length,
    predictedRows: predicted.length,
    matched: pairs.length,
    missed: missed.length,
    amountOk: 0,
    dateOk: 0,
    typeOk: 0,
    descriptionOk: 0,
    categoryLabelled: 0,
    categoryOk: 0,
    amountErrors: 0,
    silentAmountErrors: 0,
    typeErrors: 0,
    silentTypeErrors: 0,
    extraRows: extra.length,
    silentExtraRows: extra.filter((row) => !warned(row)).length,
    llmRows: predicted.filter((row) => row.source === 'llm').length,
  };
  const failures = [];
  for (const { predicted: p, truth: t } of pairs) {
    const amountOk = p.amount === t.amount;
    const typeOk = p.type === t.type;
    counts.amountOk += amountOk ? 1 : 0;
    counts.dateOk += p.date === t.date ? 1 : 0;
    counts.typeOk += typeOk ? 1 : 0;
    counts.descriptionOk += normalize(p.description) === normalize(t.description) ? 1 : 0;
    if (t.category !== undefined) {
      counts.categoryLabelled += 1;
      counts.categoryOk += p.category === t.category ? 1 : 0;
    }
    if (!amountOk) {
      counts.amountErrors += 1;
      if (!warned(p)) counts.silentAmountErrors += 1;
    }
    if (!typeOk) {
      counts.typeErrors += 1;
      if (!warned(p)) counts.silentTypeErrors += 1;
    }
    if (!amountOk || !typeOk || p.date !== t.date) {
      failures.push({ truth: t, predicted: { ...p, boxes: undefined } });
    }
  }
  return { counts, failures, missed, extra };
}

function sumCounts(list) {
  const total = {};
  for (const counts of list) {
    for (const [key, value] of Object.entries(counts)) total[key] = (total[key] || 0) + value;
  }
  return total;
}

const ratio = (n, d) => (d === 0 ? null : n / d);

function rates(total) {
  return {
    precision: ratio(total.matched, total.predictedRows),
    recall: ratio(total.matched, total.truthRows),
    amountExact: ratio(total.amountOk, total.matched),
    dateExact: ratio(total.dateOk, total.matched),
    typeExact: ratio(total.typeOk, total.matched),
    descriptionExact: ratio(total.descriptionOk, total.matched),
    categoryAccuracy: ratio(total.categoryOk, total.categoryLabelled),
    silentAmountErrorRate: ratio(total.silentAmountErrors, total.matched),
    silentTypeErrorRate: ratio(total.silentTypeErrors, total.matched),
    llmShare: ratio(total.llmRows, total.predictedRows),
  };
}

module.exports = { similarity, matchRows, scoreImage, sumCounts, rates, normalize };
