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

if (failed) {
  console.error('\nDuplicate keys found. Remove them, or namespace the distinct meanings.');
  process.exit(1);
}
console.log('\nLocales OK.');
