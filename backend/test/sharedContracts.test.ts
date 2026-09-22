import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { packageRoot } from '../utils/packageRoot';

/**
 * The copies that three clients share, pinned so they cannot drift apart
 * silently.
 *
 * `frontend/` and `mobile/` cannot import each other: React Native's `View`
 * is not React DOM's `div`, so there is no component layer in common, and a
 * real shared package would move every lockfile to the repo root — which
 * breaks `npm ci` for Render (rootDir `backend`) and Vercel (rootDir
 * `frontend`) at the same time. So the code is copied, deliberately, and
 * these tests are what make that safe.
 *
 * This is the same bargain `demoData.test.ts` already strikes for the
 * category list, extended to everything else that got duplicated when the
 * mobile client was written.
 *
 * Note what is *not* checked here: `backend/utils/dates.ts` is not a copy of
 * `frontend/lib/date.ts`. They share a name and a purpose but expose
 * different functions — the backend has `monthOf` and `monthSpan`, the
 * clients have `todayDay`, `formatDayRange` and `daysUntil`. Only `toDay`
 * and `formatDay` overlap. Pinning them to each other would be asserting a
 * sameness that was never true; the backend twin is covered by its own
 * `dates.test.ts`.
 */

const ROOT = path.join(packageRoot(__dirname), '..');

const FRONTEND_DATE = path.join(ROOT, 'frontend', 'lib', 'date.ts');
const MOBILE_DATE = path.join(ROOT, 'mobile', 'src', 'lib', 'date.ts');
const FRONTEND_CATEGORIES = path.join(ROOT, 'frontend', 'pages', 'transactions', 'new.tsx');
const MOBILE_CATEGORIES = path.join(ROOT, 'mobile', 'src', 'lib', 'categories.ts');
const FRONTEND_COLOURS = path.join(ROOT, 'frontend', 'pages', 'index.tsx');
const MOBILE_COLOURS = path.join(ROOT, 'mobile', 'src', 'lib', 'theme.ts');

function read(file: string): string {
  assert.ok(
    fs.existsSync(file),
    `${path.relative(ROOT, file)} is missing — has it moved? These tests pin ` +
      'copies that live outside backend/, so a rename there fails here.',
  );
  return fs.readFileSync(file, 'utf8');
}

/** The `categories` object as exported from a TypeScript source file. */
function categoriesIn(file: string): { income: string[]; expense: string[] } {
  const block = /export const categories\s*=\s*\{([\s\S]*?)\n\}/.exec(read(file));
  assert.ok(block, `could not find the exported categories object in ${path.relative(ROOT, file)}`);
  const listOf = (key: string): string[] => {
    const list = new RegExp(`${key}:\\s*\\[([\\s\\S]*?)\\]`).exec(block[1]!);
    assert.ok(list, `no ${key} list in ${path.relative(ROOT, file)}`);
    return [...list[1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
  };
  return { income: listOf('income'), expense: listOf('expense') };
}

/**
 * A `Record<string, string>` of colours, keyed by category.
 *
 * The two files quote their keys differently — the frontend writes
 * `'Dining Out': '#e11d48'` throughout, while the mobile copy leaves the
 * one-word keys bare, as TypeScript allows — so the key pattern accepts
 * both rather than demanding the files be byte-identical.
 */
function coloursIn(file: string, constName: string): Record<string, string> {
  const source = read(file);
  const block = new RegExp(`const ${constName}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\}`).exec(source);
  assert.ok(block, `could not find ${constName} in ${path.relative(ROOT, file)}`);
  const entries = [...block[1]!.matchAll(/(?:'([^']+)'|([A-Za-z_$][\w$]*))\s*:\s*'(#[0-9a-fA-F]{3,8})'/g)];
  assert.ok(entries.length > 0, `${constName} in ${path.relative(ROOT, file)} parsed as empty`);
  return Object.fromEntries(entries.map((m) => [m[1] ?? m[2]!, m[3]!]));
}

/** A `const NAME = ['#aaa', ...]` array of colours. */
function colourListIn(file: string, constName: string): string[] {
  const block = new RegExp(`const ${constName}[^=]*=\\s*\\[([\\s\\S]*?)\\]`).exec(read(file));
  assert.ok(block, `could not find ${constName} in ${path.relative(ROOT, file)}`);
  return [...block[1]!.matchAll(/'(#[0-9a-fA-F]{3,8})'/g)].map((m) => m[1]!);
}

describe('the day helpers the two clients share', () => {
  test('the mobile copy is the frontend file, verbatim', () => {
    // The mobile file is the frontend one with a header explaining where it
    // came from, so the frontend content has to survive at the end of it
    // untouched. An edit to either side that is not mirrored fails here.
    const frontend = read(FRONTEND_DATE);
    const mobile = read(MOBILE_DATE);
    assert.ok(
      mobile.endsWith(frontend),
      'mobile/src/lib/date.ts has diverged from frontend/lib/date.ts.\n' +
        'These parse days as local noon so no viewer reads the day before; a ' +
        'fix applied to one and not the other means the phone and the browser ' +
        'disagree about what day a transaction happened on.',
    );
  });

  test('the mobile copy says where it came from', () => {
    // Without this the next reader has no way to know it is a copy at all,
    // and would edit it in place.
    assert.match(read(MOBILE_DATE), /frontend\/lib\/date\.ts/);
  });
});

describe('the category list the three projects share', () => {
  test('the mobile copy matches the frontend list exactly', () => {
    // demoData.test.ts already pins the backend's copy to the same source, so
    // between the two tests all three agree.
    assert.deepEqual(categoriesIn(MOBILE_CATEGORIES), categoriesIn(FRONTEND_CATEGORIES));
  });
});

describe('the category colours the two clients share', () => {
  test('the mobile copy matches the frontend map exactly', () => {
    assert.deepEqual(
      coloursIn(MOBILE_COLOURS, 'CATEGORY_COLORS'),
      coloursIn(FRONTEND_COLOURS, 'CATEGORY_COLORS'),
    );
  });

  test('the fallback palette matches too', () => {
    // An unlisted category picks from this by a hash of its name, so a
    // different list means the same category is a different colour on each
    // client — the exact bug the shared map exists to prevent.
    assert.deepEqual(
      colourListIn(MOBILE_COLOURS, 'FALLBACK_COLORS'),
      colourListIn(FRONTEND_COLOURS, 'FALLBACK_COLORS'),
    );
  });

  test('every category the picker offers has an explicit colour', () => {
    // A category with no entry still renders, via the hash fallback, so this
    // never breaks anything visibly — it just quietly stops matching the
    // palette a designer chose.
    const colours = coloursIn(FRONTEND_COLOURS, 'CATEGORY_COLORS');
    const { income, expense } = categoriesIn(FRONTEND_CATEGORIES);
    for (const name of [...income, ...expense]) {
      assert.ok(colours[name], `'${name}' is in the picker but has no colour in CATEGORY_COLORS`);
    }
  });
});
