# Backend TypeScript Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `backend/` from CommonJS JavaScript to strict TypeScript, compiled to `dist/`, without changing behaviour.

**Architecture:** `tsc` compiles the unchanged source tree into `backend/dist/` as CommonJS. `prepare` runs the build during `npm install`, so Render's existing commands keep working. Files are converted in nine steps. Each step is its own PR, merged before the next begins, with `allowJs` letting JavaScript and TypeScript modules require each other in the meantime.

**Tech Stack:** TypeScript 6.0 (`~6.0.3`; `typescript-eslint` 8.70 supports `<6.1`, so not 7.x), `tsx` 4 for dev, `typescript-eslint` 8, ESLint 9 flat config, `node --test`, Express 4, node-pg 8.

**Spec:** [`docs/superpowers/specs/2026-09-17-backend-typescript-design.md`](../specs/2026-09-17-backend-typescript-design.md)

**Status of this plan:** Step 1 (Tasks 1–6) and the conversion recipe (§ *Converting a file*) were built and run in a throwaway worktree on 2026-09-17: 508 tests passed from `dist/`, lint was clean, `node dist/app.js` and `tsx app.js` both served `/health`, and a clean `npm ci` built `dist/` through `prepare`. Code blocks in those tasks are copied from that run.

## Global Constraints

- Behaviour does not change. Endpoints, response bodies, status codes and log output stay identical (spec §1, §5).
- Each module keeps its runtime export shape. `module.exports = { … }` becomes named exports, and `module.exports = value` becomes `export = value`. `export default` is never used (spec §4.1).
- Compiled output is CommonJS (`module: nodenext`, with no `"type"` in `backend/package.json`).
- `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals` and `noUnusedParameters` are on. `@typescript-eslint/no-explicit-any` is an error. Exceptions are single disabled lines at third-party boundaries, each with a comment.
- A caught error reaches a log line only through `errorSummary(e)` or the existing `logger.error(message, error)`. Never log OCR text, row values, request bodies or credentials.
- A bug the type checker finds is fixed in its own commit with a test that fails first, and listed under *Bugs found* in the PR.
- If a test breaks during a conversion, fix the conversion, not the test.
- One branch per step, created from the latest `origin/main`, and merged before the next step's branch is created.
- Every commit message ends with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Every PR body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Commit, push, open PRs and merge only when the user says so.
- Temporary files go in the session scratchpad, not `/tmp`.

## Commands used throughout (run in `backend/`)

| Command | What it proves |
|---|---|
| `npm run build` | `tsc` compiles with no errors |
| `npm test` | Builds, then runs every `dist/test/**/*.test.js`. Expected after step 1: `ℹ tests 508`, `ℹ fail 0` |
| `npm run lint` | ESLint, JavaScript and TypeScript rules, no problems |
| `PORT=3099 node dist/app.js`, then `curl -s localhost:3099/health` | The compiled server starts, and `/health` returns `{"status":"OK",…}` |
| `PORT=3098 npx tsx app.js`, then `curl -s localhost:3098/health` | The source runs in dev (`app.ts` from step 7) |

The count is 508 because the old count of 500 already excluded `test/helpers/ocrLayouts.js`, which the new glob skips too, and step 1 adds 3 `packageRoot` tests and 5 `errorSummary` tests (+8). (This paragraph said 507 while the plan was being written, subtracting a further 1 for `ocrLayouts`; the measured count has been 508 from step 1 onward.)

---

# Step 1: Tooling (branch `chore/ts-1-tooling`, PR 1)

The branch already exists and holds the spec commit (`2897b24`). Check first:

```bash
cd /Users/rickliu/Documents/MindGo && git status -sb | head -1   # expect: ## chore/ts-1-tooling
git fetch -q origin && git merge-base --is-ancestor origin/main HEAD && echo up-to-date
```

### Task 1: Compile the backend into `dist/` and run the tests from there

**Files:**
- Create: `backend/tsconfig.json`, `backend/utils/packageRoot.ts`, `backend/test/packageRoot.test.js`
- Modify: `backend/package.json` (scripts, `main`, devDependencies), `backend/package-lock.json`, `backend/.gitignore`, `backend/db/setup.js`, `backend/test/importFixtures.test.js`, `backend/test/demoData.test.js`

**Interfaces:**
- Produces: `packageRoot(from: string): string` in `utils/packageRoot.ts`, a named export. It returns the nearest directory at or above `from` containing `package.json`, and throws `no package.json above <from>` when there is none.

Why the three callers change: `tsc` follows the literal `require('../../eval/lib/score.cjs')` in `importFixtures.test.js`, and fails with `TS5055: Cannot write file …/eval/lib/score.cjs because it would overwrite input file`. Once compiled, a path built from `__dirname` also points into `dist/`, where `schema.sql`, `test/fixtures/` and `../frontend` are not.

- [ ] **Step 1: Install the tooling**

```bash
cd backend
npm install --save-dev typescript@~6.0.3 tsx@^4.23.13 typescript-eslint@^8.70.0 @eslint/js@^9.39.5 \
  @types/node@^22 @types/express@^4 @types/pg @types/jsonwebtoken @types/bcryptjs@^2 \
  @types/cors @types/morgan @types/nodemailer@^7 @types/supertest
npm uninstall nodemon
```

