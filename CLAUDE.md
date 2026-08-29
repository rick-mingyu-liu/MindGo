# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

MindGo is a personal finance app: an Express/PostgreSQL REST API (`backend/`) and a Next.js/TypeScript frontend (`frontend/`). The two are separate npm projects with independent `package.json` files — run commands from within the relevant subdirectory.

## Commands

### Backend (`cd backend`)
```bash
npm run dev            # nodemon app.js (dev server with auto-restart)
npm start              # node app.js (production)
npm run db:setup       # create schema from db/schema.sql (idempotent, CREATE IF NOT EXISTS)
npm run db:seed        # seed sample data (demo account: john.doe@example.com / password123)
npm run docs:generate  # regenerate API docs via scripts/generateDocs.js
npm run lint           # eslint . (eslint 9, flat config in eslint.config.js)
npm test               # node --test — unit tests always run; see below for the integration suite
```

### Frontend (`cd frontend`)
```bash
npm run dev            # next dev  (http://localhost:3000)
npm run build          # next build
npm start              # next start (serve production build)
npm run lint           # next lint (needs .eslintrc.json — without it, it prompts and hangs)
npm run check:locales  # fails on duplicate keys in public/locales/*/common.json
# There is still no `npm test` in the frontend, despite README claims.
```

## Tests

`backend/test/` holds the only automated tests. `npm test` runs them via `node --test` — no test framework is installed, and none is needed.

- **Unit tests always run**, with no database and no network: `exchangeRateService.test.js` (conversion, caching, and the failure modes that would silently produce a plausible wrong number), `configValidate.test.js` (the startup check, exercised in a child process because it calls `process.exit`), `cleanupService.test.js` (`db.query` mocked; asserts both retention predicates and that errors propagate), `schedulerService.test.js` (the interval plumbing, via `mock.timers`), `privacy.test.js` (`maskEmail`, including every input that would make it throw inside a log line), `registerLogging.test.js` (runs the real `register` handler with stubbed collaborators and asserts no token or raw address reaches the log), and `emailValidation.test.js` (every way MailboxLayer can fail to answer, each of which must degrade rather than block).

  One trap in `schedulerService.test.js`: `mock.timers`' fake `Timeout` **ignores `unref()`** — `hasRef()` stays `true` however you call it — so the one test that checks the timer does not hold the event loop open has to run on a real timer, in its own `describe`.
- **`api.test.js` needs a database and skips without one.** It refuses to borrow `DATABASE_URL` from `.env`; point it at a throwaway database instead:

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

