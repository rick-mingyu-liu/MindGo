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
npm run lint           # eslint .
npm test               # NO-OP — prints "No tests specified" and exits 0. There is no backend test suite.
```

### Frontend (`cd frontend`)
```bash
npm run dev            # next dev  (http://localhost:3000)
npm run build          # next build
npm start              # next start (serve production build)
npm run lint           # next lint
# There is no `npm test` script defined despite README claims.
```

There is currently **no automated test suite** in either project. Verify changes by running the servers and exercising the flow manually.

## Ports (README is stale on this)

- Backend listens on `config.port` = `PORT` env or **3001** (README's mention of port 5000 is wrong).
- Frontend calls `NEXT_PUBLIC_API_URL` or defaults to `http://localhost:3001` ([frontend/utils/api.ts](frontend/utils/api.ts)).
- CORS origin defaults to `http://localhost:3000`.

## Backend architecture

Request flow: **route → (auth middleware) → validation → controller → service/db**.

- [backend/app.js](backend/app.js) wires helmet, morgan, cors, JSON parsing, mounts routers under `/auth`, `/transactions`, `/summary`, `/goals`, `/investments`, `/ai`, then global error + 404 handlers. On startup it also calls `schedulerService.init()`.
- **All config is centralized** in [backend/config/index.js](backend/config/index.js) — ports, JWT settings, cron schedules, data-retention windows, validation limits, and API keys. Read env vars from here, not `process.env` directly, when adding features.
- **Auth**: [backend/middleware/auth.js](backend/middleware/auth.js) verifies the `Authorization: Bearer <token>` JWT and sets `req.user`. Protected routers apply it globally with `router.use(auth)` at the top of the route file (see [backend/routes/transactions.js](backend/routes/transactions.js)). Controllers read the user id as **`req.user.userId`**.
- **Validation**: use `express-validator` `body([...])` arrays in the route file, then check `validationResult(req)` at the top of the controller method.
- **DB access**: [backend/db/connection.js](backend/db/connection.js) exports `query(text, params)`. Notable pattern: the `pg` Pool is **lazily created and auto-closed after 5 minutes of inactivity** to save connections. Always use parameterized queries (`$1, $2, ...`); controllers build filtered queries by incrementing a `paramCount` (see `getTransactions`).
- **Multi-currency**: monetary rows store a `currency` column; conversion happens at read time via `services/exchangeRateService.js`. Allowed currencies: `CAD, USD, EUR, GBP, AUD, CNY`.
- **Stock data has layered fallbacks**: `finnhubService` (API key), `freeStockDataService` (Yahoo Finance via spoofed browser headers, no key, rate-limited with deliberate delays + 5-min in-memory cache), and Alpha Vantage. Expect rate-limiting logic and caching when touching investment features.
- **Scheduler** ([backend/services/schedulerService.js](backend/services/schedulerService.js)): weekly report emails via `node-cron`, plus `setInterval` cleanup jobs for expired AI plans and unverified accounts. Cleanup controller methods (`autoDeleteOldAIPlans`, `deleteUnverifiedAccounts`) are invoked both by HTTP routes and the scheduler.

### Database
Schema lives in [backend/db/schema.sql](backend/db/schema.sql) and is applied wholesale by `db:setup`, which is idempotent and safe to re-run. Tables: `users`, `transactions`, `savings_goals`, `watchlist`, `ai_plans`. `updated_at` is auto-maintained by triggers. `schema.sql` is the desired end state; incremental changes against an existing database go in [backend/db/migrations/](backend/db/migrations/) as numbered files, applied by hand with `psql -v ON_ERROR_STOP=1 -f`. Keep the two in step — a migration without the matching `schema.sql` edit means fresh setups and existing databases diverge.

**Connections**: `DATABASE_URL` points at Neon's *pooled* endpoint (`-pooler` in the host); the project lives in AWS `us-east-1`, alongside the Render backend. Every query in this codebase names tables unqualified, so [backend/db/connection.js](backend/db/connection.js) issues `SET search_path` on each new pool connection. This is defensive rather than load-bearing today — the AWS pooler hands out a normal `"$user", public` — but Neon's *Azure* pooler handed out an **empty** `search_path`, where every query failed with `relation "transactions" does not exist`. Keep it: it costs one statement per connection and makes the app behave identically on any endpoint. Don't move it into the pool's `options` — Neon's pooler rejects `search_path` as a startup parameter. Use the **direct** endpoint (drop `-pooler` from the host) for `pg_dump`/restore.

## Frontend architecture

- **Next.js Pages Router** (`pages/`), not the App Router, despite `experimental.appDir` in [frontend/next.config.js](frontend/next.config.js). Add screens as files under `pages/`.
- **API client**: [frontend/utils/api.ts](frontend/utils/api.ts) is a shared axios instance. A request interceptor attaches the JWT from `localStorage`; a response interceptor handles errors globally — `401` triggers `logout()`, and `403/404/500`/generic errors surface a SweetAlert2 dialog. `/auth/*` endpoints are exempted so components can handle those errors themselves. Import this instance rather than calling axios directly.
- **Auth state** is `localStorage` `token` + `user`; there is no server session.
- **UI**: Radix primitives wrapped in [frontend/components/ui/](frontend/components/ui/) (shadcn-style), styled with Tailwind + `class-variance-authority`; use the `cn()` helper in [frontend/lib/utils.ts](frontend/lib/utils.ts) for conditional classes.
- **i18n**: `next-i18next` with `en` and `zh` locales in [frontend/public/locales/](frontend/public/locales/). Add user-facing strings to both `common.json` files.
- **Theme**: light/dark via [frontend/contexts/ThemeContext.tsx](frontend/contexts/ThemeContext.tsx).

## Environment

Both projects read `.env` (already present locally, gitignored). Backend needs `DATABASE_URL` (or `DB_*` parts), `JWT_SECRET`, and optionally `OPENAI_API_KEY`, `FINNHUB_API_KEY`, email creds. Frontend needs `NEXT_PUBLIC_API_URL`. `setup.sh` installs deps for both. In production, DB connections use `ssl: { rejectUnauthorized: false }`.