`@types/nodemailer` is pinned to 7 to match `nodemailer` 7.0.4. `node-cron` ships its own types. `@eslint/js` was already installed through `eslint`, but `eslint.config` imports it, so it is now listed.

- [ ] **Step 2: Write the failing `packageRoot` test**

Create `backend/test/packageRoot.test.js`:

```js
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { packageRoot } = require('../utils/packageRoot');

/**
 * Compiled code runs from dist/, one level below the source it came from, so
 * a path built from __dirname points somewhere else after the build. Files
 * that are not code (schema.sql, test fixtures, eval/) are found from the
 * package root instead, which is the same directory either way.
 */
describe('packageRoot', () => {
  test('finds backend/ from inside it, source or compiled', () => {
    const root = packageRoot(__dirname);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).name,
      'personal-finance-backend');
    assert.ok(fs.existsSync(path.join(root, 'db', 'schema.sql')));
  });

  test('stops at the nearest package.json', () => {
    const top = fs.mkdtempSync(path.join(os.tmpdir(), 'mindgo-root-'));
    try {
      fs.writeFileSync(path.join(top, 'package.json'), '{}');
      const deep = path.join(top, 'a', 'b');
      fs.mkdirSync(deep, { recursive: true });
      assert.equal(packageRoot(deep), top);
    } finally {
      fs.rmSync(top, { recursive: true, force: true });
    }
  });

  test('throws when there is none', () => {
    assert.throws(() => packageRoot(path.parse(process.cwd()).root), /no package\.json above/);
  });
});
```

- [ ] **Step 3: Add `tsconfig.json`**

Create `backend/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "es2022",
    "lib": [
      "es2022"
    ],
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "rootDir": ".",
    "outDir": "dist",
    "allowJs": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "types": [
      "node"
    ]
  },
  "exclude": [
    "node_modules",
    "dist",
    "eslint.config.mjs"
  ]
}
```

- [ ] **Step 4: Set the scripts and `main`**

In `backend/package.json`, set `"main": "dist/app.js"` and replace `"scripts"` with:

```json
"scripts": {
  "build": "tsc",
  "prepare": "npm run build",
  "start": "node dist/app.js",
  "dev": "tsx watch app.js",
  "db:setup": "node dist/db/setup.js",
  "db:seed": "node dist/db/seed.js",
  "lint": "eslint .",
  "test": "npm run build && node --test 'dist/test/**/*.test.js'"
}
```

`node --test` does not accept a directory. The quoted glob works on Node 22 (CI) and 24. `dev` uses `tsx` because plain `node` cannot `require()` a `.ts` module from JavaScript source (`Error: Cannot find module './packageRoot'`), while `tsx` can.

Append to `backend/.gitignore`:

```
# build output
dist/
```

- [ ] **Step 5: Run the build to see it fail**

Run: `npm run build`
Expected: `error TS5055: Cannot write file '…/eval/lib/score.cjs' because it would overwrite input file.`

- [ ] **Step 6: Write `packageRoot`**

Create `backend/utils/packageRoot.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';

/**
 * The nearest directory at or above `from` that holds a package.json — for the
 * backend, `backend/`, whether the caller runs from source or from `dist/`.
 * Pass `__dirname`. Anything that reads a file which is not code (schema.sql,
 * test fixtures, eval/) must start from here: a path built from `__dirname`
 * alone points into `dist/` once compiled, where those files are not copied.
 */
export function packageRoot(from: string): string {
  let dir = path.resolve(from);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`no package.json above ${from}`);
    dir = parent;
  }
}
```

- [ ] **Step 7: Point the three callers at it**

`backend/db/setup.js`: after `const db = require('./connection');` add

```js
const { packageRoot } = require('../utils/packageRoot');
```

and replace `path.join(__dirname, 'schema.sql')` with `path.join(packageRoot(__dirname), 'db', 'schema.sql')`.

`backend/test/importFixtures.test.js`: replace

```js
const { scoreImage, sumCounts, rates } = require('../../eval/lib/score.cjs');
```

with

```js
const { packageRoot } = require('../utils/packageRoot');

const ROOT = packageRoot(__dirname);
const { scoreImage, sumCounts, rates } = require(path.join(ROOT, '..', 'eval', 'lib', 'score.cjs'));
```

and `const DIR = path.join(__dirname, 'fixtures', 'ocr');` with `const DIR = path.join(ROOT, 'test', 'fixtures', 'ocr');`.

`backend/test/demoData.test.js`: after `const { monthOf } = require('../utils/dates');` add `const { packageRoot } = require('../utils/packageRoot');`, and replace `path.join(__dirname, '..', '..', 'frontend', 'pages', 'transactions', 'new.tsx')` with `path.join(packageRoot(__dirname), '..', 'frontend', 'pages', 'transactions', 'new.tsx')`.

- [ ] **Step 8: Run the build and the whole suite from `dist/`**

Run: `rm -rf dist && npm test`
Expected: `ℹ tests 502`, `ℹ pass 502`, `ℹ fail 0` (499 existing tests plus 3 `packageRoot` tests; `errorSummary` arrives in Task 3).

- [ ] **Step 9: Check that both entry points start**

