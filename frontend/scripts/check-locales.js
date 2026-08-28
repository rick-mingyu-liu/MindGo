#!/usr/bin/env node
/**
 * Locale sanity check.
 *
 * Guards the failure mode that shipped six wrong Chinese translations: a key
 * repeated inside common.json with a *different* value. JSON.parse keeps only
 * the last occurrence and reports no error, so the loser silently disappears
 * and whichever screen relied on it renders the wrong word.
 *
 * That means this check cannot use JSON.parse to find duplicates — by the time
 * the file is parsed the evidence is gone. It scans raw lines instead.
 *
 * It also reports keys the app asks for that no locale file answers. Those are
 * warnings, not errors: there is a standing backlog of them (IMPROVEMENTS.md
 * item 9), and failing on those would block every build rather than stopping
 * new ones from being added. Duplicates stay fatal.
 *
 * Run: npm run check:locales
 */
const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'public', 'locales');
const KEY_RE = /^(\s*)"((?:[^"\\]|\\.)*)"\s*:/;

let failed = false;

for (const locale of fs.readdirSync(LOCALES_DIR)) {
  const file = path.join(LOCALES_DIR, locale, 'common.json');
  if (!fs.existsSync(file)) continue;

  const raw = fs.readFileSync(file, 'utf8');

  try {
    JSON.parse(raw);
  } catch (err) {
    console.error(`✖ ${locale}/common.json is not valid JSON: ${err.message}`);
    failed = true;
    continue;
  }

  // Track keys per indent depth so nested blocks (e.g. "stock") keep their own
  // namespace — "Close" at top level and stock.Close are different keys.
  const seen = new Map();
  raw.split('\n').forEach((line, i) => {
    const m = line.match(KEY_RE);
    if (!m) return;
    const [, indent, key] = m;
    const scoped = `${indent.length}:${key}`;
    const value = line.slice(line.indexOf(':') + 1).trim().replace(/,$/, '');
    if (!seen.has(scoped)) seen.set(scoped, []);
    seen.get(scoped).push({ line: i + 1, key, value });
  });

  const duplicates = [...seen.values()].filter((hits) => hits.length > 1);

  if (duplicates.length === 0) {
    console.log(`✔ ${locale}: no duplicate keys`);
    continue;
  }

  failed = true;
  for (const hits of duplicates) {
    const conflicting = new Set(hits.map((h) => h.value)).size > 1;
    console.error(
      `✖ ${locale}: "${hits[0].key}" defined ${hits.length}× ` +
        (conflicting ? '— WITH CONFLICTING VALUES (one is being silently dropped)' : '(identical values)')
    );
    for (const h of hits) console.error(`      L${h.line}  ${h.value}`);
  }
}

// ---------------------------------------------------------------------------
// Unresolved keys: something the app calls t() with that no locale answers.
// i18next falls back to the key itself, so in `en` this is invisible — the key
// *is* the English string — while a Chinese user sees raw English mid-sentence.
// ---------------------------------------------------------------------------

const SRC_DIRS = ['pages', 'components', 'contexts', 'lib', 'utils'];
const ROOT = path.join(__dirname, '..');
const T_CALL = /\bt\(\s*(['"])((?:(?!\1)[^\\]|\\.)*)\1/g;

function collectKeys(dir, found = new Set()) {
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.next', '.git'].includes(entry.name)) collectKeys(full, found);
    } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      const src = fs.readFileSync(full, 'utf8');
      for (const m of src.matchAll(T_CALL)) found.add(m[2]);
    }
  }
  return found;
}

/**
 * Mirrors how i18next actually resolves a key, which is not just a dotted path.
 *
 * It walks the key as a path first ('stock.Close' -> { stock: { Close } }), and
 * if that finds nothing it falls back to the literal flat key. That fallback is
 * `ignoreJSONStructure`, which defaults to true. Without it every key that
 * merely *contains* a dot — 'Saving...', or any sentence ending in one — looks
 * missing when it is sitting right there in the file.
 */
function resolveKey(tree, key) {
  const nested = key
    .split('.')
    .reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), tree);
  if (nested !== undefined) return nested;
  return tree[key];
}

const used = new Set();
for (const dir of SRC_DIRS) collectKeys(path.join(ROOT, dir), used);

console.log(`\n${used.size} keys used across ${SRC_DIRS.join(', ')}.`);

for (const locale of fs.readdirSync(LOCALES_DIR)) {
  const file = path.join(LOCALES_DIR, locale, 'common.json');
  if (!fs.existsSync(file)) continue;
  const tree = JSON.parse(fs.readFileSync(file, 'utf8'));
  const missing = [...used].filter((key) => resolveKey(tree, key) === undefined);
  if (missing.length === 0) {
    console.log(`✔ ${locale}: every key resolves`);
  } else {
    console.warn(`⚠ ${locale}: ${missing.length} keys have no entry and will render as the key itself`);
    for (const key of missing.slice(0, 5)) console.warn(`      ${JSON.stringify(key)}`);
    if (missing.length > 5) console.warn(`      ... and ${missing.length - 5} more`);
  }
}

if (failed) {
  console.error('\nDuplicate keys found. Remove them, or namespace the distinct meanings.');
  process.exit(1);
}
console.log('\nNo duplicate keys.');
