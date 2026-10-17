#!/usr/bin/env node
/**
 * Locale sanity check.
 *
 * Checks every namespace file, public/locales/<locale>/<ns>.json (common.json,
 * legal.json, ...), in every locale.
 *
 * Guards the failure mode that shipped six wrong Chinese translations: a key
 * repeated inside common.json with a *different* value. JSON.parse keeps only
 * the last occurrence and reports no error, so the loser silently disappears
 * and whichever screen relied on it renders the wrong word.
 *
 * That means this check cannot use JSON.parse to find duplicates — by the time
 * the file is parsed the evidence is gone. It walks the raw text instead.
 *
 * It also fails when a namespace's locales disagree about which keys exist: a
 * key only `en` has renders as raw English for a Chinese user, and one only
 * `zh` has is dead or a sign `en` lost a string. Plural forms are compared by
 * their base key, because languages legitimately differ there (`en` needs
 * key_one and key_other; `zh` has only key_other, or the bare key).
 *
 * It also reports keys the app asks for that no locale file answers. Those are
 * warnings, not errors: there is a standing backlog of them, and failing on
 * those would block every build rather than stopping new ones from being
 * added. Duplicates stay fatal.
 *
 * Run: npm run check:locales
 */
const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'public', 'locales');

let duplicatesFound = false;
let parityFailed = false;

const locales = fs
  .readdirSync(LOCALES_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

// Every namespace any locale has. common first, so its output leads as before.
const namespaces = [
  ...new Set(
    locales.flatMap((locale) =>
      fs
        .readdirSync(path.join(LOCALES_DIR, locale))
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.slice(0, -'.json'.length))
    )
  ),
].sort((a, b) => (a === 'common' ? -1 : b === 'common' ? 1 : a.localeCompare(b)));

// common keeps its historical labels ("en"); other namespaces say which file.
const label = (locale, ns) => (ns === 'common' ? locale : `${locale}/${ns}`);

/**
 * Finds keys repeated within the same object, straight from the raw text.
 *
 * A minimal JSON walker rather than a line scan: it scopes keys by their real
 * parent, so privacy.intro and terms.intro (same name, same indent, different
 * objects) are not a duplicate, and two "Close" keys in one object are, however
 * they are indented. Only called on text JSON.parse has already accepted.
 */
function findDuplicates(raw) {
  const lineStarts = [0];
  for (let j = 0; j < raw.length; j++) if (raw[j] === '\n') lineStarts.push(j + 1);
  const lineAt = (pos) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };

  const duplicates = [];
  let i = 0;
  const ws = () => {
    while (/\s/.test(raw[i] ?? '')) i++;
  };
  const string = () => {
    const start = i++;
    while (raw[i] !== '"') i += raw[i] === '\\' ? 2 : 1;
    i++;
    return JSON.parse(raw.slice(start, i));
  };
  const value = (keyPath) => {
    ws();
    if (raw[i] === '{') return object(keyPath);
    if (raw[i] === '[') return array(keyPath);
    if (raw[i] === '"') return string();
    while (i < raw.length && !/[\s,}\]]/.test(raw[i])) i++;
  };
  function object(keyPath) {
    i++;
    const seen = new Map();
    for (;;) {
      ws();
      if (raw[i] === '}') break;
      const keyPos = i;
      const key = string();
      ws();
      i++; // ':'
      ws();
      const start = i;
      value([...keyPath, key]);
      const text = raw.slice(start, i);
      const shown = text.includes('\n') ? `${text.slice(0, text.indexOf('\n')).trim()} …` : text;
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key).push({ line: lineAt(keyPos), key: [...keyPath, key].join('.'), value: shown, text });
      ws();
      if (raw[i] === ',') i++;
    }
    i++;
    for (const hits of seen.values()) if (hits.length > 1) duplicates.push(hits);
  }
  function array(keyPath) {
    i++;
    for (let n = 0; ; n++) {
      ws();
      if (raw[i] === ']') break;
      value([...keyPath, String(n)]);
      ws();
      if (raw[i] === ',') i++;
    }
    i++;
  }

  value([]);
  return duplicates;
}

const trees = {}; // trees[ns][locale] = parsed file