```bash
PORT=3099 node dist/app.js & sleep 4; curl -s localhost:3099/health; kill %1
PORT=3098 npx tsx app.js & sleep 5; curl -s localhost:3098/health; kill %1
```

Expected: both print `{"status":"OK",…}`.

- [ ] **Step 10: Check that a clean install builds**

Run: `rm -rf node_modules dist && npm ci && ls dist/app.js`
Expected: the output shows `run tsc` (from `prepare`) and `dist/app.js` exists.

- [ ] **Step 11: Commit**

```bash
git add backend/tsconfig.json backend/utils/packageRoot.ts backend/test/packageRoot.test.js \
  backend/package.json backend/package-lock.json backend/.gitignore backend/db/setup.js \
  backend/test/importFixtures.test.js backend/test/demoData.test.js
git commit -m "Compile the backend with tsc and run the tests from dist/"
```

### Task 2: Make `eval/` load the compiled parser

**Files:**
- Modify: `eval/lib/score.cjs`, `eval/run.mjs`

**Interfaces:**
- Produces: `loadParser()` exported from `eval/lib/score.cjs`. It returns the module object of `backend/dist/services/import/parse.js`, and throws `Run \`npm install\` in backend/ first; it builds the parser.` when that file is missing.

- [ ] **Step 1: Understand why**

`score.cjs` and `run.mjs` still require `backend/services/import/parse.js`, the JavaScript source. That works today, but step 3 renames it to `.ts`, and plain Node cannot load that. Both must load the compiled `dist/` copy instead, and fail with a clear message when it has not been built.

- [ ] **Step 2: Replace the parser require in `score.cjs`**

In `eval/lib/score.cjs`, replace

```js
const { WARNING_FLAGS } = require('../../backend/services/import/parse');
```

with

```js
const path = require('node:path');

/**
 * The backend's compiled parser. The backend is TypeScript, built into
 * backend/dist/ by `npm install` (its `prepare` script), so a checkout that
 * has not installed the backend has no parser to load.
 */
function loadParser() {
  const parser = path.join(__dirname, '..', '..', 'backend', 'dist', 'services', 'import', 'parse.js');
  try {
    return require(parser);
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND' && error.message.includes(parser)) {
      throw new Error('Run `npm install` in backend/ first; it builds the parser.');
    }
    throw error;
  }
}

const { WARNING_FLAGS } = loadParser();
```

and add `loadParser` to the export line:

```js
module.exports = { similarity, matchRows, scoreImage, sumCounts, rates, normalize, loadParser };
```

- [ ] **Step 3: Use it in `run.mjs`**

In `eval/run.mjs`, replace

```js
const { parseOcr } = require('../backend/services/import/parse');
const { scoreImage, sumCounts, rates } = require('./lib/score.cjs');
```

with

```js
const { scoreImage, sumCounts, rates, loadParser } = require('./lib/score.cjs');
const { parseOcr } = loadParser();
```

- [ ] **Step 4: Verify**

```bash
cd eval && npm test                       # ℹ tests 10, ℹ fail 0
cd ../backend && mv dist dist.bak
node -e "require('../eval/lib/score.cjs')" 2>&1 | grep 'Run `npm install`'   # the message prints
mv dist.bak dist
cd ../eval && npm run benchmark 2>&1 | tail -3   # uses cached OCR; same totals as eval/reports/synthetic-v6-small-canvas-native-per-box.md
cd ../backend && npm test                  # ℹ tests 502, ℹ fail 0
```

- [ ] **Step 5: Commit**

```bash
git add eval/lib/score.cjs eval/run.mjs
git commit -m "Load the compiled backend parser in eval/"
```

### Task 3: `errorSummary`

**Files:**
- Create: `backend/utils/errorSummary.ts`, `backend/test/errorSummary.test.js`

**Interfaces:**
- Produces: `errorSummary(e: unknown): ErrorSummary`, with `interface ErrorSummary { error: string; code: string | undefined }` (named exports). `error` is `e.name` for an `Error`, `'null'` for `null`, and otherwise `typeof e`. `code` is `e.code` when it is a string, and otherwise `undefined`; the key is always present. Nothing calls it until step 6 (the two controllers that log `{ error: error.name, code: error.code }`).

- [ ] **Step 1: Write the failing test**

Create `backend/test/errorSummary.test.js`:

```js
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { errorSummary } = require('../utils/errorSummary');

/**
 * The one shape a caught error may take in a log line: its name and its code.
 * Never its message — a pg error's message can quote the row that failed, and
 * the import routes must not log screenshot text or row values.
 */
describe('errorSummary', () => {
  test('keeps the name and code of an Error', () => {
    const error = Object.assign(new Error('value "Tim Hortons 4.50" is too long'), { code: '22001' });
    assert.deepEqual(errorSummary(error), { error: 'Error', code: '22001' });
  });

  test('keeps the subclass name, and an undefined code as undefined', () => {
    const summary = errorSummary(new TypeError('x'));
    assert.deepEqual(summary, { error: 'TypeError', code: undefined });
    assert.ok('code' in summary);
  });

  test('never includes the message', () => {
    const summary = errorSummary(Object.assign(new Error('secret row'), { code: 'X' }));
    assert.ok(!JSON.stringify(summary).includes('secret row'));
  });

  test('describes a thrown non-Error by its type', () => {
    assert.deepEqual(errorSummary('boom'), { error: 'string', code: undefined });
    assert.deepEqual(errorSummary(null), { error: 'null', code: undefined });
    assert.deepEqual(errorSummary({ code: 'ECONNRESET' }), { error: 'object', code: 'ECONNRESET' });
  });

  test('ignores a code that is not a string', () => {
    assert.deepEqual(errorSummary(Object.assign(new Error('x'), { code: 42 })), { error: 'Error', code: undefined });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run build && node --test dist/test/errorSummary.test.js`
