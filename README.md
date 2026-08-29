# MindGo

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14-blue.svg)](https://nextjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-13+-blue.svg)](https://www.postgresql.org/)

A personal finance app built around the **Waterloo term**, not the calendar month.

A study term and a co-op term are both four months, and that is the unit students actually budget in — a co-op term earns, a study term spends down. MindGo tracks income, expenses, savings goals and a stock watchlist against those boundaries, in six currencies and two languages.

**Demo:** `john.doe@example.com` / `password123`

---

## Why terms

Most finance apps offer a rolling window: *the last 4 months*, counting back from today. For a term-based life that is subtly wrong. A rolling four months coincides with a term only in **April, August and December** — the last month of each, when the term is already over. In the *first* month of a co-op term, which is exactly when someone sets a budget, three quarters of a rolling window is the previous term's money.

So the dashboard's windows are term-aligned:

| Window | Query |
|---|---|
| This term | `?term=current` |
| Last term | `?term=previous` |
| This year | `?year=current` |
| Last year | `?year=previous` |
| A named term | `?term=2026-spring` |
| Rolling months | `?months=4` |

The term calendar is **Winter** Jan–Apr, **Spring** May–Aug, **Fall** Sep–Dec, defined once in [`backend/utils/terms.js`](backend/utils/terms.js). Those three tile Jan–Dec exactly, so a calendar year *is* three terms and a yearly total can never disagree with the terms inside it. Bounds are half-open `[start, end)`.

---

## Features

**Transactions** — income and expenses across 18 categories, in CAD, USD, EUR, GBP, AUD and CNY. Conversion happens at read time, so a row keeps the currency it was entered in.

**Term budgeting** — the dashboard's period selector, category breakdown, and month-by-month income-vs-expenses chart, all driven by the window you pick.

**Savings goals** — targets with progress bars and days remaining.

**Investment watchlist** — quotes, company financials, news and market indices, with three data sources behind a fallback chain (Finnhub → Yahoo Finance → Alpha Vantage) so a missing API key degrades rather than breaks.

**AI planning** — OpenAI-generated financial plans grounded in the user's actual transactions.

**Weekly report emails** — a scheduled summary of the past seven days plus a four-month rollup.

**English and 中文** throughout.

---

## Quick start

**Prerequisites:** Node.js 18+, PostgreSQL 13+.

```bash
git clone <repository-url>
cd MindGo
./setup.sh              # installs dependencies for both projects
```

### Configure

`backend/.env` — see [`backend/.env.example`](backend/.env.example) for the annotated full list.

```env
DATABASE_URL=postgresql://user:password@localhost:5432/mindgo
JWT_SECRET=<at least 32 characters>

# Optional. Each one degrades gracefully when absent.
OPENAI_API_KEY=          # AI planning
FINNHUB_API_KEY=         # stock quotes (falls back to Yahoo Finance)
MAILBOXLAYER_API_KEY=    # email validation (falls back to a local domain list)
EMAIL_USER=              # weekly reports
EMAIL_PASS=
```

The app **refuses to boot** without `DATABASE_URL` and `JWT_SECRET`, and warns about each missing optional key naming what it disables.

`frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Database

```bash
cd backend
npm run db:setup    # applies db/schema.sql — idempotent, safe to re-run
npm run db:seed     # (re)builds the demo account
```

Migrations in [`backend/db/migrations/`](backend/db/migrations/) are applied by hand against an existing database:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/007_add_is_demo_flag.sql
```

`schema.sql` is the desired end state; a migration without a matching `schema.sql` edit means fresh setups and existing databases diverge.

### Run

```bash
cd backend && npm run dev      # http://localhost:3001
cd frontend && npm run dev     # http://localhost:3000
```

---

## The demo account

Generated relative to **today**, not hardcoded — five terms of a co-op student alternating study and work terms, with the current term truncated at today so it reads as live.

The alternation is the point: a study term is tuition and rent against part-time income and runs at a loss, a co-op term earns and saves. That contrast is what makes *This term / Last term* worth clicking.

`npm run db:seed` is **re-runnable** and is how the demo stays current — it replaces the demo user's rows rather than adding to them. Amounts vary month to month but come from a generator seeded on the term and category, so re-seeding on the same day is byte-identical.

To keep it current without intervention, set `DEMO_REFRESH_ENABLED=true` to mount a 30-day refresh job. It is **off by default** because it deletes every row belonging to the demo account before rewriting them. It identifies that account by the `is_demo` column rather than by an email address anyone could register, never creates the account, and scopes every delete to the resolved user id. See [`backend/services/demoAccountService.js`](backend/services/demoAccountService.js).

Note that the refresh discards anything a visitor adds while trying the demo.

---

## Architecture

```
backend/                        Express + PostgreSQL API (plain JavaScript)
├── app.js                      helmet, morgan, cors, routers, error handlers
├── config/index.js             ALL configuration — read env vars here, not process.env
├── config/validate.js          startup check; exits on a missing secret
├── controllers/                request handling and orchestration
├── db/
│   ├── connection.js           lazy pool, auto-closes after 5 min idle
│   ├── schema.sql              desired end state
│   ├── migrations/             numbered, applied by hand
│   └── demoData.js             the demo account, generated from today
├── middleware/                 auth.js (JWT), rateLimiter.js
├── routes/                     express-validator chains + mounting
├── services/                   business logic and external APIs
├── utils/
│   ├── terms.js                the term calendar — one definition
│   ├── dates.js                calendar-day helpers
│   ├── logger.js               info/warn/debug are dev-only; error/audit always print
│   └── privacy.js              maskEmail()
└── test/                       15 files, 236 tests, node --test

frontend/                       Next.js 14, Pages Router, TypeScript
├── pages/                      one file per screen
├── components/ui/              Radix primitives, shadcn-style
├── lib/date.ts                 calendar-day helpers (never new Date(day))
├── utils/api.ts                shared axios instance with auth + error interceptors
├── contexts/ThemeContext.tsx   light/dark
└── public/locales/{en,zh}/     every user-facing string
```

**Request flow:** route → auth middleware → validation → controller → service/db.
[`backend/ARCHITECTURE.md`](backend/ARCHITECTURE.md) has the diagram and where the layering still leaks.

### Conventions worth knowing

- **All config is centralized** in `config/index.js`. Read env vars from there.
- **Controllers read the user id as `req.user.userId`.** Protected routers apply `router.use(auth)` at the top.
- **Validation** is `express-validator` arrays in the route file, checked with `validationResult(req)` at the top of the controller.
- **Always use parameterized queries.** Every query naming a user-owned table is scoped by `user_id`.
- **Dates are calendar days, not instants.** A `pg` type parser hands `DATE` columns back as `'YYYY-MM-DD'`. Never `new Date(day).getMonth()` — a plain `'2026-08-01'` parses as UTC midnight and answers July west of UTC. Use `utils/dates.js` and `lib/date.ts`.
- **Never log a credential** — no tokens, JWTs or password hashes. Log a user id where one exists, a masked address only where one does not.
- **`logger.audit` is for destroying user data.** `info`/`warn`/`debug` print nothing in production.
- **Adding a transaction category means four edits** — the list in `pages/transactions/new.tsx`, `CATEGORY_COLORS` in `pages/index.tsx`, and both `common.json` files.

---

## Development

```bash
# backend
npm run dev              # nodemon
npm start                # production
npm test                 # node --test
npm run lint             # eslint 9, flat config
npm run db:setup         # apply schema (idempotent)
npm run db:seed          # rebuild the demo account
npm run docs:generate    # regenerate API docs

# frontend
npm run dev
npm run build
npm start
npm run lint
npm run check:locales    # fails on duplicate or unresolved keys
```

### Tests

[`backend/test/`](backend/test/) holds the only automated tests — **236 across 15 files**, run by `node --test`. No test framework is installed and none is needed.

**Unit tests always run**, with no database and no network. They cover the things that fail silently: currency conversion and its caching, the term calendar swept across four timezones, the date helpers, the demo generator's evergreen properties at nine different "todays", the startup config check, retention predicates, scheduler timer plumbing, address masking, which log levels survive production, and that registration never writes a token or a raw address to the log.

**`api.test.js` needs a database and skips without one.** It refuses to borrow `DATABASE_URL` from `.env`:

```bash
TEST_DATABASE_URL=postgresql://user@localhost:5432/mindgo_test npm test
```

It creates and deletes users, which is why opting in is deliberate. **Never point it at production.**

The frontend has no test runner. Verify UI changes by running the app.

### CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs backend lint and tests against a Postgres service container, plus `check:locales`, lint and `build` for the frontend. It uses `npm ci`, so a `package.json` that disagrees with its lockfile fails the build.

---

## API

All routes except registration, login and email verification require `Authorization: Bearer <token>`.

### `/auth`
| | |
|---|---|
| `POST /register` | create an account |
| `POST /login` | returns a JWT |
| `GET /verify-email/:token` | confirm an address |
| `POST /resend-verification` | reissue the mail |
| `GET, PUT /profile` | read and update the profile |
| `PUT /notifications` | notification preferences |
| `POST /test-email` | send the weekly report on demand |

Rate limited to 5 requests per 15 minutes per IP across `/register`, `/login`, `/resend-verification` and `/test-email` **combined**.

### `/transactions`
| | |
|---|---|
| `GET /` | list, with filters and pagination |
| `POST /` | create |
| `PUT /:id`, `DELETE /:id` | update, delete |
| `GET /categories` | categories in use |
| `DELETE /clear-all` | delete every transaction |
| `DELETE /auto-delete?months=N` | delete everything older than N months (1–60) |
| `GET, PUT /retention-settings` | retention preferences |

### `/summary`
| | |
|---|---|
| `GET /monthly` | a single month |
| `GET /rolling` | a term, a year, or a rolling month count |
| `GET /trends` | spending by category over time |

`GET /rolling` takes **exactly one** of `?term=`, `?year=` or `?months=` — more than one is a 400. It echoes `term`, `year`, `periodLabel`, `startDate` and `endDate`, so a client never computes a date or a name.

### `/goals`
| | |
|---|---|
| `GET /`, `POST /` | list, create |
| `PUT /:id`, `DELETE /:id` | update, delete |
| `PUT /:id/progress` | update progress |
| `GET /stats` | aggregates |
| `DELETE /clear-all` | delete every goal |
| `POST /from-ai-plan` | turn an AI plan into a goal |

### `/investments`
| | |
|---|---|
| `GET /watchlist`, `POST /watchlist` | list, add |
| `DELETE /watchlist/:id`, `DELETE /watchlist/clear-all` | remove |
| `GET /snapshot/:symbol` | current quote |
| `GET /historical/:symbol` | price history |
| `GET /financials/:symbol`, `GET /news/:symbol`, `GET /analysis/:symbol` | company detail |
| `GET /market-overview` | S&P 500, Dow, NASDAQ |
| `GET /watchlist/ai-summary` | a written summary of the watchlist |
| `GET /search` | symbol search |

### `/ai`
| | |
|---|---|
| `POST /plan` | generate a financial plan |
| `GET /plans`, `GET /plans/:id` | plan history |
| `POST /budget-recommendations` | budget suggestions |
| `POST /investment-advice` | investment commentary |

Rate limited separately from the rest of the API. Generated plans are deleted 30 minutes after creation.

---

## Deployment

The backend runs on **Render**, the frontend on **Vercel**, the database on **Neon** (AWS `us-east-1`).

The backend needs no build step — `npm start` runs `node app.js`. The frontend builds with `next build`.

**Database connections:** `DATABASE_URL` points at Neon's *pooled* endpoint (`-pooler` in the host). Every query names tables unqualified, so `db/connection.js` issues `SET search_path` on each new connection — defensive today, but Neon's Azure pooler handed out an empty `search_path` where every query failed. Use the **direct** endpoint (drop `-pooler`) for `pg_dump`/restore. In production, connections use `ssl: { rejectUnauthorized: false }`.

**Scheduled jobs** run in the backend process: weekly report emails via `node-cron`, plus interval jobs that delete expired AI plans and unverified accounts. Nothing mounts them over HTTP.

---

## Stack

**Backend** — Express 4, PostgreSQL via `pg`, JWT auth with `bcryptjs`, `express-validator`, `helmet`, `express-rate-limit`, `morgan`, `node-cron`, `nodemailer`, `openai`.

**Frontend** — Next.js 14 (Pages Router), React 18, TypeScript, Tailwind CSS, Radix UI, Recharts, React Hook Form, `next-i18next`, SweetAlert2, Lucide icons.

**External services** — [Finnhub](https://finnhub.io/), Yahoo Finance and [Alpha Vantage](https://www.alphavantage.co/) for stock data; [OpenAI](https://openai.com/) for planning; [Frankfurter](https://www.frankfurter.app/) for exchange rates; [MailboxLayer](https://mailboxlayer.com/) for address validation; Gmail SMTP for mail.

## Database

Five tables: `users`, `transactions`, `savings_goals`, `watchlist`, `ai_plans`. `updated_at` is maintained by triggers. Monetary rows carry a `currency` column.

## Known gaps

Tracked in [`IMPROVEMENTS.md`](IMPROVEMENTS.md), which records what was found, what was decided and why.

- **Retention settings do not persist.** The settings page saves and reports success; the backend returns hardcoded defaults and stores nothing. Harmless today because nothing acts on them (item 20).
- **`/summary/rolling` returns every transaction twice** and aggregates in Node — one user's year is a ~154 kB response. This is the gate on an *All time* view (item 21).
- **No frontend test runner**, so `lib/date.ts` is unguarded (item 23).
- **Locale files are unguarded** against category drift; the backend and frontend category lists are pinned to each other, the translations are not (item 18).
- **`LOG_LEVEL` is close to inert** — it gates `debug()` and nothing else (item 19).

## Contributing

Private project. For collaboration, contact the maintainer directly.
