# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

MindGo is a personal finance app: an Express/PostgreSQL REST API (`backend/`), a Next.js/TypeScript frontend (`frontend/`), and an Expo/React Native client (`mobile/`). All three are separate npm projects with independent `package.json` files — run commands from within the relevant subdirectory. They are deliberately *not* npm workspaces: workspaces consolidate every lockfile at the repo root, which breaks `npm ci` for both deploys, since Render builds with root directory `backend` and Vercel with `frontend`.

## Commands

### Backend (`cd backend`)
```bash
npm install            # also builds: `prepare` runs tsc into dist/
npm run build          # clears dist/, then tsc → dist/ (CommonJS). Source is TypeScript: docs/superpowers/specs/2026-09-17-backend-typescript-design.md
npm run dev            # tsx watch app.ts (plain node cannot require the .ts modules)
npm start              # node dist/app.js (production — the compiled output, which is .js)
npm run db:setup       # create schema from db/schema.sql (idempotent, CREATE IF NOT EXISTS)
npm run db:seed        # (re)seed the demo account (john.doe@example.com / password123)
npm run lint           # eslint . (eslint 9, flat config in eslint.config.mjs; TypeScript only, via typescript-eslint)
npm test               # builds, then node --test 'dist/test/**/*.test.js' — unit tests always run; see below for the integration suite
```

### Frontend (`cd frontend`)
```bash
npm run dev            # next dev  (http://localhost:3000)
npm run build          # next build
npm start              # next start (serve production build)
npm run lint           # next lint (needs .eslintrc.json — without it, it prompts and hangs)
npm run check:locales  # fails on duplicate keys in public/locales/*/common.json
npm run ocr-assets     # fetch + checksum the OCR model into public/models, copy ONNX Runtime into public/ort (runs before dev/build)
# There is still no `npm test` in the frontend, despite README claims.
```

### Mobile (`cd mobile`)

Expo SDK 57 + Expo Router, talking to the same API. [mobile/README.md](mobile/README.md) covers running it on a phone.

```bash
npm install
npx expo start          # then scan the QR with Expo Go, or press `i` for the simulator
npx tsc --noEmit        # typecheck
npx expo lint           # eslint (eslint-config-expo)
npx expo-doctor         # dependency and config health
npx expo export --platform ios   # bundle — catches what typecheck cannot
```

Signing in to Expo Go requires `npx expo login` **and** the same account signed in on the phone; the dev server then appears under "Development servers" and no QR is needed. There is deliberately **no `babel.config.js`**: the Expo Router install doc says to add one, but `babel-preset-expo` resolves only under `expo/` in SDK 57, so a hand-written config breaks Metro with `MODULE_NOT_FOUND`. There is no test runner yet, the same gap the frontend has.

### Evaluation (`cd eval`)

`eval/` loads the parser from `backend/dist/`, so run `npm run build` in `backend/` after any parser change before `npm run benchmark` or `npm run fixtures`.

```bash
npm install
npm run generate       # regenerate the synthetic screenshot set
npm run benchmark      # run OCR on eval/synthetic with the shipped profile (cached by image hash) and score it
npm run benchmark -- --set private          # score against real screenshots (eval/private/, gitignored)
npm run benchmark -- --preset … --strategy … --engine …  # try a different OCR configuration
npm run fixtures       # re-record backend/test/fixtures/ocr/ after a model change
npm test               # node --test — scorer unit tests
```

## Tests

`backend/test/` holds the only automated tests. `npm test` builds the backend, then runs the compiled tests via `node --test` — no test framework is installed, and none is needed.