Expected: `Error: Cannot find module '../utils/errorSummary'`, `ℹ fail 1`.

- [ ] **Step 3: Implement**

Create `backend/utils/errorSummary.ts`:

```ts
/**
 * The only form in which a caught error reaches a log line: its name and its
 * code. Never its message — a pg error's message can quote the row that
 * failed, and the import routes must not log screenshot text or row values
 * (see CLAUDE.md, "Never log OCR text, row values or request bodies").
 *
 * `code` is always present, undefined when the error has none, matching the
 * `{ error: error.name, code: error.code }` objects this replaces.
 */
export interface ErrorSummary {
  error: string;
  code: string | undefined;
}

export function errorSummary(e: unknown): ErrorSummary {
  const error = e instanceof Error ? e.name : e === null ? 'null' : typeof e;
  const code = typeof e === 'object' && e !== null && 'code' in e && typeof e.code === 'string'
    ? e.code
    : undefined;
  return { error, code };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npm run build && node --test dist/test/errorSummary.test.js`
Expected: `ℹ pass 5`, `ℹ fail 0`. Then `npm test`: `ℹ tests 508`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add backend/utils/errorSummary.ts backend/test/errorSummary.test.js
git commit -m "Add errorSummary, the one shape a caught error takes in a log"
```

### Task 4: Shared types for rows and the signed-in user

**Files:**
- Create: `backend/types/db.ts`, `backend/types/express.d.ts`

**Interfaces:**
- Produces: `UserRow`, `TransactionRow`, `ImportBatchRow`, `SavingsGoalRow`, `WatchlistRow`, `AiPlanRow`, `TransactionType`, `TransactionSource` (named type exports from `types/db.ts`); `AuthUser` from `types/express.d.ts`; and `req.user: AuthUser` on every Express `Request`, available in every `.ts` file without an import.

- [ ] **Step 1: Write `types/db.ts`**

Match `db/schema.sql` column by column:

```ts
/**
 * One interface per table in db/schema.sql, written by hand. Update this file
 * in the same commit as any schema.sql edit or migration.
 *
 * How node-pg hands columns back here:
 * - DATE is the plain string '2026-08-28' (the type parser in db/connection);
 * - DECIMAL is a string ('12.50'), because pg does not parse it;
 * - TIMESTAMP is a Date;
 * - a column without NOT NULL can be null.
 */

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  email_verified: boolean | null;
  email_verification_token: string | null;
  email_verification_expires: Date | null;
  created_at: Date | null;
  updated_at: Date | null;
  language: string;
  email_notifications_enabled: boolean;
  weekly_reports_enabled: boolean;
  is_demo: boolean;
}

export type TransactionType = 'income' | 'expense';
export type TransactionSource = 'manual' | 'ocr' | 'ocr_llm';

export interface TransactionRow {
  id: number;
  user_id: number | null;
  amount: string;
  description: string;
  category: string;
  type: TransactionType;
  date: string;
  currency: string;
  source: TransactionSource;
  created_at: Date | null;
  updated_at: Date | null;
}

export interface ImportBatchRow {
  id: number;
  user_id: number | null;
  row_count: number;
  edited_count: number;
  llm_count: number;
  created_at: Date | null;
}

export interface SavingsGoalRow {
  id: number;
  user_id: number | null;
  name: string;
  target_amount: string;
  current_amount: string | null;
  target_date: string | null;
  description: string | null;
  currency: string;
  created_at: Date | null;
  updated_at: Date | null;
}

export interface WatchlistRow {
  id: number;
  user_id: number | null;
  symbol: string;
  company_name: string | null;
  added_at: Date | null;
}

export interface AiPlanRow {
  id: number;
  user_id: number | null;
  prompt: string;
  response: string;
  created_at: Date | null;
}
```

- [ ] **Step 2: Write `types/express.d.ts`**

```ts
/**
 * What middleware/auth puts on every request it lets through: the payload
 * authController signs into the JWT. Only routers that run `router.use(auth)`
 * read it, which is every router that reads `req.user`.
 */
export interface AuthUser {
  userId: number;
  email: string;
}

