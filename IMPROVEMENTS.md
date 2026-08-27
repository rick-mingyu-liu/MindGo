# MindGo — Improvement Backlog

Findings from a code audit on 2026-08-27, after the database cleanup and the
Azure → AWS region migration. Each item was verified against the code at the
time of writing; file:line references are from that commit.

Ordered by value-per-effort, not by severity alone.

## Status

| # | Item | Status |
|---|---|---|
| 1 | Rate limiters written but never mounted | ✅ done — PR #12 |
| 2 | `config/index.js` is decorative; password length mismatch | open |
| 3 | No fail-fast on missing secrets | open |
| 4 | Six wrong Chinese translations (duplicate keys) | ✅ done — PR #12 |
| 5 | No tests; `npm test` passes by doing nothing | open |
| 6 | `npm run lint` cannot run in the backend | open |
| 7 | Orphan `Savings` category | open |
| 8 | Scheduler depends upward on controllers | open |
| 9 | 59 Chinese strings missing entirely | open |
| 10 | Environment variables are undocumented | open |
| 11 | `package-lock.json` drifted from `package.json` | ✅ fixed in passing — PR #12 |

---

## 1. Rate limiting is written but never wired up

**Status:** ✅ DONE 2026-08-27
**Effort:** ~4 lines
**Risk if ignored:** unlimited password guessing; unmetered spend on OpenAI

Mounted with `app.set('trust proxy', 1)`, `apiLimiter` after `/health`, and
`aiLimiter` on `/ai`. `authLimiter` is applied **per-route** in
`routes/auth.js` — a blanket limiter on `/auth` would cap `/notifications` and
`/profile` at 5 requests per 15 minutes and break the settings page.

Verified: login 400 ×5 then 429; `/health` unthrottled; `/auth/notifications`
survives 6 rapid saves; all read endpoints still 200.

> **Still to tune:** `apiLimiter` allows 100 requests / 15 min per IP. The
> dashboard fires ~5 requests per load, so that is roughly 20 page loads per
> quarter hour before a real user gets 429s — plausibly tight for active use,
> and users behind one NAT share the bucket. Consider raising it, or keying
> authenticated requests on `req.user.userId` instead of IP.

`backend/middleware/rateLimiter.js` defines `apiLimiter`, `authLimiter`
(5 attempts / 15 min) and `aiLimiter`. Nothing in the backend imports them —
`app.js` never references the file. The module is dead code.

Consequences:

- `/auth/login` accepts unlimited attempts against bcrypt cost 10
  (`controllers/authController.js:97`). No account lockout either.
- `/ai/*` is unmetered, and each call costs real OpenAI credit.

Fix:

```js
const { apiLimiter, authLimiter, aiLimiter } = require('./middleware/rateLimiter');
app.use('/auth', authLimiter, authRoutes);
app.use('/ai', aiLimiter, aiRoutes);
app.use(apiLimiter); // everything else
```

**Do not skip `app.set('trust proxy', 1)`.** Render terminates TLS at a proxy, so
`express-rate-limit` sees one upstream IP for every request. Without it the
limiter throttles the whole user base as a single client — worse than no limiter.

---

## 2. `config/index.js` is decorative — the code reads `process.env` directly

**Status:** open
**Effort:** small
**Risk if ignored:** config drifts from behaviour; already has

CLAUDE.md says config is centralized and features should read from it. In
practice only `services/schedulerService.js` imports it. 13 other sites across
`controllers/` and `services/` read `process.env` directly.

Already drifted:

| `config/index.js` claims | Code actually does |
|---|---|
| `validation.passwordMinLength: 8` | `routes/auth.js:43` enforces `min: 6` |
| `jwt.expiresIn: '7d'` | `controllers/authController.js:177` hardcodes `'7d'` |
| `jwt.secret` | `authController.js:176`, `middleware/auth.js:11` read `process.env` |

The password mismatch is a live weakness: the config asserts 8 characters, the
API accepts 6.

Pick one direction — route the code through `config`, or delete the unused keys.
The current half state is the worst outcome: it reads as authoritative while
being fiction.

---

## 3. No fail-fast on missing secrets at startup

**Status:** open
**Effort:** ~12 lines

With `JWT_SECRET` unset the app boots normally, then every login 500s and every
authenticated request 401s. The failure is diagnosed from symptoms rather than
announced.