- [backend/app.js](backend/app.js) wires helmet, morgan, cors, JSON parsing, mounts routers under `/auth`, `/transactions`, `/summary`, `/goals`, `/investments`, `/ai`, then global error + 404 handlers. On startup it also calls `schedulerService.init()`.
- **All config is centralized** in [backend/config/index.js](backend/config/index.js) — ports, JWT settings, cron schedules, data-retention windows, validation limits, and API keys. Read env vars from here, not `process.env` directly, when adding features.
- **Auth**: [backend/middleware/auth.js](backend/middleware/auth.js) verifies the `Authorization: Bearer <token>` JWT and sets `req.user`. Protected routers apply it globally with `router.use(auth)` at the top of the route file (see [backend/routes/transactions.js](backend/routes/transactions.js)). Controllers read the user id as **`req.user.userId`**.
- **Validation**: use `express-validator` `body([...])` arrays in the route file, then check `validationResult(req)` at the top of the controller method.
- **Address validation at registration**: [backend/services/emailValidationService.js](backend/services/emailValidationService.js) exports one function, `validateEmail(email)` → `{ valid, reason?, source }`. MailboxLayer where `MAILBOXLAYER_API_KEY` is set, its own 30-domain disposable list otherwise. **It never throws and never blocks on its own failure** — no key, a network error, an HTTP error, an apilayer error payload (HTTP 200 with `success: false`) or an unrecognised response shape all fall back to the domain list, loudly via `console.error`. The previous version turned each of those into a rejected or 500ing registration (`IMPROVEMENTS.md` item 13). Keep that property if you touch it: `test/emailValidation.test.js` has a case per failure mode.
- **Log levels**: [backend/utils/logger.js](backend/utils/logger.js). `info`, `warn` and `debug` are gated on `config.logging.enableConsoleLogs` = `NODE_ENV === 'development'`, so **they print nothing in production**. `error` and `audit` always print. Use `logger.audit` only for events that destroy or irreversibly change user data — the retention deletions do, which is why they moved off `info` (`IMPROVEMENTS.md` item 17). `LOG_LEVEL` is close to inert: it gates `debug()` and nothing else (item 19).
- **Logging user data**: **never log a credential** — verification tokens, JWTs, password hashes. For addresses, the rule is *log a user id where one exists, and a masked address only where one does not* (before the INSERT, or when a lookup found nothing). `maskEmail()` in [backend/utils/privacy.js](backend/utils/privacy.js) produces `j***@example.com`. Registration leaked verification tokens this way once (`IMPROVEMENTS.md` item 16); `test/registerLogging.test.js` guards it by running the real handler and inspecting everything it printed.
- **DB access**: [backend/db/connection.js](backend/db/connection.js) exports `query(text, params)`. Notable pattern: the `pg` Pool is **lazily created and auto-closed after 5 minutes of inactivity** to save connections. Always use parameterized queries (`$1, $2, ...`); controllers build filtered queries by incrementing a `paramCount` (see `getTransactions`).
- **Multi-currency**: monetary rows store a `currency` column; conversion happens at read time via `services/exchangeRateService.js`. Allowed currencies: `CAD, USD, EUR, GBP, AUD, CNY`.
- **Stock data has layered fallbacks**: `finnhubService` (API key), `freeStockDataService` (Yahoo Finance via spoofed browser headers, no key, rate-limited with deliberate delays + 5-min in-memory cache), and Alpha Vantage. Expect rate-limiting logic and caching when touching investment features.
- **Scheduler** ([backend/services/schedulerService.js](backend/services/schedulerService.js)): weekly report emails via `node-cron`, plus `setInterval` cleanup jobs for expired AI plans and unverified accounts. The deletions themselves live in [backend/services/cleanupService.js](backend/services/cleanupService.js) and **throw** on failure rather than logging and returning — the caller decides what a failed cleanup means. Nothing mounts them over HTTP; the scheduler is the only caller. Add a new recurring job through `scheduleInterval(name, ms, task)`, which awaits the task, logs the row count, and `unref()`s the timer; a bare `setInterval` with a synchronous `try`/`catch` around an async call silently reports success.

### Database
Schema lives in [backend/db/schema.sql](backend/db/schema.sql) and is applied wholesale by `db:setup`, which is idempotent and safe to re-run. Tables: `users`, `transactions`, `savings_goals`, `watchlist`, `ai_plans`. `updated_at` is auto-maintained by triggers. `schema.sql` is the desired end state; incremental changes against an existing database go in [backend/db/migrations/](backend/db/migrations/) as numbered files, applied by hand with `psql -v ON_ERROR_STOP=1 -f`. Keep the two in step — a migration without the matching `schema.sql` edit means fresh setups and existing databases diverge.

**Connections**: `DATABASE_URL` points at Neon's *pooled* endpoint (`-pooler` in the host); the project lives in AWS `us-east-1`, alongside the Render backend. Every query in this codebase names tables unqualified, so [backend/db/connection.js](backend/db/connection.js) issues `SET search_path` on each new pool connection. This is defensive rather than load-bearing today — the AWS pooler hands out a normal `"$user", public` — but Neon's *Azure* pooler handed out an **empty** `search_path`, where every query failed with `relation "transactions" does not exist`. Keep it: it costs one statement per connection and makes the app behave identically on any endpoint. Don't move it into the pool's `options` — Neon's pooler rejects `search_path` as a startup parameter. Use the **direct** endpoint (drop `-pooler` from the host) for `pg_dump`/restore.

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
  category against any list, and [backend/db/seed.sql](backend/db/seed.sql)
  keeps its own copy — nothing checks the two agree (`IMPROVEMENTS.md` items 7
  and 18).
- **i18n**: `next-i18next` with `en` and `zh` locales in [frontend/public/locales/](frontend/public/locales/). Add user-facing strings to both `common.json` files.
- **Theme**: light/dark via [frontend/contexts/ThemeContext.tsx](frontend/contexts/ThemeContext.tsx).

## Environment

Both projects read `.env` (already present locally, gitignored). Backend needs `DATABASE_URL` (or `DB_*` parts), `JWT_SECRET`, and optionally `OPENAI_API_KEY`, `FINNHUB_API_KEY`, email creds. Frontend needs `NEXT_PUBLIC_API_URL`. `setup.sh` installs deps for both. In production, DB connections use `ssl: { rejectUnauthorized: false }`.
