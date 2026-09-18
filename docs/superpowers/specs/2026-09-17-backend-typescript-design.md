# Backend TypeScript Conversion: Design

**Date:** 2026-09-17 · **Status:** implemented 2026-09-18, PRs #36–#43 (steps 1–8) plus this step’s · **First branch:** `chore/ts-1-tooling` · **Plan:** `docs/superpowers/plans/2026-09-17-backend-typescript.md` — untracked; recoverable from git history

## 1. Goal

Convert the backend (`backend/`: 48 source files, about 6,900 lines, plus 28 test
files, about 4,400 lines) from CommonJS JavaScript to strict TypeScript.
**Behaviour stays the same.** Every endpoint, response body, status code and log
line after the conversion matches what it was before, and every existing test
still passes. The suite reports 508 from step 1 on: step 1 adds 8 tests (3 in
`packageRoot`, 5 in `errorSummary`) to the 500 already there. An earlier draft
said 507, subtracting one more for `test/helpers/ocrLayouts`; the measured
count puts the base at 500 under the new glob, the same figure the old docs
reported, so that subtraction was counted twice.

Success means:

- `backend/` contains no `.js` source or test files. The only JavaScript left is
  `eslint.config.mjs` (tool config, like the frontend's) and generated output in
  `dist/`.
- `tsc` passes with `strict`, `noUncheckedIndexedAccess` and `noUnusedLocals`.
- Render deploys the compiled output, and its Build and Start commands in the
  dashboard stay as they are (`npm install`, `npm start`).
  > **2026-09-17:** Render's Build Command is now `npm ci --include=dev`; see
  > the note under §6.2.
- The docs describe the TypeScript backend.

### Out of scope

- Response types shared with the frontend.
- A query builder or ORM in place of SQL strings.
- Restructuring controllers or services.
- Converting `eval/`.
- Converting the frontend's config files.
- Any change in behaviour, apart from real bugs the type checker finds (§5).

## 2. Approach

TypeScript is **compiled with `tsc` to `backend/dist/` as CommonJS**, and the
work is done **in nine steps**. Each step is its own PR, merged to `main` and
deployable before the next one starts.

We rejected two alternatives:

- **Node running TypeScript directly (type stripping).** It needs Node 22.18 or
  later on Render and restricts the syntax that can be used. In practice it also
  forces ES modules, and ES module exports are frozen. About a dozen test files
  replace modules through `require.cache` or `mock.method(module, …)`, and all
  of them would have to be rewritten around Node's experimental
  `mock.module`.
- **`tsx` as the runtime in production.** It puts a loader in production, slows
  startup, and leaves type checking to a separate CI step.

Doing it in steps follows the lesson from the stacked PRs that never reached
`main`: one branch per step, each branched from the latest `main`.

## 3. Build and layout

### 3.1 Source and output

The source tree stays where it is, with `.js` files renamed to `.ts`:
`app.ts`, `config/`, `controllers/`, `db/`, `middleware/`, `routes/`,
`services/`, `utils/` and `test/`. Two new directories are added:

- `backend/types/`: shared type declarations (§4.2).
- `backend/dist/`: compiler output, gitignored.

`tsconfig.json`:

| Option | Value | Why |
|---|---|---|
| `module` / `moduleResolution` | `nodenext` | With no `"type"` field in `package.json`, `.ts` files compile to CommonJS |
| `target` | `es2022` | CI runs Node 22 |
| `rootDir` / `outDir` | `.` / `dist` | `dist/` has the same layout as the source tree |
| `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters` | `true` | Unused Express arguments are named with a leading `_` |
| `allowJs` | `true` in steps 1–8, removed in step 9 | Lets JavaScript and TypeScript files live side by side |
| `esModuleInterop` | `true` | Default imports from CommonJS packages (`express`, `pg`) |
| `sourceMap` | `true` | Stack traces point at `.ts` lines |
| `exclude` | `node_modules`, `dist` | |

### 3.2 npm scripts

| Script | Command |
|---|---|
| `build` | `tsc` |
| `prepare` | `npm run build`, which `npm install` and `npm ci` run automatically, so Render's existing Build Command compiles the backend |
| `start` | `node dist/app.js` |
| `dev` | `tsx watch app.js`, and `app.ts` from step 7. Plain `node` and `nodemon` cannot `require()` a `.ts` module from JavaScript source, so `nodemon` is removed |
| `test` | `npm run build && node --test 'dist/test/**/*.test.js'` (`node --test` does not accept a directory) |
| `db:setup` / `db:seed` | `node dist/db/setup.js` / `node dist/db/seed.js` |
| `lint` | `eslint .`, using `typescript-eslint`. The config becomes `eslint.config.mjs`, and `dist/` is ignored |

New devDependencies: `typescript` (pinned `~6.0.3`, because `typescript-eslint` 8 supports only `<6.1`), `tsx`, `typescript-eslint`, `@eslint/js` (already installed through `eslint`, but now imported directly),
`@types/node`, `@types/express`, `@types/pg`, `@types/jsonwebtoken`,
`@types/bcryptjs`, `@types/cors`, `@types/morgan`, `@types/nodemailer` (7, matching `nodemailer` 7),
`@types/node-cron` (only where the package does not ship its own types), and
`@types/supertest`.

### 3.3 Files that aren't code

`db/schema.sql`, `db/migrations/` and `test/fixtures/` stay where they are and
are never copied into `dist/`. A new `utils/packageRoot.ts` returns the
directory of the nearest `package.json` above the calling file, which is
`backend/` whether the code runs from source or from `dist/`. It is used by:

- `db/setup` (to find `schema.sql`);
- `test/importFixtures` (to find `test/fixtures/ocr/`);
- `test/demoData` (to find `frontend/pages/transactions/new.tsx`).

`dotenv` keeps loading `.env` from the working directory, which is `backend/`
for every npm script.

### 3.4 `eval/`

`eval/run.mjs` and `eval/lib/score.cjs` require
`backend/dist/services/import/parse`. If that file is missing, `run.mjs` stops
with the message *"Run `npm install` in backend/ first; it builds the parser."*
The backend's `importFixtures` test requires `eval/lib/score.cjs`, which then
loads the compiled parser from the same `dist/`, so there is still only one
parser.

## 4. How the code is typed

### 4.1 Export shape is preserved

While JavaScript and TypeScript coexist, a JavaScript `require()` must keep
getting exactly what it gets today. The rules:

| Today | After conversion |
|---|---|
| `module.exports = { a, b }` (22 modules) | `export { a, b }` / `export function a` |
| `module.exports = <single value>`: a class instance, router, function or config object (26 modules — this said 23 when the spec was written, an undercount; the pre-conversion tree had 27, one of which was `eslint.config.js`, never destined to be `.ts`) | `export = value` |
| `module.exports.X = …` added to a single value (`aiPlanner.AiUnavailableError`) | `export = Object.assign(value, { X })`, the same object with the same property. TypeScript cannot merge a namespace with an instance |

`export default` is not used anywhere during the conversion. Changing export
shapes is out of scope, even after step 9.

TypeScript files import `export =` modules with `import x = require('./x')`,
and named-export modules with `import { a } from './x'`.

### 4.2 Shared types (`backend/types/`)

- `express.d.ts` adds `user: AuthUser` to Express's `Request`, where
  `AuthUser = { userId: number; email: string }`. These are the two fields
  signed into the JWT in `authController`, and every protected route reads them
  (`userId` 52 times, `email` once).
- `db.ts` has one row interface per table (`UserRow`, `TransactionRow`,
  `SavingsGoalRow`, `WatchlistRow`, `AiPlanRow`, `ImportBatchRow`), written by
  hand from `db/schema.sql`. `DATE` columns are `string`, because of the type
  parser in `db/connection` (see CLAUDE.md, *Dates are days*). `DECIMAL`
  columns are `string`, because that is what `pg` returns. `db.query` becomes
  `query<R extends QueryResultRow>(text, params?): Promise<QueryResult<R>>`.
- `import.ts` (written in step 3, together with the parser it describes) has the parser's shapes: `OcrLine`, `Row`, `Draft`, `DraftFlag`
  and `Layout`. They match the frontend's `lib/import/review.ts` and
  `lib/ocr/types.ts` by hand, not through shared code.

A migration that changes the schema must update `types/db.ts` too. CLAUDE.md
will say so, next to its existing `schema.sql` rule.

### 4.3 Data from outside

- Responses from Finnhub, Yahoo Finance, Alpha Vantage, OpenAI, MailboxLayer
  and the exchange-rate API are typed only for the fields the code reads.
- Where the code already checks a response's shape (`emailValidationService`'s
  `isUsableResponse`, the exchange-rate checks), the value comes in as
  `unknown` and that check becomes a type guard, so the check and the type
  cannot drift apart.