declare global {
  // Express declares Request inside this namespace; merging is the documented
  // way to add a property to it.
  namespace Express {
    interface Request {
      user: AuthUser;
    }
  }
}
```

- [ ] **Step 3: Prove both types are picked up**

Create a temporary file, `backend/utils/zzProbe.ts`:

```ts
import type { Request } from 'express';
import type { TransactionRow } from '../types/db';
export function probe(req: Request, row: TransactionRow): string {
  const id: number = req.user.userId;
  return `${id} ${row.date} ${row.amount}`;
}
```

Run: `npm run build`
Expected: no errors. Change `const id: number` to `const id: string`, run again, and expect `error TS2322: Type 'number' is not assignable to type 'string'`. Then delete the probe: `rm utils/zzProbe.ts`.

- [ ] **Step 4: Commit**

```bash
git add backend/types
git commit -m "Type database rows and the signed-in user"
```

### Task 5: Lint TypeScript

**Files:**
- Rename and rewrite: `backend/eslint.config.js` → `backend/eslint.config.mjs`

- [ ] **Step 1: Rename and replace the config**

```bash
git mv eslint.config.js eslint.config.mjs
```

Write `backend/eslint.config.mjs`:

```js
import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Flat config (ESLint 9). The backend is being converted from CommonJS
 * JavaScript to TypeScript (docs/superpowers/specs/2026-09-17-backend-typescript-design.md);
 * until that finishes, both kinds of file are linted, each with its own parser.
 *
 * Deliberately not a style linter — formatting arguments are not worth a build
 * failure on an existing codebase. The rules below are the ones that catch
 * actual defects: references that do not resolve, bindings that are never used
 * (usually a leftover from a refactor, occasionally a typo'd variable), and
 * promise mistakes that fail silently at runtime.
 */
const unusedVars = ['error', {
  // Unused function arguments are common and harmless in Express
  // middleware, where the signature is positional: an error handler must
  // declare (err, req, res, next) even when it ignores next. Unused
  // *variables* still fail, and a leading underscore opts an argument out.
  args: 'after-used',
  argsIgnorePattern: '^_',
  varsIgnorePattern: '^_',
  caughtErrors: 'none',
  // `const { password_hash, ...safe } = user` is the idiomatic way to
  // drop a field before returning a row. The omitted names are the
  // point, so they are not "unused".
  ignoreRestSiblings: true,
}];

export default defineConfig(
  {
    ignores: ['node_modules/**', 'dist/**', 'docs/**', 'coverage/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': unusedVars,
      // An async function whose rejection nobody handles takes the process
      // down on an unhandled rejection.
      'no-async-promise-executor': 'error',
      // console is the logging mechanism in several services here, so it is
      // allowed rather than pretended otherwise.
      'no-console': 'off',
    },
  },
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': unusedVars,
      // `import x = require('./x')` is how TypeScript imports a module that
      // keeps its `module.exports = value` shape (spec §4.1).
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-async-promise-executor': 'error',
      'no-console': 'off',
    },
  },
);
```

`tsconfig.json` already excludes `eslint.config.mjs`, so `tsc` does not compile it.

- [ ] **Step 2: Prove `.ts` files are linted**

```bash
printf 'export const probe: any = 1;\n' > utils/zzProbe.ts
npx eslint utils/zzProbe.ts   # expect: error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
rm utils/zzProbe.ts
```

- [ ] **Step 3: Lint everything**

Run: `npm run lint`
Expected: no output after the npm banner (0 problems).

- [ ] **Step 4: Commit**

```bash
git add backend/eslint.config.mjs
git commit -m "Lint TypeScript with typescript-eslint"
```

### Task 6: Document the build, open PR 1, and check the deploy

**Files:**
- Modify: `CLAUDE.md` (Backend commands and Tests sections only; the full rewrite is step 9)

- [ ] **Step 1: Update CLAUDE.md's backend commands**

In the `### Backend (\`cd backend\`)` block, replace the `npm run dev`, `npm start` and `npm test` lines with:

```bash
npm install            # also builds: `prepare` runs tsc into dist/
npm run build          # tsc → dist/ (CommonJS). Source is being converted to TypeScript: docs/superpowers/specs/2026-09-17-backend-typescript-design.md
npm run dev            # tsx watch app.js (plain node cannot require the .ts modules)
npm start              # node dist/app.js (production)
npm test               # builds, then node --test 'dist/test/**/*.test.js'
```

The `db:setup` and `db:seed` lines stay as they are, since the scripts now run from `dist/`. In **## Tests**, add `packageRoot.test.js` (finding `backend/` from source or `dist/`) and `errorSummary.test.js` (the only shape a caught error takes in a log) to the unit-test list.

- [ ] **Step 2: Run the step checklist**

`npm run build` · `npm test` (508/0) · `npm run lint` · both `/health` checks from Task 1 Step 9. With the local backend on 3001 and frontend on 3000, log in, open the dashboard, and import `eval/synthetic/bank-balance-01.png` through to the review step without saving. If port 3001 is taken by an old nodemon, see the memory note on the orphaned parent process.

- [ ] **Step 3: Commit, push and open PR 1**, when the user says so

```bash
git add CLAUDE.md
git commit -m "Document the backend build"
git push -u origin chore/ts-1-tooling
gh pr create --base main --title "Build the backend with TypeScript (step 1 of 9)" --body-file <scratchpad>/pr1.md
```

The PR body covers: what changed (tooling only, no source converted), the new scripts, why `prepare`, `eval/` needing a built backend, the test count change (500 → 508, and why), the test plan with the checks above, the Render check the user must do after merging, and the footer.

- [ ] **Step 4: After the user merges, check the deploy with them**