- **Unit tests always run**, with no database and no network: `exchangeRateService.test.ts` (conversion, caching, and the failure modes that would silently produce a plausible wrong number), `configValidate.test.ts` (the startup check, exercised in a child process because it calls `process.exit`), `packageRoot.test.ts` (finding `backend/` from source or `dist/`), `errorSummary.test.ts` (the only shape a caught error takes in a log), `cleanupService.test.ts` (`db.query` mocked; asserts both retention predicates and that errors propagate), `schedulerService.test.ts` (the interval plumbing, via `mock.timers`, and the weekly report's next run on a UTC clock), `aiUnavailable.test.ts` (an OpenAI account out of credit or rate-limited answers 503 `ai_unavailable` on every AI endpoint, through the real router with a fake client), `privacy.test.ts` (`maskEmail`, including every input that would make it throw inside a log line), `registerLogging.test.ts` (runs the real `register` handler with stubbed collaborators and asserts no token or raw address reaches the log), `emailValidation.test.ts` (every way MailboxLayer can fail to answer, each of which must degrade rather than block), `logger.test.ts` (which levels survive `NODE_ENV=production`), `terms.test.ts` (the term calendar, swept across four timezones in-process), `autoDeleteValidation.test.ts` (mounts the real transactions router on an ephemeral port and asserts a rejected `months` never reaches `db.query`), `rollingSummary.test.ts` (which window each request selects — term, year and rolling — through the real router, swept across four timezones), `dates.test.ts` (the `DATE` type parser, the day helpers, and `monthlyBreakdown` keys asserted through the real router in three timezones), `importTokens.test.ts`, `importRows.test.ts`, `importClassify.test.ts`, `importBankList.test.ts`, and `importReceipt.test.ts` (the screenshot parser's pieces, unit by unit), `importUberActivity.test.ts` (Uber's trip list: date-and-time lines, buttons and map text ignored, category fixed to Transportation), `importUberEats.test.ts` (Uber Eats' Past orders tab: squeezed order lines, store logos kept out of descriptions, category from the store alone), `importWechat.test.ts` (WeChat Pay's list: yuan amounts with stray characters, years from month headers, direction from the sign), `importParse.test.ts` (the parser end to end, against hand-built layouts in `test/helpers/ocrLayouts.ts`), `importFixtures.test.ts` (replays recorded OCR output from `eval/` through the real parser; fails on any silent amount or type error; it requires eval/lib/score.cjs, so a checkout without eval/ cannot run the backend suite), and `importRoutes.test.ts` (both import endpoints through the real routers with `db.query` stubbed; asserts nothing logged contains screenshot text or row values, even when the database throws). `test/helpers/ocrLayouts.ts` is not a test file and is not run — `npm test`'s `dist/test/**/*.test.js` glob does not match it.

  **`sharedContracts.test.ts` pins the code the three projects copy.** `frontend/` and `mobile/` cannot import each other — React Native's `View` is not React DOM's `div` — and a shared package would move every lockfile to the repo root and break both deploys (see Overview). So three things are duplicated on purpose and guarded instead: the day helpers (`mobile/src/lib/date.ts` must end with `frontend/lib/date.ts` verbatim), the category list, and `CATEGORY_COLORS` plus `FALLBACK_COLORS`. It reads files outside `backend/`, so like `demoData.test.ts` it fails on a checkout without `frontend/` or `mobile/`. Note what it does **not** pin: `backend/utils/dates.ts` is not a copy of `frontend/lib/date.ts` — they share a name and a purpose but expose different functions, and only `toDay` and `formatDay` overlap.

  One trap in `schedulerService.test.ts`: `mock.timers`' fake `Timeout` **ignores `unref()`** — `hasRef()` stays `true` however you call it — so the one test that checks the timer does not hold the event loop open has to run on a real timer, in its own `describe`.
- **`api.test.ts` needs a database and skips without one.** It refuses to borrow `DATABASE_URL` from `.env`; point it at a throwaway database instead:

  ```bash
  TEST_DATABASE_URL=postgresql://user@localhost:5432/mindgo_test npm test
  ```

  The database must already have the schema (`npm run db:setup`). The suite creates and deletes users, which is why opting in is deliberate — never point it at production.

  It raises `RATE_LIMIT_AUTH_MAX` for itself. `authLimiter` allows 5 requests per 15 minutes per IP across `/register`, `/login`, `/resend-verification` and `/test-email` **combined**, and a suite that touches both login and register trips that almost immediately.

The frontend has no tests. Verify UI changes by running the app.

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs lint plus tests for the backend against a Postgres service container, and `check:locales`, lint and `build` for the frontend. It uses `npm ci`, so a `package.json` that disagrees with its lockfile fails the build rather than resolving to whatever the registry serves.

## Ports (README is stale on this)

- Backend listens on `config.port` = `PORT` env or **3001** (README's mention of port 5000 is wrong).
- Frontend calls `NEXT_PUBLIC_API_URL` or defaults to `http://localhost:3001` ([frontend/utils/api.ts](frontend/utils/api.ts)).
- CORS origin defaults to `http://localhost:3000`.

## Backend architecture

Request flow: **route → (auth middleware) → validation → controller → service/db**. [backend/ARCHITECTURE.md](backend/ARCHITECTURE.md) has the diagram, the patterns in use, and where the layering still leaks.

- **TypeScript**, compiled to **CommonJS in `dist/`** by `tsc` (`module: nodenext`, no `"type": "module"` in `package.json`). `dist/` is gitignored and is what `npm start`, `npm test` and `db:setup` run; `npm run dev` runs the source through `tsx`. Conventions, all of which the conversion preserved deliberately (spec §4.1):
  - **Export shape is the CommonJS one.** A module that was `module.exports = <single value>` is `export = value` — every router and controller, `config`, `logger`, `errorHandler`, `auth`, and the service singletons — and is imported with `import x = require('./x')`, not `import x from`. A module that was `module.exports = { a, b }` uses named exports and an ordinary `import { a } from './x'`. `aiPlanner` is the one hybrid: `export = Object.assign(new AIPlanner(), { AiUnavailableError })`, because TypeScript cannot merge a namespace with an instance. **`export default` is used nowhere**, and changing an export shape is out of scope.
  - **[backend/types/](backend/types/) holds the shared types**: [types/db.ts](backend/types/db.ts) (one interface per table — see the Database section; it is edited with `schema.sql` and every migration), [types/express.d.ts](backend/types/express.d.ts) (merges `AuthUser` into Express's own `Request`, which is why a controller reads `req.user.userId` with no cast), and [types/import.ts](backend/types/import.ts) (the screenshot parser's vocabulary).
  - **Row types are named at the call site**: `query<TransactionRow>(sql, params)`. `query()` is generic but cannot infer a shape from a SQL string, so an unparameterised call gives you `QueryResultRow` and nothing useful.
  - **On the import path, a caught error reaches a log only through `errorSummary(e)`** ([backend/utils/errorSummary.ts](backend/utils/errorSummary.ts)), which yields `{ error, code }` and never the message — a pg error's message can quote the row that failed. It is the shared form of the `{ userId, error, code }` objects the two import endpoints log, and those two are its only callers. **Everywhere else a caught error is still passed whole** to `console.error`/`logger.error` — about 57 sites — and `logger.error` prints its stack, message included. So this is a rule the import path keeps, not an invariant the backend has: if you are auditing whether error messages reach logs, the answer is that outside the import path they do.
  - **Anything reading a file that is not code** — `schema.sql`, test fixtures, `eval/` — resolves from `packageRoot(__dirname)` ([backend/utils/packageRoot.ts](backend/utils/packageRoot.ts)). A path built from `__dirname` alone points into `dist/` once compiled, where those files were never copied.
  - **No `any`.** `@typescript-eslint/no-explicit-any` is an error and there are no `eslint-disable`s for it. `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals` and `noUnusedParameters` are all on.
- [backend/app.ts](backend/app.ts) wires helmet, morgan, cors, JSON parsing, mounts routers under `/auth`, `/transactions`, `/summary`, `/goals`, `/investments`, `/ai`, then global error + 404 handlers. On startup it also calls `schedulerService.init()`.
- **All config is centralized** in [backend/config/index.ts](backend/config/index.ts) — ports, JWT settings, cron schedules, data-retention windows, validation limits, and API keys. Read env vars from here, not `process.env` directly, when adding features.
- **Auth**: [backend/middleware/auth.ts](backend/middleware/auth.ts) verifies the `Authorization: Bearer <token>` JWT and sets `req.user`. Protected routers apply it globally with `router.use(auth)` at the top of the route file (see [backend/routes/transactions.ts](backend/routes/transactions.ts)). Controllers read the user id as **`req.user.userId`**.
- **Validation**: use `express-validator` `body([...])` arrays in the route file, then check `validationResult(req)` at the top of the controller method. Query parameters take `query([...])` the same way — only `DELETE /transactions/auto-delete` does so far, and only because it deletes rows.
- **Terms**: [backend/utils/terms.ts](backend/utils/terms.ts) is the single definition of the Waterloo term calendar (Winter Jan–Apr, Spring May–Aug, Fall Sep–Dec). `GET /summary/rolling` takes **exactly one** of `?term=2026-spring|current|previous`, `?year=2026|current|previous`, or `?months=N` — passing more than one is a 400 — and echoes `term`, `year`, `periodLabel`, `termLabel`, `startDate`, `endDate` so a client never computes a date or a name. **A year is three terms**, not twelve rolling months: the terms tile Jan–Dec exactly, so `?year=2026` shares its boundaries with Winter/Spring/Fall 2026 and its totals are always their sum. The dashboard's period selector (This term / Last term / This year / Last year) defaults to `term=current`. Anything needing term boundaries — the summary views, and the retention job when it lands — must go through it rather than computing its own, because a view and a deletion that disagree about where a term starts would fail silently. Bounds are half-open `[start, end)`, matching the `date >= $1 AND date < $2` queries. **Do not build dates with `new Date(y, m, d).toISOString()`** anywhere: it is off by a day east of UTC. All known instances are gone (items 21 and 23); use integer arithmetic, or `toDay()` from `utils/dates.ts` when starting from a `Date`.
- **Address validation at registration**: [backend/services/emailValidationService.ts](backend/services/emailValidationService.ts) exports one function, `validateEmail(email)` → `{ valid, reason?, source }`. MailboxLayer where `MAILBOXLAYER_API_KEY` is set, its own 30-domain disposable list otherwise. **It never throws and never blocks on its own failure** — no key, a network error, an HTTP error, an apilayer error payload (HTTP 200 with `success: false`) or an unrecognised response shape all fall back to the domain list, loudly via `console.error`. The previous version turned each of those into a rejected or 500ing registration. Keep that property if you touch it: `test/emailValidation.test.ts` has a case per failure mode.
- **Log levels**: [backend/utils/logger.ts](backend/utils/logger.ts). `info`, `warn` and `debug` are gated on `config.logging.enableConsoleLogs` = `NODE_ENV === 'development'`, so **they print nothing in production**. `error` and `audit` always print. Use `logger.audit` only for events that destroy or irreversibly change user data — the retention deletions do, which is why they moved off `info`. `LOG_LEVEL` is close to inert: it gates `debug()` and nothing else.
- **Logging user data**: **never log a credential** — verification tokens, JWTs, password hashes. For addresses, the rule is *log a user id where one exists, and a masked address only where one does not* (before the INSERT, or when a lookup found nothing). `maskEmail()` in [backend/utils/privacy.ts](backend/utils/privacy.ts) produces `j***@example.com`. Registration leaked verification tokens this way once; `test/registerLogging.test.ts` guards it by running the real handler and inspecting everything it printed.
- **Dates are days, not instants**: `db/connection.ts` registers a `pg` type parser so a `DATE` column arrives as the plain string `'2026-08-28'`. Without it node-pg builds a `Date` at the *server's* local midnight and `res.json()` re-serialises that in UTC, so one stored day left the server as a different string per host and every viewer west of it read the day before. Consequences worth keeping in mind: **never `new Date(day).getMonth()`** — a plain `'2026-08-01'` parses as UTC midnight and answers July west of UTC, which silently files a month of transactions under the month before. Use [backend/utils/dates.ts](backend/utils/dates.ts) (`toDay`, `monthOf`, `formatDay`, `monthSpan`) on the backend and [frontend/lib/date.ts](frontend/lib/date.ts) (`toDay`, `formatDay`, `formatDayRange`, `todayDay`, `daysUntil`) on the frontend. Both accept `'2026-08-28'` and `'2026-08-28T00:00:00.000Z'`, so a stale deploy of either side still renders the right day. The frontend copy has no test — the frontend has no runner — but the backend twin is covered by `test/dates.test.ts`.
- **DB access**: [backend/db/connection.ts](backend/db/connection.ts) exports `query(text, params)`. Notable pattern: the `pg` Pool is **lazily created and auto-closed after 5 minutes of inactivity** to save connections. Always use parameterized queries (`$1, $2, ...`); controllers build filtered queries by incrementing a `paramCount` (see `getTransactions`).
- **Multi-currency**: monetary rows store a `currency` column; conversion happens at read time via `services/exchangeRateService.ts`. Allowed currencies: `CAD, USD, EUR, GBP, AUD, CNY`.
- **Stock data has layered fallbacks**: `finnhubService` (API key), `freeStockDataService` (Yahoo Finance via spoofed browser headers, no key, rate-limited with deliberate delays + 5-min in-memory cache), and Alpha Vantage. Expect rate-limiting logic and caching when touching investment features.
- **Scheduler** ([backend/services/schedulerService.ts](backend/services/schedulerService.ts)): weekly report emails via `node-cron`, plus `setInterval` cleanup jobs for expired AI plans and unverified accounts. The deletions themselves live in [backend/services/cleanupService.ts](backend/services/cleanupService.ts) and **throw** on failure rather than logging and returning — the caller decides what a failed cleanup means. Nothing mounts them over HTTP; the scheduler is the only caller. The weekly report runs at 7 p.m. `config.cron.timezone` (America/Toronto), not host time — the host is UTC. **node-cron must stay at 4.6 or later**: 4.2 computed "next Sunday" as 2034-01-01 and slept until then, so the weekly email never went out. Add a new recurring job through `scheduleInterval(name, ms, task)`, which awaits the task, logs the row count, and `unref()`s the timer; a bare `setInterval` with a synchronous `try`/`catch` around an async call silently reports success.
- **Screenshot import**: OCR runs entirely in the browser ([frontend/lib/ocr/](frontend/lib/ocr/)) — the image never reaches the server. `POST /import/parse` ([backend/routes/import.ts](backend/routes/import.ts)) turns the OCR lines it receives into draft rows and stores nothing. `POST /transactions/import` writes the confirmed rows and one `import_batches` record in a single statement. `classify.ts` picks one of five layouts — `bank-list`, `receipt`, `uber-activity`, `uber-eats-orders`, `wechat-pay` — each parsed by its own module; the rules, and the measured gap thresholds behind them, are in the spec's §4 ([docs/superpowers/specs/2026-09-16-ocr-import-design.md](docs/superpowers/specs/2026-09-16-ocr-import-design.md)). A parser that sets `category` itself (including `null`) overrides the keyword guess. Fixtures copied from real screenshots keep the OCR boxes and replace personal details — keep it that way; real screenshots live only in the gitignored `eval/private/`. On a bank list an unsigned amount always carries `type_guessed`, because OCR drops minus signs with high confidence (a receipt or an Uber trip or order list fixes the direction by layout, so it does not; WeChat Pay prints its own + and −); the running-balance check verifies the amount only, never direction, for the same reason. **Never log OCR text, row values or request bodies** — errors are `{ userId, error: error.name, code: error.code }`, nothing more. The model is chosen by `eval/`'s benchmark and pinned in both [frontend/lib/ocr/profile.json](frontend/lib/ocr/profile.json) and [frontend/scripts/ocr-assets.js](frontend/scripts/ocr-assets.js) — change them together, then re-run the benchmark and `npm run fixtures` so the recorded backend fixtures match the new output.

### Database
**Demo data is generated, not hardcoded.** [backend/db/demoData.ts](backend/db/demoData.ts) builds the demo account relative to `new Date()` — five terms of a Waterloo co-op student, alternating study and work terms, with the current term truncated at today. It exists because the old `seed.sql` hardcoded dates in 2025, so by August 2026 the demo's default window (`?term=current`) was empty and all three savings goals showed as overdue. Amounts are jittered by a seeded generator keyed on term and category, so the same day always produces identical data. `db:seed` **replaces** the demo user's rows inside one transaction using a dedicated client (`db.getPool().connect()` — `db.query` would put `BEGIN` and `COMMIT` on different pooled connections); the old seeder relied on `ON CONFLICT DO NOTHING`, which caught nothing because those tables have no unique constraint, so a second run duplicated every row. `db:seed` is the only entry point permitted to create the account; the scheduled refresh passes `create: false` and will not conjure its own target.

**The scheduled refresh is opt-in** (`DEMO_REFRESH_ENABLED=true`, every 30 days). The write itself lives in [backend/services/demoAccountService.ts](backend/services/demoAccountService.ts), shared by both callers so they cannot drift. It resolves the demo account by the **`is_demo`** column (migration `007`, unique partial index — at most one), never by email: `john.doe@example.com` is an ordinary address nothing reserves, and a timer pointed at a guessable string would wipe a real account's data monthly with nobody watching. Run by hand that exposure is bounded because a human is present; on a schedule it is not. The first `db:seed` after migration 007 adopts the existing demo row by setting the flag on it. The refresh throws rather than logging and returning, like `cleanupService`, and returns its **deleted** row count so `scheduleInterval` audits the destructive half per decision D.

Schema lives in [backend/db/schema.sql](backend/db/schema.sql) and is applied wholesale by `db:setup`, which is idempotent and safe to re-run. Tables: `users`, `transactions`, `savings_goals`, `watchlist`, `ai_plans`, `import_batches`. `updated_at` is auto-maintained by triggers. `transactions.source` (migration `011`) is `manual`, `ocr`, or `ocr_llm`; `POST /transactions` and `PUT /transactions/:id` do not accept it — only the import path sets anything but `manual`. `schema.sql` is the desired end state; incremental changes against an existing database go in [backend/db/migrations/](backend/db/migrations/) as numbered files, applied by hand with `psql -v ON_ERROR_STOP=1 -f`. Keep the three in step — the migration, `schema.sql` and [backend/types/db.ts](backend/types/db.ts), which holds one interface per table. A migration without the matching `schema.sql` edit means fresh setups and existing databases diverge; one without the matching `types/db.ts` edit means the row types describe a column that is no longer there, and nothing fails until a controller reads it.

**Connections**: `DATABASE_URL` points at Neon's *pooled* endpoint (`-pooler` in the host); the project lives in AWS `us-east-1`, alongside the Render backend. Every query in this codebase names tables unqualified, so [backend/db/connection.ts](backend/db/connection.ts) issues `SET search_path` on each new pool connection. This is defensive rather than load-bearing today — the AWS pooler hands out a normal `"$user", public` — but Neon's *Azure* pooler handed out an **empty** `search_path`, where every query failed with `relation "transactions" does not exist`. Keep it: it costs one statement per connection and makes the app behave identically on any endpoint. Don't move it into the pool's `options` — Neon's pooler rejects `search_path` as a startup parameter. Use the **direct** endpoint (drop `-pooler` from the host) for `pg_dump`/restore.

## Frontend architecture

- **Next.js Pages Router** (`pages/`), not the App Router, despite `experimental.appDir` in [frontend/next.config.js](frontend/next.config.js). Add screens as files under `pages/`.
- **API client**: [frontend/utils/api.ts](frontend/utils/api.ts) is a shared axios instance. A request interceptor attaches the JWT from `localStorage`; a response interceptor handles errors globally — `401` triggers `logout()`, and `403/404/500`/generic errors surface a SweetAlert2 dialog. `/auth/*` endpoints are exempted so components can handle those errors themselves. Import this instance rather than calling axios directly.
- **Auth state** is `localStorage` `token` + `user`; there is no server session.
- **UI**: Radix primitives wrapped in [frontend/components/ui/](frontend/components/ui/) (shadcn-style), styled with Tailwind + `class-variance-authority`; use the `cn()` helper in [frontend/lib/utils.ts](frontend/lib/utils.ts) for conditional classes.
- **Transaction categories**: the canonical list is the exported `categories`
  object in [frontend/pages/transactions/new.tsx](frontend/pages/transactions/new.tsx)
  — the edit page and the dashboard both import it, and the dashboard uses it to
  decide whether a category is income or expense (unlisted names default to
  expense). Adding one means four edits, not one: that list, `CATEGORY_COLORS`
  in [frontend/pages/index.tsx](frontend/pages/index.tsx) (or it gets a
  hash-derived colour), and **both** `common.json` files, because the picker
  renders each name through `t(category)`. The backend does not validate the
  category against any list, but the seed's copy in
  [backend/db/demoData.ts](backend/db/demoData.ts) is now pinned to this one by
  `test/demoData.test.ts`, which parses this file and compares. The locale
  files are still unguarded.
- **i18n**: `next-i18next` with `en` and `zh` locales in [frontend/public/locales/](frontend/public/locales/). Add user-facing strings to both `common.json` files.
- **Theme**: light/dark via [frontend/contexts/ThemeContext.tsx](frontend/contexts/ThemeContext.tsx).
- **On-device OCR**: [frontend/next.config.js](frontend/next.config.js) aliases `onnxruntime-web` to `frontend/lib/ocr/ortRuntime.js`, which loads the runtime with `importScripts` from `/ort/` instead of letting webpack bundle it — Next's minifier cannot parse the library's ESM build. Do not remove the alias. It runs single-threaded on purpose: multi-threaded WASM needs cross-origin isolation, and with isolation headers on, this classic-script runtime hangs starting its thread workers. Chrome throttles OCR to a crawl in a hidden or backgrounded tab; keep the tab visible while it runs.

## Environment

Both projects read `.env` (already present locally, gitignored). Backend needs `DATABASE_URL` (or `DB_*` parts), `JWT_SECRET`, and optionally `OPENAI_API_KEY`, `FINNHUB_API_KEY`, email creds. Frontend needs `NEXT_PUBLIC_API_URL`. In production, DB connections use `ssl: { rejectUnauthorized: false }`.

## Known gaps

Carried over from the improvement backlog, which is now retired — the reasoning
for anything already fixed lives in the comment next to the code, and the rest
is in git history.

- **Nothing guards the locale files against category drift.** Adding a
  transaction category means four edits (see above); `test/demoData.test.ts`
  pins the backend copy to the frontend list, but `check:locales` only warns
  about keys no locale answers, so a new category still ships untranslated.
- **`LOG_LEVEL` is close to inert** — it gates `logger.debug()` and nothing
  else. Setting it to `error` in production does not silence `info`; the
  `NODE_ENV` check already does that.
- **Retention settings do not persist.** `GET/PUT /transactions/retention-settings`
  reports a saved preference it never stores, and no scheduled job acts on one.
  The endpoint that does delete, `DELETE /transactions/auto-delete`, is
  validated but nothing in the UI calls it.
- **`/summary/rolling` serialises every transaction in the window twice** and
  aggregates in Node rather than SQL. That cost is per user and per request, so
  it is the gate on offering an *All time* period.
- **The frontend has no test runner**, so `lib/date.ts` is unguarded. Its
  backend twin, `utils/dates.ts`, is covered by `test/dates.test.ts`, and
  `sharedContracts.test.ts` at least pins the mobile copy to it.
- **`mobile/` has no test runner either**, and covers four of the API's
  seven routers. No savings goals, investments, AI planning, screenshot
  import or registration; new transactions are hardcoded to CAD; there is
  no dark mode. The API has no `GET /transactions/:id`, so the edit screen
  depends on a row the list already loaded and cannot be deep-linked to.
- **Phone OCR speed is unmeasured.** On a laptop (M-series Mac, Chrome,
  visible tab) screenshot import takes about 1–2 s per image; Chrome throttles
  a hidden tab to 8–15 s. A mid-range phone may be several times slower than
  either number — measure on a real device before announcing the feature.
- **The LLM fallback (spec §4.7) was not built.** The private set (seven real
  screenshots, 2026-09-17) is all read by the rule-based parser once each
  layout was added, so nothing yet shows it is needed. `POST /import/parse`
  reports `ai_fallback_unavailable` when the parser is unsure, and the import
  page falls back to showing the recognised text for manual entry. Build it
  only if `npm run benchmark -- --set private` on real screenshots shows a
  gap the parser itself can't close.
- **Uber and Uber Eats imports can double-count** a card charge already
  imported from a bank screenshot; `possible_duplicate` needs the same day,
  amount and currency, so a charge posted a day later is not flagged.
- **First screenshot-import use downloads about 45 MB** (the OCR model plus
  the ONNX runtime). The engine banner shows progress, and HTTP caching keeps
  it to once per browser.