- Request bodies are typed after `express-validator` has run.
- `@typescript-eslint/no-explicit-any` is an error. The only exceptions are
  individually disabled lines at third-party boundaries, each with a comment
  saying why.

### 4.4 Errors and logging

`catch` variables are `unknown`. A new `utils/errorSummary.ts` exports
`errorSummary(e: unknown): { error: string; code?: string }`, the only way a
caught error reaches a log line. That keeps the rule in one place: *never log
OCR text, row values, request bodies or credentials*. Existing log calls keep
their exact output.

## 5. Behaviour preservation

- A conversion commit changes only types and syntax (`require` to `import`,
  added annotations, `_` prefixes).
- If the type checker exposes a real bug (a possibly-undefined value used
  without a check, a string compared to a number, a missing `await`), the fix
  is **a separate commit with a test that fails first**. It is listed under
  *Bugs found* in that step's PR, and is never folded into a conversion commit.
- If a test breaks during a conversion step for a module-loading reason, the
  conversion is wrong: fix the conversion, not the test.
- Until step 8, tests stay JavaScript. `allowJs` compiles them into
  `dist/test/`, and they require the compiled modules through the same
  relative paths they use today. So they check the converted code without
  having been touched. Step 8 converts the tests themselves without changing
  what they assert.

## 6. The steps