In Render's deploy log, look for `> npm run build` and `> tsc` during `npm install`, and for the service starting with `node dist/app.js`. Then run `curl -s https://<render-backend-host>/health`. If `tsc: not found` appears, Render skipped devDependencies: set the Build Command to `npm install --include=dev`, redeploy, and check again. Do not start step 2 until `/health` answers.

---

# Converting a file

Every file in steps 2–8 is converted the same way. The two worked examples were converted and verified in the prototype (build, 508 tests, lint, both `/health` checks).

1. `git mv x.js x.ts`.
2. Replace requires:
   - A module listed below as **named** → `import { a, b } from './x';`
   - A module listed as **`export =`** → `import x = require('./x');`
   - An npm package → `import express from 'express';`, or `import { Router } from 'express';`
   - A Node built-in → `import fs from 'node:fs';`
3. Replace the export, using the shape in the inventory below:
   - **named** → put `export` on each declaration (or `export { a, b };` at the end), and delete `module.exports`;
   - **`export =`** → `export = value;` on the same value.
4. Annotate every parameter, and every return type of an exported function. Class fields get declared types (`private readonly enabled: boolean;`). Row results use `db.query<TransactionRow>(…)` (after step 5; before that, `query` comes from JavaScript and is untyped).
5. Unused parameters: prefix them with `_`. Never remove one from an Express error handler, because Express counts four parameters.
6. `catch (error)` is `unknown`. Narrow it with `error instanceof Error`, or pass it to `logger.error(message, error)` / `errorSummary(error)`.
7. External responses: declare an interface with only the fields that are read. Where the code already checks the shape, turn that check into a type guard (`function isX(v: unknown): v is X`).
8. Run `npm run build && npm test && npm run lint`. The test count and results must not change. A type error that reveals a real bug gets its own test-first commit (Global Constraints).

**Worked example: named (`utils/privacy.js`).** Only two lines change:

```ts
export function maskEmail(email: unknown): string {   // was: function maskEmail(email) {
// …body unchanged…
// deleted: module.exports = { maskEmail };
```

The parameter is `unknown` because the function's contract is to accept anything and never throw (its first line checks `typeof email !== 'string'`). The compiled output keeps `exports.maskEmail = maskEmail;`.

**Worked example: `export =` instance (`utils/logger.js`).**

```ts
import config = require('../config');            // was: const config = require('../config');

class Logger {
  private readonly enabled: boolean;

  constructor() {
    this.enabled = config.logging.enableConsoleLogs;
  }

  info(message: string, data: unknown = null): void { /* unchanged */ }
  error(message: string, error: unknown = null): void {
    const timestamp = new Date().toISOString();
    console.error(`[ERROR] ${timestamp} - ${message}`);
    if (error) {
      console.error((error instanceof Error && error.stack) || error);   // was: error.stack || error
    }
  }
  // audit / warn / debug: (message: string, data: unknown = null): void
  // auth(action: string, email: string, data: unknown = null): void
  // transaction(action: string, userId: number | string, data: unknown = null): void
  // investment(action: string, symbol: string, data: unknown = null): void
  // ai(action: string, userId: number | string, data: unknown = null): void
  // email(action: string, recipient: string, data: unknown = null): void
}

export = new Logger();                           // was: module.exports = new Logger();
```

`error.stack || error` printed `error` itself when there was no stack. The narrowed version does the same, so the output is unchanged. The compiled file ends in `module.exports = new Logger();`.

**Special cases:**
- **`services/aiPlanner.js`** exports an instance with `AiUnavailableError` attached. TypeScript cannot merge a namespace with an instance, so use `export = Object.assign(new AIPlanner(), { AiUnavailableError });`. `Object.assign` returns the same object, so this is the same runtime shape. `openai` must stay a public, assignable field, because `test/aiUnavailable.test.js` replaces it.
- **`services/emailService.js`** uses `exports.name = async (…) => …`. Convert each to `export async function name(…)`. `test/registerLogging.test.js` replaces the whole module through `require.cache`, which still works.
- **`db/connection.js`** is imported by tests as an object whose `query` and `getPool` they replace (`mock.method(db, 'query', …)`). The compiled named exports are plain `exports.query = query` assignments, so they stay replaceable. TypeScript consumers must use `import * as db from '../db/connection'` and call `db.query(…)`, never a destructured `query`, so the replacement is seen at call time. Its signature: `query<R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<R>>`.
- **Controllers** are object literals exported with `export =` whose methods call each other through the object (`aiController.parseAIResponse(…)`). Keep that. Annotate handlers as `async name(req: Request, res: Response): Promise<void>`, and turn `return res.status(…).json(…)` into `res.status(…).json(…); return;` only where the type checker requires it.
- **Scripts** (`db/setup`, `db/seed`) keep `if (require.main === module)`, and still `export =` their function.

---

# Steps 2–8: file inventory

Current export shape → TypeScript form. Dependencies inside a step don't constrain the order, because JavaScript and TypeScript modules can require each other.