for (const ns of namespaces) {
  trees[ns] = {};
  for (const locale of locales) {
    const file = path.join(LOCALES_DIR, locale, `${ns}.json`);
    if (!fs.existsSync(file)) {
      const has = locales.filter((l) => fs.existsSync(path.join(LOCALES_DIR, l, `${ns}.json`)));
      console.error(`✖ ${locale}/${ns}.json is missing (${has.join(', ')} has it)`);
      parityFailed = true;
      continue;
    }

    const raw = fs.readFileSync(file, 'utf8');

    try {
      trees[ns][locale] = JSON.parse(raw);
    } catch (err) {
      console.error(`✖ ${locale}/${ns}.json is not valid JSON: ${err.message}`);
      duplicatesFound = true;
      continue;
    }

    const duplicates = findDuplicates(raw);

    if (duplicates.length === 0) {
      console.log(`✔ ${label(locale, ns)}: no duplicate keys`);
      continue;
    }

    duplicatesFound = true;
    for (const hits of duplicates) {
      const conflicting = new Set(hits.map((h) => h.text)).size > 1;
      console.error(
        `✖ ${label(locale, ns)}: "${hits[0].key}" defined ${hits.length}× ` +
          (conflicting ? '— WITH CONFLICTING VALUES (one is being silently dropped)' : '(identical values)')
      );
      for (const h of hits) console.error(`      L${h.line}  ${h.value}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Missing keys: a key one locale has and another lacks, per namespace.
// ---------------------------------------------------------------------------

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

/** Every leaf path in a file, plural forms folded onto their base key. */
function leafKeys(node, prefix = '', out = new Set()) {
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) leafKeys(v, prefix ? `${prefix}.${k}` : k, out);
  } else {
    out.add(prefix.replace(PLURAL_SUFFIX, ''));
  }
  return out;
}

console.log('');
for (const ns of namespaces) {
  const present = locales.filter((l) => trees[ns][l] !== undefined);
  if (present.length < 2) continue;
  const keys = Object.fromEntries(present.map((l) => [l, leafKeys(trees[ns][l])]));
  const all = new Set(present.flatMap((l) => [...keys[l]]));
  let ok = true;
  for (const locale of present) {
    const missing = [...all].filter((k) => !keys[locale].has(k)).sort();
    if (missing.length === 0) continue;
    ok = false;
    parityFailed = true;
    const others = present.filter((l) => l !== locale).join(', ');
    console.error(`✖ ${label(locale, ns)}: missing ${missing.length} key${missing.length === 1 ? '' : 's'} that ${others} has`);
    for (const key of missing) console.error(`      ${JSON.stringify(key)}`);
  }
  if (ok) console.log(`✔ ${ns}: ${present.join(' and ')} have the same keys`);
}

// ---------------------------------------------------------------------------
// Unresolved keys: something the app calls t() with that no locale answers.
// i18next falls back to the key itself, so in `en` this is invisible — the key
// *is* the English string — while a Chinese user sees raw English mid-sentence.
// ---------------------------------------------------------------------------

const SRC_DIRS = ['pages', 'components', 'contexts', 'lib', 'utils'];
const ROOT = path.join(__dirname, '..');
// Quoted keys, and template literals with no interpolation (t(`legal:updated`)).
// A literal with ${...} is computed at runtime and cannot be checked here.
const T_CALL = /\bt\(\s*(['"`])((?:(?!\1)[^\\]|\\.)*)\1/g;

/**
 * Undoes JavaScript string escapes, so the key we look up is the string the app
 * actually asks for at runtime.
 *
 * T_CALL captures raw source. `t('We\\'ve sent…')` therefore yields a key with
 * the backslash still in it, which matches nothing in common.json — reporting a
 * perfectly good translation as missing. Three strings in this codebase hit it.
 */
function unescapeLiteral(raw) {
  const SIMPLE = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v' };
  return raw.replace(/\\(.)/g, (_, ch) => SIMPLE[ch] ?? ch);
}

function collectKeys(dir, found = new Set()) {
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.next', '.git'].includes(entry.name)) collectKeys(full, found);
    } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      const src = fs.readFileSync(full, 'utf8');
      for (const m of src.matchAll(T_CALL)) {
        if (m[1] === '`' && m[2].includes('${')) continue;
        found.add(unescapeLiteral(m[2]));
      }
    }
  }
  return found;
}

/**
 * Mirrors how i18next actually resolves a key, which is not just a dotted path.
 *
 * It walks the key as a path first ('dialog.Close' -> { dialog: { Close } }), and
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
  // A t(key, { count }) call resolves to a plural form such as key_one or
  // key_other; every language has _other (Chinese has nothing else).
  return tree[key] ?? tree[`${key}_other`];
}

const used = new Set();
for (const dir of SRC_DIRS) collectKeys(path.join(ROOT, dir), used);

console.log(`\n${used.size} keys used across ${SRC_DIRS.join(', ')}.`);

/**
 * Which file a key is looked up in. 'legal:updated' reads legal.json, as
 * i18next does for an `ns:` prefix naming a loaded namespace; anything else —
 * including 'Note: …', whose prefix is no namespace — reads common.json, the
 * default namespace every page loads first.
 */
function splitNamespace(key) {
  const m = key.match(/^([\w-]+):(.+)$/s);
  if (m && namespaces.includes(m[1])) return [m[1], m[2]];
  return ['common', key];
}

for (const locale of locales) {
  if (!trees.common?.[locale]) continue;
  const missing = [...used].filter((key) => {
    const [ns, rest] = splitNamespace(key);
    const tree = trees[ns]?.[locale];
    return !tree || resolveKey(tree, rest) === undefined;
  });
  if (missing.length === 0) {
    console.log(`✔ ${locale}: every key resolves`);
  } else {
    console.warn(`⚠ ${locale}: ${missing.length} keys have no entry and will render as the key itself`);
    for (const key of missing.slice(0, 5)) console.warn(`      ${JSON.stringify(key)}`);
    if (missing.length > 5) console.warn(`      ... and ${missing.length - 5} more`);
  }
}

if (duplicatesFound) {
  console.error('\nDuplicate keys found. Remove them, or namespace the distinct meanings.');
}
if (parityFailed) {
  console.error('\nLocales disagree about which keys exist. Add the missing translations, or remove the stale key.');
}
if (duplicatesFound || parityFailed) process.exit(1);
console.log('\nNo duplicate keys, and every locale has the same keys.');