| # | Branch | Contents | Files |
|---|---|---|---|
| 1 | `chore/ts-1-tooling` | This spec and the plan. `tsconfig.json`, scripts, devDependencies, the `typescript-eslint` config, `types/db.ts` and `types/express.d.ts`, `utils/packageRoot.ts`, `utils/errorSummary.ts`, the three §3.3 callers, `eval/` requiring `dist/`, CI, `.gitignore`. No other source converted. | about 12 |
| 2 | `chore/ts-2-utils-config` | `utils/*`, `config/*` | 7 |
| 3 | `chore/ts-3-import-parser` | `services/import/*` | 11 |
| 4 | `chore/ts-4-services` | `aiPlanner`, `emailService`, `emailValidationService`, `exchangeRateService`, `finnhubService`, `freeStockDataService`, `schedulerService`, `cleanupService`, `demoAccountService` | 9 |
| 5 | `chore/ts-5-db` | `db/connection`, `db/setup`, `db/seed`, `db/demoData` | 4 |
| 6 | `chore/ts-6-http` | `middleware/*`, `routes/*`, `controllers/*` | 16 |
| 7 | `chore/ts-7-app` | `app.ts`, and `dev` switched to `tsx watch app.ts` | 1 |
| 8 | `chore/ts-8-tests` | `test/*.test.ts`, `test/helpers/ocrLayouts.ts` | 28 |
| 9 | `chore/ts-9-finish` | Remove `allowJs` and the JavaScript lint config. Update CLAUDE.md, README.md and `backend/ARCHITECTURE.md` | – |

If step 4 or step 6 grows past a comfortable review size, split it, and say so
in the PR.

### 6.1 Every step

Before a step's PR is merged, all of these must pass:

1. `npm run build` with no errors.
2. `npm test`: 508 pass, 0 fail.
3. `npm run lint`, clean.
4. `npm start`, and `GET /health` returns 200.
5. CI is green.
6. A quick check against the running local app: log in, open the dashboard,
   and import one synthetic screenshot through to the review step. Plus
   whatever the step touched:
   - step 4: the report email, with `POST /auth/test-email` to your own
     address;
   - step 5: `db:setup` and `db:seed` against a throwaway local database.

### 6.2 Step 1 also checks the deploy

After step 1 is merged, the Render deploy log must show `tsc` running during
`npm install`, and the live `/health` must answer. If Render did not install
the devDependencies (it skips them when `NODE_ENV=production` is set at build
time), change the Build Command to `npm install --include=dev`, once, before
step 2.

> **2026-09-17:** Render's Build Command is now `npm ci --include=dev`
> (Start Command stays `npm start`) — the old `yarn` build never ran
> `prepare`, so neither devDependencies nor the `tsc` build ran. The
> `npm install --include=dev` fix above describes an intermediate state;
> treat `npm ci --include=dev` as current for step 2 onward.

## 7. CI

The backend job keeps `npm ci`, which runs `prepare` and so builds the
backend. After that, `npm run lint`, `npm run db:setup` (now from `dist/`) and
`npm test` run against the Postgres service container. The frontend job does
not change.

## 8. Docs (step 9)

- **CLAUDE.md:**
  - backend commands, the build and `dist/`;
  - the export-shape rule (§4.1) and `types/`;
  - `types/db.ts` updated together with `schema.sql` and migrations;
  - `errorSummary`;
  - every `backend/**/*.js` path renamed to `.ts`.
- **README.md:** Quick start (`npm install` builds the backend), the
  architecture tree, the stack line and the development commands.
- **`backend/ARCHITECTURE.md`:** the request flow with typed `req.user` and
  typed rows.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Render skips devDependencies, so `tsc` is missing | Found in step 1, before any real code moves. The fix is one dashboard change (§6.2) |
| `prepare` slows every local `npm install` by a few seconds, and fails the install when the build fails | Accepted. A broken build should not be installable or deployable |
| Tests that replace modules stop working | Keeping CommonJS output and each module's export shape preserves `require.cache` and `mock.method`. A failure means the conversion is wrong (§5) |
| `eval/` runs with no built backend | `run.mjs` prints a clear message (§3.4) |
| Strict mode turns up many real bugs in old code (controllers, stock services) | Each gets its own commit and test (§5). Split the step if it grows |
| A step is merged and breaks production | Each step is one merge commit. Revert it on `main` and Render redeploys the previous build |