Assert `DATABASE_URL` and `JWT_SECRET` are present at boot and exit loudly if
not. Cheap, and directly relevant while environment variables are being edited
on Render.

---

## 4. Chinese translations are wrong — 6 conflicting duplicate keys

**Status:** ✅ DONE 2026-08-27
**Effort:** small for the strings; medium if namespacing properly

Fixed by splitting the genuinely-distinct meanings into a nested `stock` block
and deduping the rest. Flat keys now carry the general-UI sense, `stock.*` the
market sense:

| Key | Renders now |
|---|---|
| `Close` / `stock.Close` | 关闭 *(dialog button)* / 收盘 *(closing price)* |
| `High` / `stock.High` | 高 *(risk tolerance)* / 最高 *(session high)* |
| `Low` / `stock.Low` | 低 / 最低 |
| `Net Income` / `stock.Net Income` | 净收入 *(personal)* / 净利润 *(company)* |
| `Name` | 名称 — the 指数 variant was simply wrong for a name column |
| `Change %` | 涨跌幅 — the more idiomatic of the two |

Call sites updated in `components/StockDetailModal.tsx` (4 lines). All 11 English
and 7 Chinese duplicates removed; verified 0 regressions across 472 `t()` keys,
`tsc` clean, `next build` passing.

`npm run check:locales` (`frontend/scripts/check-locales.js`) now fails the build
on any duplicate key and is verified against an injected duplicate. **Wire it
into CI** when item 5 is done.

`frontend/public/locales/zh/common.json` has 7 duplicated keys, 6 of them with
**different values**. `JSON.parse` keeps the last occurrence silently.

| Key | First (correct in finance context) | Last — what actually renders |
|---|---|---|
| `Close` | 收盘 *(closing price)* | 关闭 *(close a dialog)* |
| `Name` | 指数 *(index)* | 名称 |
| `High` | 最高 | 高 |
| `Low` | 最低 | 低 |
| `Net Income` | 净收入 | 净利润 *(net profit)* |
| `Change %` | 变动 % | 涨跌幅 |

`en/common.json` has 11 duplicates but no conflicting values, so the bug is
invisible in English.

The strings are the symptom. The cause is that flat keys like `Close` are reused
for unrelated concepts — namespacing (`stock.close` vs `action.close`) is what
stops it recurring.

> **Editing note:** any tooling that round-trips these files through
> `JSON.parse`/`stringify` will silently delete the duplicate keys and lock in
> the wrong translation. Edit line-wise.

---

## 5. No tests, and `npm test` passes by doing nothing

**Status:** open
**Effort:** medium

`backend/package.json` → `"test": "echo \"No tests specified\" && exit 0"`. It
exits 0, so any CI would report green while testing nothing. No test files exist
in either project. No CI workflows at all (`.github/workflows` absent).

Not a plea for coverage targets. But the region migration was verified with curl
commands written by hand, twice — that work should have been a file.

Highest-leverage starting point is one integration path:
register → login → create transaction → verify summary math → delete.
That single flow exercises auth, validation, ownership scoping, currency
conversion and the `updated_at` triggers.

Currency conversion deserves unit tests specifically: pure arithmetic on money,
a network dependency behind a 1-hour cache, and a wrong rate produces
plausible-looking numbers — the worst kind of failure.

---

## 6. `npm run lint` cannot run in the backend

**Status:** open
**Effort:** trivial

`backend/package.json` declares `"lint": "eslint ."`, but eslint is not in
`dependencies` or `devDependencies` and no config file exists. The command fails
with `command not found`.

Install and configure it, or delete the script. The frontend has `next lint`,
but nothing runs it automatically.

---

## 7. Orphan `Savings` category

**Status:** open
**Effort:** trivial

Four expense rows are categorized `Savings`, which appears in no category list
in the code — not `frontend/pages/transactions/new.tsx`, not the dashboard's
`CATEGORY_COLORS`. They render with fallback styling and the value cannot be
re-selected if the transaction is edited.

Either promote `Savings` to a real category or migrate the four rows to
`Other Expenses`. Same class of schema/code drift the August cleanup removed.

---

## 8. The scheduler depends upward on controllers

**Status:** open
**Effort:** medium

`services/schedulerService.js` imports `authController` and `aiController` to
reuse `autoDeleteOldAIPlans` and `deleteUnverifiedAccounts` — a service
depending on the layer above it. Those functions are also HTTP handlers written
against `(req, res)`, so the scheduler works around their signature.