| Step | File | Lines | Today | TypeScript |
|---|---|---|---|---|
| 2 | `config/index.js` | 164 | `module.exports = config` | `export = config` |
| 2 | `config/validate.js` | 66 | `module.exports = validateConfig` | `export = validateConfig` |
| 2 | `utils/dates.js` | 60 | named: `toDay, monthOf, formatDay, monthSpan` | named |
| 2 | `utils/errorHandler.js` | 62 | `module.exports = ErrorHandler` (class, static methods) | `export = ErrorHandler` |
| 2 | `utils/logger.js` | 94 | `module.exports = new Logger()` | `export = new Logger()` (worked example) |
| 2 | `utils/privacy.js` | 47 | named: `maskEmail` | named (worked example) |
| 2 | `utils/terms.js` | 228 | named: `TERMS, MONTHS_PER_TERM, isTermId, termOf, boundsOf, labelOf, currentTerm, previousTerm, nextTerm, lastNTerms, monthsOf, isYearId, yearBoundsOf, yearLabelOf, termsOfYear, currentYear, previousYear` | named |
| 3 | `services/import/tokens.js` | 251 | named: `parseAmount, extractAmounts, extractTrailingAmount, toCents, parseDate, parseDateDetail, splitLeadingDate, addDays, makeDay` | named |
| 3 | `services/import/rows.js` | 87 | named: `groupRows` | named |
| 3 | `services/import/categorize.js` | 52 | named: `categorize, KEYWORDS` | named |
| 3 | `services/import/classify.js` | 93 | named: `classifyLayout` | named |
| 3 | `services/import/duplicates.js` | 31 | named: `flagDuplicates` | named |
| 3 | `services/import/bankList.js` | 191 | named: `parseBankList` | named |
| 3 | `services/import/receipt.js` | 102 | named: `parseReceipt` | named |
| 3 | `services/import/uberActivity.js` | 91 | named: `parseUberActivity, splitDateTime` | named |
| 3 | `services/import/uberEats.js` | 88 | named: `parseUberEatsOrders, splitOrderLine` | named |
| 3 | `services/import/wechat.js` | 122 | named: `parseWechatPay, readWechatAmount, isStamp, isMonthHeader` | named |
| 3 | `services/import/parse.js` | 81 | named: `parseOcr, WARNING_FLAGS` | named |
| 4 | `services/aiPlanner.js` | 228 | `new AIPlanner()` + `.AiUnavailableError` | `export = Object.assign(new AIPlanner(), { AiUnavailableError })` |
| 4 | `services/cleanupService.js` | 46 | named: `deleteOldAIPlans, deleteUnverifiedAccounts` | named |
| 4 | `services/demoAccountService.js` | 180 | named: `refreshDemoAccount, refreshDemoAccountOnSchedule, DEMO_EMAIL, DEMO_PASSWORD, DEMO_PASSWORD_HASH, OWNED_TABLES` | named |
| 4 | `services/emailService.js` | 327 | `exports.sendWeeklyReport`, `exports.sendEmailVerification`, `exports.generateWeeklyReport` | named functions |
| 4 | `services/emailValidationService.js` | 174 | named: `validateEmail, validateAgainstDomainList, DISPOSABLE_EMAIL_DOMAINS, MAJOR_DOMAINS` | named; `isUsableResponse` becomes a type guard |
| 4 | `services/exchangeRateService.js` | 30 | named: `getExchangeRate` | named |
| 4 | `services/finnhubService.js` | 180 | `new FinnhubService()` | `export = new FinnhubService()` |
| 4 | `services/freeStockDataService.js` | 327 | `new FreeStockDataService()` | `export = new FreeStockDataService()` |
| 4 | `services/schedulerService.js` | 195 | `new SchedulerService()` | `export = new SchedulerService()` |
| 5 | `db/connection.js` | 103 | named: `query, getPool` | named, generic `query<R>` (special case) |
| 5 | `db/demoData.js` | 232 | named: `buildDemoData, CATEGORIES, DEMO_EMAIL, TERMS_OF_HISTORY, isCoopTerm` | named |
| 5 | `db/setup.js` | 26 | `module.exports = setupDatabase` | `export = setupDatabase` |
| 5 | `db/seed.js` | 46 | `module.exports = seedDatabase` | `export = seedDatabase` |
| 6 | `middleware/auth.js` | 20 | `module.exports = auth` | `export = auth`; `req.user = decoded as AuthUser` after checking `userId` is a number and `email` is a string, otherwise 401 exactly as a bad token is today |
| 6 | `middleware/rateLimiter.js` | 55 | named: `apiLimiter, authLimiter, aiLimiter, importLimiter` | named |
| 6 | `routes/{ai,auth,goals,import,investments,summary,transactions}.js` | 31–90 | `module.exports = router` | `export = router` |
| 6 | `controllers/{ai,auth,goal,import,investment,summary,transaction}Controller.js` | 49–546 | `module.exports = <object>` | `export = <object>`; the two `{ error: error.name, code: error.code }` log objects become `{ userId, ...errorSummary(error) }` |
| 7 | `app.js` | 108 | `module.exports = app` | `export = app`; `dev` → `tsx watch app.ts` |
| 8 | `test/*.test.js` (27), `test/helpers/ocrLayouts.js` | 4,400 | test files | `.test.ts`; `require.cache[p] = { … } as NodeModule`; assertions unchanged |

