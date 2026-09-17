/**
 * The screenshot-import benchmark.
 *
 *   node run.mjs                         synthetic set, the shipped OCR profile
 *   node run.mjs --set private           your real screenshots (eval/private/)
 *   node run.mjs --strategy per-box      compare a recognition strategy
 *   node run.mjs --preset v6-small       compare a model (downloaded by the library)
 *   node run.mjs --engine canvas-native  compare a processing engine
 *   node run.mjs --no-cache              re-run OCR even when cached
 *
 * Runs the same OCR library and, for the shipped profile, the same model files
 * as the browser, then the real backend parser, then scores the result.
 * Writes reports/<set>-<config>.md and prints the headline numbers.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadImage } from '@napi-rs/canvas';
import { MODEL_PRESETS, PaddleOcrService } from 'ppu-paddle-ocr';

const require = createRequire(import.meta.url);
const { parseOcr } = require('../backend/services/import/parse');
const { scoreImage, sumCounts, rates } = require('./lib/score.cjs');

const HERE = dirname(fileURLToPath(import.meta.url));
const PROFILE = JSON.parse(readFileSync(join(HERE, '..', 'frontend', 'lib', 'ocr', 'profile.json'), 'utf8'));
const MODELS_DIR = join(HERE, '..', 'frontend', 'public', 'models');

const { values: args } = parseArgs({
  options: {
    set: { type: 'string', default: 'synthetic' },
    preset: { type: 'string', default: PROFILE.preset },
    engine: { type: 'string', default: PROFILE.engine },
    strategy: { type: 'string', default: PROFILE.strategy },
    'no-cache': { type: 'boolean', default: false },
  },
});

function modelFor(preset) {
  if (preset !== PROFILE.preset) {
    if (!MODEL_PRESETS[preset]) throw new Error(`unknown preset ${preset}; see MODEL_PRESETS in ppu-paddle-ocr`);
    return MODEL_PRESETS[preset];
  }
  // The shipped profile reads the exact files the browser is served.
  const files = Object.fromEntries(Object.entries(PROFILE.files).map(([key, file]) => [key, join(MODELS_DIR, file)]));
  const missing = Object.values(files).filter((file) => !existsSync(file));
  if (missing.length) {
    throw new Error(`model files missing (${missing.join(', ')}). Run \`npm run ocr-assets\` in frontend/ first.`);
  }
  const read = (file) => {
    const buffer = readFileSync(file);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  };
  return {
    detection: read(files.detection),
    recognition: read(files.recognition),
    charactersDictionary: read(files.charactersDictionary),
  };
}

const configName = `${args.preset}-${args.engine}-${args.strategy}`;
const setDir = join(HERE, args.set);
const cacheDir = join(HERE, '.cache');
const reportDir = join(HERE, 'reports');
mkdirSync(cacheDir, { recursive: true });
mkdirSync(reportDir, { recursive: true });

if (!existsSync(setDir)) {
  console.error(`no ${args.set}/ directory`);
  process.exit(1);
}
const images = readdirSync(setDir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort();

let service = null;
async function ocr(buffer) {
  if (!service) {
    service = new PaddleOcrService({ model: modelFor(args.preset), processing: { engine: args.engine } });
    await service.initialize();
  }
  const started = performance.now();
  const result = await service.recognize(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    { flatten: true, strategy: args.strategy, minimumConfidence: 0 }
  );
  return {
    durationMs: Math.round(performance.now() - started),
    lines: result.results.map((r) => ({ text: r.text, conf: r.confidence, box: r.box })),
  };
}

const perLayout = {};
const durations = [];
const failures = [];

for (const file of images) {
  const truthFile = join(setDir, file.replace(/\.[^.]+$/, '.truth.json'));
  if (!existsSync(truthFile)) {
    console.warn(`skipping ${file}: no ${truthFile}`);
    continue;
  }
  const truth = JSON.parse(readFileSync(truthFile, 'utf8'));
  const buffer = readFileSync(join(setDir, file));
  const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
  const cacheFile = join(cacheDir, `${hash}-${configName}.json`);

  let cached;
  if (!args['no-cache'] && existsSync(cacheFile)) {
    cached = JSON.parse(readFileSync(cacheFile, 'utf8'));
  } else {
    const { width, height } = await loadImage(buffer);
    cached = { file, image: { width, height }, ...(await ocr(buffer)) };
    writeFileSync(cacheFile, `${JSON.stringify(cached)}\n`);
  }
  durations.push(cached.durationMs);

  const parsed = parseOcr({ lines: cached.lines, image: cached.image, today: truth.today });
  const { counts, failures: wrong, missed, extra } = scoreImage(parsed.rows, truth.rows);
  counts.fallbackImages = parsed.needsFallback ? 1 : 0;
  counts.layoutOk = parsed.layout === truth.layout ? 1 : 0;
  (perLayout[truth.layout] ||= []).push(counts);
  if (wrong.length || missed.length || extra.length) failures.push({ file, wrong, missed, extra });
}
if (service) await service.destroy();

const pct = (x) => (x === null ? '—' : `${(100 * x).toFixed(1)}%`);
const quantile = (list, q) => {
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
};

const lines = [
  `# Import benchmark — ${args.set}`,
  '',
  `Config: preset \`${args.preset}\`, engine \`${args.engine}\`, strategy \`${args.strategy}\`. `
    + `OCR time p50 ${quantile(durations, 0.5)} ms, p95 ${quantile(durations, 0.95)} ms (Node, cached runs keep their first timing).`,
  '',
  '| Layout | Images | Layout right | Rows (true / found) | Precision | Recall | Amount | Date | Type | Description | Category | **Silent amount errors** | Silent type errors | Unflagged extra rows | Parser unsure |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
];
const all = [];
for (const [layout, list] of Object.entries(perLayout).sort()) {
  const t = sumCounts(list);
  all.push(t);
  const r = rates(t);
  lines.push(`| ${layout} | ${t.images} | ${t.layoutOk} | ${t.truthRows} / ${t.predictedRows} | ${pct(r.precision)} | ${pct(r.recall)} | `
    + `${pct(r.amountExact)} | ${pct(r.dateExact)} | ${pct(r.typeExact)} | ${pct(r.descriptionExact)} | ${pct(r.categoryAccuracy)} | `
    + `**${t.silentAmountErrors} (${pct(r.silentAmountErrorRate)})** | ${t.silentTypeErrors} (${pct(r.silentTypeErrorRate)}) | `
    + `${t.silentExtraRows} | ${t.fallbackImages} |`);
}
const total = sumCounts(all);
const overall = rates(total);
lines.push('', `**Overall:** ${total.matched}/${total.truthRows} rows found, amounts exact ${pct(overall.amountExact)}, `
  + `silent amount errors ${total.silentAmountErrors} (${pct(overall.silentAmountErrorRate)}), `
  + `silent type errors ${total.silentTypeErrors}, unflagged extra rows ${total.silentExtraRows}.`);

if (failures.length) {
  lines.push('', '## Rows that were wrong, missed or invented', '');
  for (const { file, wrong, missed, extra } of failures) {
    lines.push(`### ${file}`, '');
    for (const { truth: t, predicted: p } of wrong) {
      lines.push(`- wrong: expected \`${t.date} ${t.amount} ${t.type} ${t.description}\`, `
        + `got \`${p.date} ${p.amount} ${p.type} ${p.description}\` flags [${p.flags.join(', ')}]`);
    }
    for (const t of missed) lines.push(`- missed: \`${t.date} ${t.amount} ${t.type} ${t.description}\``);
    for (const p of extra) lines.push(`- extra: \`${p.date} ${p.amount} ${p.type} ${p.description}\` flags [${p.flags.join(', ')}]`);
    lines.push('');
  }
}

const report = join(reportDir, `${args.set}-${configName}.md`);
writeFileSync(report, `${lines.join('\n')}\n`);
console.log(lines.slice(0, lines.indexOf('') + 1 + 2 + Object.keys(perLayout).length + 3).join('\n'));
console.log(`\nfull report: ${report}`);
