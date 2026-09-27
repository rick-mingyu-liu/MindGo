import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { packageRoot } from '../utils/packageRoot';

/**
 * Every category the frontend's picker offers has an explicit colour.
 *
 * The category list lives in `frontend/pages/transactions/new.tsx` and the
 * colours in `CATEGORY_COLORS` in `frontend/pages/index.tsx`. Adding a
 * category means editing both (see CLAUDE.md), and forgetting the colour
 * breaks nothing visibly — the hash fallback still paints it — it just quietly
 * stops matching the palette. `demoData.test.ts` pins the seed's copy of the
 * list to the same source.
 *
 * This file also pinned the copies a React Native client (`mobile/`) kept of
 * the day helpers, the category list and these colours, until that client was
 * removed.
 */

const ROOT = path.join(packageRoot(__dirname), '..');

const FRONTEND_CATEGORIES = path.join(ROOT, 'frontend', 'pages', 'transactions', 'new.tsx');
const FRONTEND_COLOURS = path.join(ROOT, 'frontend', 'pages', 'index.tsx');

function read(file: string): string {
  assert.ok(
    fs.existsSync(file),
    `${path.relative(ROOT, file)} is missing — has it moved? This test reads ` +
      'files outside backend/, so a rename there fails here.',
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

/** A `Record<string, string>` of colours, keyed by category; keys may be quoted or bare. */
function coloursIn(file: string, constName: string): Record<string, string> {
  const source = read(file);
  const block = new RegExp(`const ${constName}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\}`).exec(source);
  assert.ok(block, `could not find ${constName} in ${path.relative(ROOT, file)}`);
  const entries = [...block[1]!.matchAll(/(?:'([^']+)'|([A-Za-z_$][\w$]*))\s*:\s*'(#[0-9a-fA-F]{3,8})'/g)];
  assert.ok(entries.length > 0, `${constName} in ${path.relative(ROOT, file)} parsed as empty`);
  return Object.fromEntries(entries.map((m) => [m[1] ?? m[2]!, m[3]!]));
}

describe('the category colours', () => {
  test('every category the picker offers has an explicit colour', () => {
    const colours = coloursIn(FRONTEND_COLOURS, 'CATEGORY_COLORS');
    const { income, expense } = categoriesIn(FRONTEND_CATEGORIES);
    for (const name of [...income, ...expense]) {
      assert.ok(colours[name], `'${name}' is in the picker but has no colour in CATEGORY_COLORS`);
    }
  });
});