Push the logic down into a cleanup service that both the controller and the
scheduler call. Already noted in `backend/ARCHITECTURE.md`.

Lower priority, same family: SQL lives directly in controllers (~11 `db.query`
calls in `transactionController.js` alone). Fine at current size; it becomes the
reason a schema change takes a day once the table count grows.

---

## 9. 59 Chinese strings are missing entirely and render as English

**Status:** open (found while fixing item 4)
**Effort:** small mechanically; needs someone who reads Chinese

Auditing all 472 `t()` keys against both locale files:

- **zh: 59 keys have no entry** — i18next falls back to the key itself, so a
  Chinese user sees raw English mid-sentence. Worst offender is
  `components/StockWatchlist.tsx`, which appears to be entirely untranslated.
- **en: 25 keys have no entry** — invisible, because the key *is* the English
  string. Harmless today, but it means `en/common.json` is not a reliable
  inventory of translatable strings.

Extend `scripts/check-locales.js` to also report unresolved keys, so new
untranslated strings are caught when added rather than discovered by a user.
Keep it a warning rather than an error until the existing 59 are cleared,
otherwise it just blocks every build.

---

## 10. Environment variables are undocumented

**Status:** open
**Effort:** ~20 lines
**Found:** during the Azure → AWS migration

Neither project has a `.env.example`, `.env.sample`, or any other list of the
variables it needs. `backend/.env` currently holds 15 keys — `DATABASE_URL`,
`JWT_SECRET`, `OPENAI_API_KEY`, `FINNHUB_API_KEY`, `FINNHUB_TOKEN`,
`FINNHUB_WEBHOOK_SECRET`, `ALPHA_VANTAGE_API_KEY`, `EMAIL_USER`, `EMAIL_PASS`,
`MAILBOXLAYER_API_KEY`, `FRONTEND_URL`, and others — and the only way to
discover any of them is to grep for `process.env`.

Two concrete costs already observed:

1. **Local and Render can drift silently.** During the region migration there
   was no way to confirm the deployed `DATABASE_URL` matched the local one
   without reading it out of the Render dashboard by hand. When the database
   password was later rotated, nothing flagged that one of the two copies was
   now stale.
2. A fresh clone cannot be run without reverse-engineering the required keys.

Add a committed `.env.example` for each project listing every variable with a
placeholder value and a one-line comment, and note which are optional. Pairs
naturally with item 3 — the startup assertion should check exactly the set the
example documents.

---

## 11. `package-lock.json` had drifted from `package.json`

**Status:** ✅ fixed in passing (PR #12)
**Found:** while wiring up item 1

`backend/package.json` declared `express-rate-limit@^7.1.5`, but the lockfile
had no entry for it and it was absent from `node_modules`. `npm install`
tolerates this; **`npm ci` does not** — it fails outright when the two files
disagree.

The lock now has it (7.5.1). Worth confirming the deploy uses `npm ci` rather
than `npm install`, so this class of drift fails the build instead of
resolving to whatever the registry serves that day.

---

## Operational follow-ups

Not code — carried over from the 2026-08-27 database work.

- [ ] **Confirm Render holds the rotated database password.** It was rotated
      after the migration; if Render still has the pre-rotation credential,
      production is down.
- [ ] **Delete the old Azure Neon project** once the AWS one has run clean for
      a few days. That also permanently invalidates the old credential. Azure
      regions stop receiving Neon features after 2026-10-05.
- [ ] **Backups** from the migration live in `~/mindgo-db-backups-2026-08-27/`
      (full `pg_dump` plus six CSVs). They contain real emails and bcrypt
      hashes — keep them out of the repo.

---

## Suggested order

1. ~~Wire up the rate limiters + `trust proxy`~~ — done (PR #12)
2. ~~Fix the 6 zh translations and namespace the colliding keys~~ — done (PR #12)
3. **Next:** password-length mismatch, and resolve the `config` question (item 2)
4. Startup assertions for `JWT_SECRET` / `DATABASE_URL` (item 3), together with
   a `.env.example` documenting the same set (item 10)
5. One integration test file over the auth → transaction → summary path, with
   `check:locales` wired into the same CI workflow (items 5, 6)
6. Fill in the 59 missing Chinese strings (item 9)

Items 7 and 8 are cleanup rather than risk; do them when touching that code.
