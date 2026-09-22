# MindGo

[![Node.js](https://img.shields.io/badge/Node.js-22-green.svg)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14-blue.svg)](https://nextjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-13+-blue.svg)](https://www.postgresql.org/)
[![Expo](https://img.shields.io/badge/Expo-SDK%2057-black.svg)](https://expo.dev/)
[![OCR](https://img.shields.io/badge/OCR-PaddleOCR%20PP--OCRv6%2C%20on--device-orange.svg)](docs/superpowers/specs/2026-09-16-ocr-import-design.md)

A personal finance app built around the **Waterloo term**, not the calendar month.

A study term and a co-op term are both four months, and that is the unit students actually budget in — a co-op term earns, a study term spends down. MindGo tracks income, expenses, savings goals and a stock watchlist against those boundaries, in six currencies and two languages — and it can read your transactions straight from a screenshot of your bank, Uber or WeChat Pay, **on your device**.

There is also a **React Native client** in [`mobile/`](mobile/) that talks to the same API — sign-in, the term dashboard with charts, and adding, editing or deleting a transaction from a phone.

**Try it:** **[mind-go.vercel.app](https://mind-go.vercel.app/)** — sign in as `john.doe@example.com` / `password123`.

The API runs on Render's free plan, which sleeps after ~15 minutes of inactivity, so the first request can wait about 20 seconds on a cold start. That is the server waking up, not the app hanging.

---

## Contents

- [Why terms](#why-terms)
- [Features](#features)
- [Screenshot import](#screenshot-import)
- [Quick start](#quick-start)
- [The demo account](#the-demo-account)
- [Architecture](#architecture)
- [Mobile](#mobile)
- [Development](#development)
- [API](#api)
- [Deployment](#deployment)
- [Stack](#stack) · [Database](#database) · [Known gaps](#known-gaps)

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

The term calendar is **Winter** Jan–Apr, **Spring** May–Aug, **Fall** Sep–Dec, defined once in [`backend/utils/terms.ts`](backend/utils/terms.ts). Those three tile Jan–Dec exactly, so a calendar year *is* three terms and a yearly total can never disagree with the terms inside it. Bounds are half-open `[start, end)`.

---

## Features

| | |
|---|---|
| **Transactions** | Income and expenses across 18 categories, in CAD, USD, EUR, GBP, AUD and CNY. Conversion happens at read time, so a row keeps the currency it was entered in, and every total is shown in the display currency you choose. |
| **Screenshot import** | Drop in screenshots from a bank app, a receipt photo, Uber, Uber Eats or WeChat Pay. The text is read **in your browser**, every row is checked and flagged, and nothing is saved until you confirm. [Details below](#screenshot-import). |
| **Term budgeting** | The dashboard's period selector (This term / Last term / This year / Last year), category breakdown, and month-by-month income-vs-expenses chart, all driven by the window you pick. The dashboard reloads its data whenever you come back to it. |
| **Savings goals** | Targets with progress bars and days remaining; an AI plan can become a goal in one click. |
| **Investment watchlist** | Quotes, company financials, news and market indices, with three data sources behind a fallback chain (Finnhub → Yahoo Finance → Alpha Vantage), so a missing API key degrades rather than breaks. |
| **AI planning** | OpenAI-generated financial plans grounded in your actual transactions and your planning preferences (risk tolerance, life stage, experience). When the OpenAI account is out of credit or rate-limited, the page says *AI planning unavailable* instead of reporting a server error. |
| **Weekly report emails** | The past seven days plus a four-month rollup, **every Sunday at 7 p.m. Toronto time**, or on demand from the dashboard's *Send Report*. |
| **Settings** | Theme (light / dark / system), display currency, language, the weekly report switch, and planning preferences. **Every control saves the moment it changes** — there is no Save button to forget, and nothing on the page is decorative. |
| **English and 中文** | Every user-facing string, in both languages. |

---

## Screenshot import

Open **Import from screenshot** on the dashboard or the transactions page, then drop, pick or paste up to five images at a time.

```
Your browser                                            MindGo API
  screenshot ──▶ Web Worker: PaddleOCR PP-OCRv6 small
                 (ONNX Runtime Web, WASM)
                 text lines + boxes ──── POST /import/parse ──▶ rows → layout → parser → checks
  review table ◀─────────────────── draft rows + flags ◀──┘   (nothing is stored)
  edit, untick, view source
  confirm ─────────────────────── POST /transactions/import ─▶ re-validate → one INSERT
```

**Private by design.** The image never leaves your device; only the recognised text is sent, it is never logged, and nothing is saved until you confirm. The first import downloads the reading model once (about 45 MB, cached by the browser after that).

### What it reads

| Screenshot | Recognised as | What you get |
|---|---|---|
| A bank app's transaction list — date headers, signed or unsigned amounts, pending rows, a running balance beside or **under** each amount | Bank list | One row per transaction; running balances verify the amounts |
| A photo of a paper receipt | Receipt | One expense: the total, the merchant, the date; items + tax + tip must add up |
| Uber → Activity | Uber trips | Each trip as a Transportation expense, `Uber: <destination>` |
| Uber Eats → Orders → **Past orders** | Uber Eats orders | Each order's total (fees and tip included) as an expense, `Uber Eats: <store>`, categorised by store |
| WeChat Pay → Transactions | WeChat Pay | Every transaction **in CNY**, dated from its own line and the month header |

Uber Eats' *Past items* tab is deliberately not imported: it shows today's menu prices, not what you paid.

### Checked, not trusted

Every row carries flags; the review screen shows the most serious as a **Check: …** badge, with the rest in its tooltip. Possible duplicates and incomplete rows start unticked.

- **Amount checked** — running balances or a receipt's arithmetic confirm the amount.
- **Income or expense was guessed** — the screen showed no sign. OCR drops minus signs with high confidence, so an unsigned bank amount is never treated as a confirmed expense.
- **Hard to read** — low OCR confidence on some field.
- **Some characters were guessed** — the parser repaired the text (`+4.801` → `4.80`, `O` → `0`).
- **Does not match the running balance** / **Receipt totals do not add up** — the arithmetic check failed.
- **Possible duplicate** — you already have a transaction with the same day, amount and currency.
- **No date found** — no date could be trusted; the row cannot be ticked until you add one.

The parser also copes with what real screenshots do to OCR: dates with the spaces squeezed out (`SEP15,2026`), app icons read as Chinese characters, arrows that span two lines, merchant names that wrap, and store logos read as text.

### Measured, not claimed

The [`eval/`](eval/) benchmark runs the same model the browser runs and scores every field, headlined by the **silent-error rate** — rows whose amount is wrong *and* carry no warning:

| Set | Rows found | Silent amount errors |
|---|---|---|
| Synthetic (48 images: bank lists and receipts) | 188 / 188 | 0 |
| Real screenshots (7, kept private and never committed) | 27 / 27 | 0 |

The recorded OCR output is replayed through the parser in CI, so a parser change that would introduce a silent error fails the build. Design, rules and measurements: [`docs/superpowers/specs/2026-09-16-ocr-import-design.md`](docs/superpowers/specs/2026-09-16-ocr-import-design.md).

---

## Quick start

**Prerequisites:** Node.js 22 (what CI runs), PostgreSQL 13+.

```bash
git clone <repository-url>
cd MindGo
(cd backend && npm install)   # also builds: `prepare` runs tsc into dist/
(cd frontend && npm install)
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
EMAIL_USER=              # weekly reports (Gmail)
EMAIL_PASS=
```

The app **refuses to boot** without `DATABASE_URL` and `JWT_SECRET`, and warns about each missing optional key, naming what it disables.

`frontend/.env` — see [`frontend/.env.example`](frontend/.env.example):

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Database

```bash
cd backend
npm run db:setup    # applies db/schema.sql — idempotent, safe to re-run
npm run db:seed     # (re)builds the demo account
```

A fresh database needs nothing else. An **existing** database needs any migration in [`backend/db/migrations/`](backend/db/migrations/) it has not had yet, applied by hand — for example the one screenshot import depends on:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/011_add_import_tracking.sql
```

`schema.sql` is the desired end state; a migration without a matching `schema.sql` edit means fresh setups and existing databases diverge.

### Run

```bash
cd backend && npm run dev      # http://localhost:3001
cd frontend && npm run dev     # http://localhost:3000 — downloads the OCR model on first run
```

If the backend reports `EADDRINUSE :3001`, another backend is still running — find it with `lsof -iTCP:3001 -sTCP:LISTEN` and stop it.

---

## The demo account

Generated relative to **today**, not hardcoded — five terms of a co-op student alternating study and work terms, with the current term truncated at today so it reads as live.

The alternation is the point: a study term is tuition and rent against part-time income and runs at a loss, a co-op term earns and saves. That contrast is what makes *This term / Last term* worth clicking.

`npm run db:seed` is **re-runnable** and is how the demo stays current — it replaces the demo user's rows rather than adding to them. Amounts vary month to month but come from a generator seeded on the term and category, so re-seeding on the same day is byte-identical.

To keep it current without intervention, set `DEMO_REFRESH_ENABLED=true` to mount a 30-day refresh job. It is **off by default** because it deletes every row belonging to the demo account before rewriting them. It identifies that account by the `is_demo` column rather than by an email address anyone could register, never creates the account, and scopes every delete to the resolved user id. See [`backend/services/demoAccountService.ts`](backend/services/demoAccountService.ts). The refresh discards anything a visitor adds while trying the demo.

---

## Architecture

```
backend/                        Express + PostgreSQL API (TypeScript)
├── app.ts                      helmet, morgan, cors, routers, error handlers
├── config/index.ts             ALL configuration — read env vars here, not process.env
├── config/validate.ts          startup check; exits on a missing secret
├── controllers/                request handling and orchestration
├── db/
│   ├── connection.ts           lazy pool, auto-closes after 5 min idle
│   ├── schema.sql              desired end state
│   ├── migrations/             numbered, applied by hand
│   └── demoData.ts             the demo account, generated from today
├── middleware/                 auth.ts (JWT), rateLimiter.ts
├── routes/                     express-validator chains + mounting
├── services/
│   ├── import/                 screenshot parser — pure functions, no I/O
│   │   ├── rows.ts             OCR boxes → visual rows (drops icons)
│   │   ├── tokens.ts           amounts and days out of text
│   │   ├── classify.ts         which layout a screenshot is
│   │   ├── bankList.ts         receipt.ts  uberActivity.ts  uberEats.ts  wechat.ts
│   │   ├── categorize.ts       first-guess category from the merchant
│   │   ├── duplicates.ts       possible_duplicate lookup
│   │   └── parse.ts            confidence, flags, output
│   ├── schedulerService.ts     weekly email (cron, Toronto time) + cleanup intervals
│   └── …                       email, AI, exchange rates, stock data
├── types/
│   ├── db.ts                   one interface per table — edit with schema.sql
│   ├── express.d.ts            req.user, merged into Express’s own Request
│   └── import.ts               the screenshot parser’s vocabulary
├── utils/
│   ├── terms.ts                the term calendar — one definition
│   ├── dates.ts                calendar-day helpers
│   ├── logger.ts               info/warn/debug are dev-only; error/audit always print
│   └── privacy.ts              maskEmail()
├── test/                       30 files, 508 tests, node --test
└── dist/                       tsc output (CommonJS) — gitignored; what production runs

frontend/                       Next.js 14, Pages Router, TypeScript
├── pages/                      one file per screen (import.tsx, settings.tsx, …)
├── components/ui/              Radix primitives, shadcn-style
├── lib/
│   ├── ocr/                    Web Worker, useOcr hook, pinned model profile
│   ├── import/review.ts        review-table state and validation
│   ├── preferences.ts          currency and language preferences
│   └── date.ts                 calendar-day helpers (never new Date(day))
├── scripts/                    ocr-assets.js (model download + checksums), check-locales.js
├── utils/api.ts                shared axios instance with auth + error interceptors
├── contexts/ThemeContext.tsx   light/dark/system
└── public/locales/{en,zh}/     every user-facing string

eval/                           screenshot-import benchmark (separate npm project)
├── generate.mjs                the synthetic screenshot set
├── run.mjs                     OCR (cached) → parser → per-layout scores
├── exportFixtures.mjs          records OCR output for the backend tests
└── private/                    real screenshots — gitignored, never committed

docs/superpowers/specs/         design specs for screenshot import and the TypeScript backend
```

**Request flow:** route → auth middleware → validation → controller → service/db.
[`backend/ARCHITECTURE.md`](backend/ARCHITECTURE.md) has the diagram and where the layering still leaks.

### Conventions worth knowing

- **All config is centralized** in `config/index.ts`. Read env vars from there.
- **Controllers read the user id as `req.user.userId`.** Protected routers apply `router.use(auth)` at the top.
- **Validation** is `express-validator` arrays in the route file, checked with `validationResult(req)` at the top of the controller.
- **Always use parameterized queries.** Every query naming a user-owned table is scoped by `user_id`.
- **Amounts are two-decimal strings** in the import path, from OCR to INSERT — never floats.
- **Dates are calendar days, not instants.** A `pg` type parser hands `DATE` columns back as `'YYYY-MM-DD'`. Never `new Date(day).getMonth()` — a plain `'2026-08-01'` parses as UTC midnight and answers July west of UTC. Use `utils/dates.ts` and `lib/date.ts`.
- **Never log a credential** — no tokens, JWTs or password hashes — and **never log screenshot text, row values or request bodies**. Log a user id where one exists, a masked address only where one does not.
- **`logger.audit` is for destroying user data.** `info`/`warn`/`debug` print nothing in production.
- **Test fixtures from real screenshots** keep the OCR boxes and replace every name, place and reference number.
- **Adding a transaction category means four edits** — the list in `pages/transactions/new.tsx`, `CATEGORY_COLORS` in `pages/index.tsx`, and both `common.json` files.

---

## Mobile

[`mobile/`](mobile/) is a third npm project, built on Expo SDK 57 and Expo Router. It shares the API and nothing else.

```
mobile/src/
├── app/                        every file is a screen (file-based routing)
│   ├── _layout.tsx             root navigator, auth provider, safe area
│   ├── index.tsx               the gate: login or tabs, once the keychain answers
│   ├── login.tsx
│   ├── (tabs)/                 dashboard · transactions · add
│   └── transaction/[id].tsx    edit and delete
├── components/                 Card · DonutChart · BarChart · PeriodPicker
├── lib/                        api · auth · storage · theme · date · categories
└── types/api.ts                response shapes, captured from the live API
```

```bash
cd mobile && npm install
npx expo start          # scan with Expo Go, or press `i` for the simulator
npx tsc --noEmit        # typecheck
npx expo lint
npx expo-doctor         # dependency and config health
```

Running it on a phone needs `npx expo login` **and** the same account signed in inside Expo Go — the dev server then appears under "Development servers" and there is no QR code to scan. [`mobile/README.md`](mobile/README.md) covers the rest, including why `localhost` is unreachable from a phone.

**The three projects are deliberately not npm workspaces.** Workspaces consolidate every lockfile at the repo root, which breaks `npm ci` for both deploys at once — Render builds with root directory `backend`, Vercel with `frontend`. So `mobile/` copies the day helpers, the category list and the category colours from `frontend/`, and `backend/test/sharedContracts.test.ts` fails if any copy drifts.

There is **no `babel.config.js`** in `mobile/`, on purpose: the Expo Router install doc says to add one, but `babel-preset-expo` resolves only under `expo/` in SDK 57, so a hand-written config breaks Metro with `MODULE_NOT_FOUND`.

---

## Development

```bash
# backend
npm run dev              # tsx watch app.ts
npm start                # production
npm run build            # tsc → dist/
npm test                 # builds, then node --test
npm run lint             # eslint 9, flat config, typescript-eslint
npm run db:setup         # apply schema (idempotent)
npm run db:seed          # rebuild the demo account

# frontend
npm run dev              # runs ocr-assets first
npm run build            # runs ocr-assets first
npm start
npm run lint
npm run check:locales    # fails on duplicate or unresolved keys
npm run ocr-assets       # fetch + checksum the OCR model, copy ONNX Runtime

# mobile
npx expo start           # dev server; Expo Go or a simulator
npx expo export --platform ios   # bundle — catches what typecheck cannot

# eval
npm run generate         # regenerate the synthetic screenshot set
npm run benchmark        # score the shipped model on the synthetic set
npm run benchmark -- --set private   # score your own screenshots in eval/private/
npm run fixtures         # re-record backend/test/fixtures/ocr/ after a model change
npm test                 # scorer unit tests
```

To add a real screenshot to the private benchmark, put `name.png` and a hand-written `name.truth.json` (layout, `today`, and the expected rows) in `eval/private/`.

### Tests

[`backend/test/`](backend/test/) holds the application's tests — **519 across 31 files**, run by `node --test`. No test framework is installed and none is needed.

**Unit tests always run**, with no database and no network. They cover the things that fail silently:

- currency conversion and its caching; the term calendar and date helpers, swept across timezones
- the demo generator's evergreen properties at nine different "todays"
- the startup config check, retention predicates, logger levels in production
- the scheduler's timer plumbing, and the weekly report's next run **on a UTC clock**
- every AI endpoint when OpenAI is out of credit or rate-limited
- that registration and the import routes never write a token, an address, screenshot text or a row value to the log
- the screenshot parser piece by piece and end to end, including layouts copied from real screenshots

**Drift guards** (`sharedContracts.test.ts`, `demoData.test.ts`) pin the code the three projects copy. `frontend/` and `mobile/` cannot import each other — React Native's `View` is not React DOM's `div` — so the day helpers, the category list and the category colours are duplicated on purpose, and these tests fail the moment any of them stop agreeing.

**Recorded OCR fixtures** (`importFixtures.test.ts`) replay real OCR output — captured by the [`eval/`](eval/) benchmark and checked into `backend/test/fixtures/ocr/` — through the live parser on every run, so a parser change is caught without re-running OCR in CI.

**`api.test.ts` needs a database and skips without one.** It refuses to borrow `DATABASE_URL` from `.env`:

```bash
TEST_DATABASE_URL=postgresql://user@localhost:5432/mindgo_test npm test
```

It creates and deletes users, which is why opting in is deliberate. **Never point it at production.**

Neither the frontend nor `mobile/` has a test runner. Verify UI changes by running the app; for `mobile/`, `npx tsc --noEmit`, `npx expo lint`, `npx expo-doctor` and `npx expo export` are the checks that exist.

### CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs backend lint and tests against a Postgres service container, plus `check:locales`, lint and `build` for the frontend (which downloads and checksums the OCR model). It uses `npm ci`, so a `package.json` that disagrees with its lockfile fails the build.

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
| `GET, PUT /profile` | read and update the profile; `GET` includes the notification flags |
| `PUT /notifications` | `weekly_reports_enabled`, `email_notifications_enabled` — the scheduled email needs both |
| `POST /test-email` | send the weekly report now |

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
| `GET, PUT /retention-settings` | retention preferences (not persisted — see Known gaps) |
| `POST /import` | write confirmed screenshot-import rows (1–100, all or nothing) plus one `import_batches` record |

### `/import`
| | |
|---|---|
| `POST /parse` | OCR lines in; `layout` (`bank-list`, `receipt`, `uber-activity`, `uber-eats-orders`, `wechat-pay` or `unknown`), draft rows and flags out; nothing stored; 30 per 15 min per user |

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

20 requests per hour per IP. Generated plans are deleted 30 minutes after creation. When OpenAI is out of credit or rate-limited, the generating endpoints answer **`503`** with `{ "code": "ai_unavailable" }`.

---

## Deployment

The backend runs on **Render**, the frontend on **Vercel**, the database on **Neon** (AWS `us-east-1`).

The backend is built with `tsc` during Render's build (`npm ci --include=dev`, which runs the `prepare` script), and `npm start` runs `node dist/app.js`. The frontend builds with `next build`, which first downloads the OCR model from a pinned commit and verifies its checksums.

**Before a deploy** that includes a new migration, apply it to the production database (use Neon's direct endpoint). Set `OPENAI_API_KEY` and the email credentials in Render, and keep the OpenAI account in credit — AI planning reports itself unavailable otherwise.

**Database connections:** `DATABASE_URL` points at Neon's *pooled* endpoint (`-pooler` in the host). Every query names tables unqualified, so `db/connection.ts` issues `SET search_path` on each new connection — defensive today, but Neon's Azure pooler handed out an empty `search_path` where every query failed. Use the **direct** endpoint (drop `-pooler`) for `pg_dump`/restore and migrations. In production, connections use `ssl: { rejectUnauthorized: false }`.

**Scheduled jobs** run in the backend process: weekly report emails via `node-cron` at 7 p.m. `America/Toronto` (the host clock is UTC), plus interval jobs that delete expired AI plans and unverified accounts. Nothing mounts them over HTTP. **`node-cron` must stay at 4.6 or later**: 4.2 computed the next Sunday as 2034 and never sent the email.

---

## Stack

**Backend** — TypeScript, Express 4, PostgreSQL via `pg`, JWT auth with `bcryptjs`, `express-validator`, `helmet`, `express-rate-limit`, `morgan`, `node-cron`, `nodemailer`, `openai`.

**Frontend** — Next.js 14 (Pages Router), React 18, TypeScript, Tailwind CSS, Radix UI, Recharts, React Hook Form, `next-i18next`, SweetAlert2, react-hot-toast, Lucide icons.

**Mobile** — Expo SDK 57, React Native 0.86, Expo Router (file-based, like the web app's Pages Router), `expo-secure-store` for the token, `react-native-svg` for the charts.

**On-device OCR** — [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) PP-OCRv6 small through [`ppu-paddle-ocr`](https://www.npmjs.com/package/ppu-paddle-ocr) and ONNX Runtime Web (single-threaded WASM, in a Web Worker); the benchmark uses `onnxruntime-node` and `@napi-rs/canvas`.

**External services** — [Finnhub](https://finnhub.io/), Yahoo Finance and [Alpha Vantage](https://www.alphavantage.co/) for stock data; [OpenAI](https://openai.com/) for planning; [Frankfurter](https://www.frankfurter.app/) for exchange rates; [MailboxLayer](https://mailboxlayer.com/) for address validation; Gmail SMTP for mail.

## Database

Six tables: `users`, `transactions`, `savings_goals`, `watchlist`, `ai_plans`, `import_batches`. `updated_at` is maintained by triggers. Monetary rows carry a `currency` column. `transactions.source` (`manual` | `ocr` | `ocr_llm`, migration `011`) records where a row came from; `import_batches` holds one row per confirmed screenshot import — counts only, never text or amounts.

## Known gaps

The improvement backlog is retired; the reasoning for anything already fixed lives in the comment next to the code, and the rest is in git history.

- **Phone OCR speed is unmeasured**, and screenshot import is not in the mobile client. Import takes about 1–2 s per image on a laptop; a phone may be several times slower. `POST /import/parse` takes OCR lines rather than an image, so a native client could feed it Apple Vision or ML Kit output instead of the 45 MB WASM model — but the parser's layout thresholds were tuned against one specific engine, so `eval/` needs re-running before that output can be trusted. It also needs a development build, since Expo Go bundles no OCR module.
- **Uber and Uber Eats imports can double-count** a card charge already imported from a bank screenshot. Duplicates are flagged only when the day, amount and currency all match.
- **Each new app layout needs its own parser rules.** Every layout added so far needed at least one measured spacing rule; an unsupported app shows the recognised text for manual entry.
- **The LLM fallback for screenshot import was not built.** The seven real screenshots tried so far were all read by the rule-based parser once their layouts were added; unsure rows report `ai_fallback_unavailable`.
- **Retention settings do not persist.** `GET/PUT /transactions/retention-settings` reports a saved preference it never stores, and nothing acts on one. The settings page no longer shows or requests it.
- **`/summary/rolling` returns every transaction twice** and aggregates in Node — one user's year is a ~154 kB response. This is the gate on an *All time* view.
- **No frontend test runner**, so `lib/date.ts` and `lib/preferences.ts` are unguarded. `mobile/` has none either.
- **The mobile client covers three of the API's seven routers.** No savings goals, investments, AI planning, screenshot import, registration or settings; new transactions are hardcoded to CAD, and there is no dark mode.
- **The API has no `GET /transactions/:id`.** The mobile edit screen therefore reads the row from a list it already loaded and cannot be deep-linked to. Adding the endpoint would fix it — declared *after* `GET /categories`, or `:id` swallows that route.
- **Locale files are unguarded** against category drift; the backend and frontend category lists are pinned to each other, the translations are not.
- **`LOG_LEVEL` is close to inert** — it gates `debug()` and nothing else.

## Contributing

Private project. For collaboration, contact the maintainer directly.