Per-step notes:
- **Step 3:** first write `types/import.ts` (`OcrLine`, `Row`, `Draft`, `DraftFlag`, `Layout`) from the JSDoc and the frontend's `lib/import/review.ts` and `lib/ocr/types.ts`. Then convert `tokens`, `rows`, the parsers, and `parse` last. Also run `cd eval && npm run benchmark` and `npm run benchmark -- --set private`; totals must equal the committed report and the 27/27 private result.
- **Step 4:** also send yourself the report email (`POST /auth/test-email` while signed in) and compare it with one sent before the step.
- **Step 5:** also run `createdb mindgo_ts_check && DATABASE_URL=postgresql://localhost/mindgo_ts_check npm run db:setup && … npm run db:seed`, then `TEST_DATABASE_URL=… npm test` (the `api.test.js` suite), then `dropdb mindgo_ts_check`. Never against Neon.
- **Step 6:** the largest step. If the controllers diff goes past about 1,500 lines, split it into 6a (middleware + routes + the three smallest controllers) and 6b (auth, investment, summary, transaction, ai), and say so in the PR.
- **Step 8:** the count stays 508. Compare `node --test` output test names before and after (`npm test 2>&1 | grep -E '^# Subtest|✔|✖' | sort`), and they must match exactly.

Each of steps 2–8 follows the same task sequence:

- [ ] Branch: `git fetch origin && git switch -c chore/ts-<n>-<name> origin/main`
- [ ] Convert the step's files with the recipe, one commit per file or per small group (`Convert utils/dates to TypeScript`)
- [ ] Commit each bug the type checker finds separately, test first
- [ ] Run the step checklist (spec §6.1) plus the step's note above
- [ ] Push and open the PR (title `… (step <n> of 9)`, listing converted files, bugs found and the test plan), when the user says so
- [ ] After merge: check that the Render deploy is healthy (`/health`) before starting the next step

---

# Step 9: Finish (branch `chore/ts-9-finish`)

### Task 9.1: Remove JavaScript support from the build and lint

**Files:** `backend/tsconfig.json`, `backend/eslint.config.mjs`

- [ ] `git ls-files backend | grep -E '\.js$'` prints nothing. If it prints a file, that file was missed; go back to its step.
- [ ] Remove `"allowJs": true` from `tsconfig.json`. `npm run build` must still pass.
- [ ] In `eslint.config.mjs`, delete the `files: ['**/*.js']` block and replace the header paragraph about "both kinds of file" with one saying the backend is TypeScript. `npm run lint` must be clean.
- [ ] `npm test`: 508 pass, 0 fail. Commit: `Drop JavaScript support from the backend build`.

### Task 9.2: Update the docs

**Files:** `CLAUDE.md`, `README.md`, `backend/ARCHITECTURE.md`, and the spec's status line

- [ ] **CLAUDE.md:**
  - replace every `backend/…/*.js` path and every `test/*.test.js` name with `.ts` (`grep -n '\.js' CLAUDE.md` should list only frontend and `eval/` files);
  - Backend commands: `dev` → `tsx watch app.ts`, and drop "Source is being converted";
  - Backend architecture gets a **TypeScript** bullet: CommonJS output in `dist/`, the export-shape rule, `import x = require()` for `export =` modules, `types/db.ts` updated together with `schema.sql` and every migration, `errorSummary`, `packageRoot` for files that aren't code, and no `any`;
  - Database: add "and `types/db.ts`" to the "Keep the two in step" rule.
- [ ] **README.md:**
  - Quick start: `npm install` in `backend/` also builds;
  - the architecture tree shows `.ts` files, `types/` and `dist/` (ignored);
  - the stack line says TypeScript on both sides;
  - development commands: `npm run build`;
  - the tests section: the count is 508.
- [ ] **`backend/ARCHITECTURE.md`:** the request flow mentions typed `req.user` (`types/express.d.ts`) and typed rows (`db.query<Row>`), and every file reference ends in `.ts`.
- [ ] **Spec status:** `implemented <date>, PRs #…`.
- [ ] Commit: `Describe the TypeScript backend in the docs`, then push, open the PR, merge and check the deploy, as in every step.

---

## Self-review (2026-09-17)

- **Spec coverage:**
  - §3.1 and §3.2 → Task 1;
  - §3.3 → Task 1, Steps 6–7;
  - §3.4 → Task 2;
  - §4.1 → the conversion recipe and inventory;
  - §4.2 → Task 4 (`import.ts` in step 3, see the note there);
  - §4.3 → recipe items 4 and 7, plus the `emailValidationService` and `auth` rows;
  - §4.4 → Task 3, plus the controller row in step 6;
  - §5 → Global Constraints and recipe item 8;
  - §6 → the step sequences;
  - §6.2 → Task 6, Step 4;
  - §7: CI needs no edit, because `npm ci` runs `prepare`, and `db:setup` and `npm test` now use `dist/`;
  - §8 → Task 9.2;
  - §9 → Task 6 Step 4, and the Step 6 split note.
- **Changes from the spec, found while prototyping** (the spec is updated in the same commit as this plan):
  - `aiPlanner` uses `Object.assign`, not a namespace merge;
  - `types/import.ts` is written in step 3;
  - `dev` is `tsx watch app.js` from step 1, and `nodemon` is removed;
  - TypeScript is pinned to `~6.0.3`;
  - the test glob is `'dist/test/**/*.test.js'`;
  - the test count is 508.
