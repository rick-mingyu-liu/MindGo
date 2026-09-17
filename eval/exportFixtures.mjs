/**
 * Copies the shipped profile's cached OCR output for the synthetic set into
 * backend/test/fixtures/ocr/, where test/importFixtures.test.js replays it
 * through the parser. The backend's tests and CI never run the model; they
 * run what the model said, recorded here.
 *
 *   node run.mjs && node exportFixtures.mjs
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROFILE = JSON.parse(readFileSync(join(HERE, '..', 'frontend', 'lib', 'ocr', 'profile.json'), 'utf8'));
const OUT = join(HERE, '..', 'backend', 'test', 'fixtures', 'ocr');
const SET = join(HERE, 'synthetic');
const config = `${PROFILE.preset}-${PROFILE.engine}-${PROFILE.strategy}`;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

let written = 0;
for (const file of readdirSync(SET).filter((f) => f.endsWith('.png')).sort()) {
  const hash = createHash('sha256').update(readFileSync(join(SET, file))).digest('hex').slice(0, 16);
  const cached = join(HERE, '.cache', `${hash}-${config}.json`);
  if (!existsSync(cached)) {
    console.error(`no cached OCR for ${file} under ${config}; run \`node run.mjs\` first`);
    process.exit(1);
  }
  const { image, lines } = JSON.parse(readFileSync(cached, 'utf8'));
  const truth = JSON.parse(readFileSync(join(SET, file.replace(/\.png$/, '.truth.json')), 'utf8'));
  const name = file.replace(/\.png$/, '.json');
  writeFileSync(join(OUT, name), `${JSON.stringify({ model: PROFILE.name, config, today: truth.today, layout: truth.layout, image, lines, truth: truth.rows })}\n`);
  written++;
}
console.log(`wrote ${written} fixtures (${config}) to ${OUT}`);
