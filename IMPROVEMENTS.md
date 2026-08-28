# MindGo — Improvement Backlog

Findings from a code audit on 2026-08-27, after the database cleanup and the
Azure → AWS region migration. Each item was verified against the code at the
time of writing; file:line references are from that commit.

Ordered by value-per-effort, not by severity alone.

## Status

| # | Item | Status |
|---|---|---|
| 1 | Rate limiters written but never mounted | ✅ done — PR #12 |
| 2 | `config/index.js` is decorative; password length mismatch | ✅ done — round 2 |
| 3 | No fail-fast on missing secrets | ✅ done — round 2 |
| 4 | Six wrong Chinese translations (duplicate keys) | ✅ done — PR #12 |
| 5 | No tests; `npm test` passes by doing nothing | ✅ done — round 2 |
| 6 | `npm run lint` cannot run in *either* project | ✅ done — round 2 |
| 7 | Orphan `Savings` category | open — needs a product call |
| 8 | Scheduler depends upward on controllers | open |
| 9 | 62 Chinese strings missing entirely | partly done — guard added, translations open |
| 10 | Environment variables are undocumented | ✅ done — round 2 |
| 11 | `package-lock.json` drifted from `package.json` | ✅ fixed in passing — PR #12 |
| 12 | AI plans ignored the user's finances | ✅ fixed in passing — round 2 |
| 13 | Three dead top-level symbols, and a 500 on register | open — needs a product call |
| 14 | `/auth/verify-email` leaks another user's email | ✅ done — round 2 |
| 15 | Two services crashed the whole app at boot without an optional key | ✅ done — round 3 |

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

**Status:** ✅ DONE 2026-08-28
**Effort:** small
**Risk if ignored:** config drifts from behaviour; already had

Resolved by making `config/` the only place that reads `process.env`, and
resolving each drift toward the stricter value:

| Drift | Resolution |
|---|---|
| config 8 vs `routes/auth.js` min 6 | **8.** Gates registration only — login compares the hash and there is no password-change endpoint, so existing shorter passwords still work |
| config 255 vs code 254 | **254**, per RFC 5321. The column is `VARCHAR(255)`, so 254 is the tighter limit |
| `jwt.secret` / `expiresIn` declared but unread | Both now read from config |
| `nameMaxLength: 100` enforced nowhere | Enforced on register **and** profile update, turning a Postgres 500 into a 400 |

Also folded in the literals config was supposed to own — verification token
lifetime (previously duplicated), resend cooldown, and both cleanup retention
windows. The cleanup `DELETE`s used `INTERVAL '30 minutes'` inline and now take
the value as a parameter via `make_interval(mins => $1)`, verified equivalent
against the live database.

Four variables were read from `process.env` but missing from config entirely:
`FINNHUB_TOKEN`, `ALPHA_VANTAGE_API_KEY`, `FRONTEND_URL`, `DB_SCHEMA`.

> The stale comment in `db/connection.js` claiming Neon hands out an empty
> `search_path` was corrected — that was specific to the **Azure** pooler, and
> the project now runs on AWS, where the pooler returns a normal `"$user", public`.

<details>
<summary>Original finding</summary>

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
</details>

---

## 3. No fail-fast on missing secrets at startup

**Status:** ✅ DONE 2026-08-28
**Effort:** ~12 lines

`config/validate.js` runs before the route modules load and exits 1 naming what
is missing. Database configuration is satisfied by either `DATABASE_URL` or a
complete set of `DB_USER` / `DB_HOST` / `DB_DATABASE`, and the message names
which of the three are absent.

Everything else is a warning rather than an exit, so local development still
runs without a full key set: a `JWT_SECRET` under 32 characters, and each
optional variable paired with the feature that stops working. A degraded deploy
now announces itself in the boot log.

Verified across five environment states — nothing set, each required value
missing alone, partial `DB_*`, and a short secret.

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
on any duplicate key and is verified against an injected duplicate. ✅ Wired
into CI as of item 5.

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

**Status:** ✅ DONE 2026-08-28
**Effort:** medium

31 tests, run by `node --test`. No framework installed — none was needed.

| File | Needs | Covers |
|---|---|---|
| `exchangeRateService.test.js` | nothing | the rate, the cache, per-direction keys, and the failure modes that produce a *plausible* wrong number |
| `configValidate.test.js` | nothing | the startup check, in a child process because it exits |
| `api.test.js` | `TEST_DATABASE_URL` | login, validation, ownership scoping, summary arithmetic, delete |

The integration suite **will not borrow `DATABASE_URL` from `.env`** — it
creates and deletes users, so pointing it anywhere has to be deliberate. It
skips with a message when the variable is absent, so `npm test` stays useful on
a machine with no Postgres.

**The tests were verified to fail.** Three mutations, each caught by exactly the
intended test and nothing else: net income subtraction → addition, ownership
scoping dropped from the transaction query, and the exchange-rate cache key
made order-independent. A suite that has never failed is not evidence of
anything.

Two blockers had to go first, both real bugs in their own right:

- `app.js` bound a port on `require`, so importing it to test the routes
  started a server. Now guarded by `require.main === module`.
- `db/connection.js`'s five-minute inactivity timer kept the event loop alive,
  so **any** script requiring it hung for five minutes after finishing its
  work. Now `unref`'d.

CI is `.github/workflows/ci.yml`: backend lint + tests against a Postgres 17
service container, frontend `check:locales` + lint + build. It uses `npm ci`,
so the drift in item 11 would now fail the build.

> **Found while writing these:** the rate limiter values were still hardcoded in
> `middleware/rateLimiter.js`, which item 2 missed. They are in `config` now and
> readable from the environment, which closes the tuning note under item 1.
> Also worth knowing: `authLimiter`'s 5 per 15 minutes covers `/register`,
> `/login`, `/resend-verification` and `/test-email` **combined** per IP — a
> user who mistypes a password three times and then tries to register is locked
> out.

<details>
<summary>Original finding</summary>

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
</details>

---

## 6. `npm run lint` cannot run in *either* project

**Status:** ✅ DONE 2026-08-28
**Effort:** trivial to fix; the findings were not

Backend: eslint 9 plus a flat config. Deliberately not a style linter —
formatting arguments are not worth a build failure on an existing codebase — so
the rules are the ones that catch defects.

**The frontend was worse than recorded here.** `next lint` with no config file
does not fail; it *prompts interactively* for setup, so in CI it hangs rather
than errors. Added `.eslintrc.json` extending `next/core-web-vitals`, which the
already-installed `eslint-config-next` provides. It now completes: six
`react-hooks/exhaustive-deps` and `no-img-element` warnings, no errors.

The first backend run found 19 problems, including three real defects — see
item 12 and the `globalErrorHandler` duplicate. The rest were dead bindings,
now removed. Three dead top-level symbols are marked rather than deleted; see
item 13.

Both lint scripts run in CI as of item 5, so nothing runs unattended any more.

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

## 9. Chinese strings are missing entirely and render as English

**Status:** partly done — the guard is in, the translations are not
**Effort:** small mechanically; needs someone who reads Chinese

`npm run check:locales` now reports unresolved keys as **warnings** (duplicates
stay fatal), so new untranslated strings are caught when they are added instead
of being found by a user. Current state, out of 475 keys used:

| Locale | Missing |
|---|---|
| `zh` | **62** — a Chinese user reads raw English mid-sentence |
| `en` | **28** — invisible, because the key *is* the English string |

Writing that check turned up a subtlety worth recording. Resolution has to
mirror i18next, which walks the key as a dotted path **and then falls back to
the literal flat key** — that fallback is `ignoreJSONStructure`, on by default.
A naive path lookup reports every key merely *containing* a dot as missing:
`"Saving..."`, and every sentence ending in one. The first version of the check
did exactly that and claimed 125 missing; the real number is 62.

**What is left** is the translation itself, which wants someone who reads
Chinese. The worst offender remains `components/StockWatchlist.tsx`, which is
close to entirely untranslated.

<details>
<summary>Original finding</summary>

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
</details>

---

## 10. Environment variables are undocumented

**Status:** ✅ DONE 2026-08-28
**Effort:** ~20 lines
**Found:** during the Azure → AWS migration

Both projects now have a committed `.env.example` with placeholder values, each
variable annotated with what stops working without it. The backend list is
derived from `config/index.js` (item 2), so the two can be kept in step by
inspection.

> Both `.gitignore` files matched `.env.*` and would have silently swallowed
> these templates. Each gained a `!.env.example` negation — verified that `.env`
> itself is still ignored, and that no real value from either `.env` appears in
> the committed examples.

Variables that are set somewhere but read nowhere are recorded rather than
dropped, so their absence is not mistaken for an oversight:
`FINNHUB_WEBHOOK_SECRET` (backend); `NEXT_PUBLIC_APP_NAME`,
`NEXT_PUBLIC_APP_VERSION`, `EXCHANGE_RATE_API_KEY` and `CUSTOM_KEY` (frontend).

<details>
<summary>Original finding</summary>

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
</details>

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

## 12. AI plans were generated without the user's finances

**Status:** ✅ fixed 2026-08-28
**Found:** by the linter, as an unused variable

`services/aiPlanner.js` called `buildFinancialContext()` and assembled a
detailed summary — income, expenses, savings, timeline, goals, six months of
spending by category, closing with *"Please provide personalized advice based
on this information"* — and then never put it in the request. Only the system
prompt and the raw user question reached the model.

Every AI plan the product has ever produced was advice for a stranger. It would
not look broken: the model still answers fluently, just generically.

The context is now sent as its own system turn ahead of the question, so
`userPrompt` stays exactly what the user typed. Same function also read a
currency from the form and ignored it, printing every amount with a dollar
sign — an account in CAD was described to the model as USD.

> This is the argument for item 6 in one finding. A one-line lint rule found in
> five minutes something that had been silently wrong for the life of the
> feature, because the symptom was *plausible output*.

---

## 13. Three dead top-level symbols, and a 500 on register

**Status:** open — each needs a product decision
**Found:** by the linter

Marked with `eslint-disable` and a comment rather than deleted, because
"remove it" and "wire it up" are both defensible and the choice is not mine:

1. **`DISPOSABLE_EMAIL_DOMAINS`** (`controllers/authController.js`) — a list of
   ~30 throwaway-mail domains, superseded by the MailboxLayer API call.
2. **`createSampleDataForNewUser`** (same file) — never called, so new accounts
   get no starter data. Removed feature, or lost wiring?
3. **`createAsciiPieChart`** (`services/emailService.js`) — the weekly report is
   assembled without it.

The first is entangled with a live bug. `validateEmailMailboxLayer()` throws
when `MAILBOXLAYER_API_KEY` is absent, and that `throw` sits **outside** the
function's own `try`, so it escapes to the route handler: **`/auth/register`
returns 500 for every caller** when the key is unset. The key is documented as
optional and is not. Wiring the dead domain list in as the fallback would make
it genuinely optional; that is the case for option "wire it up".

---

## 14. `/auth/verify-email` returns another user's email address

**Status:** ✅ FIXED 2026-08-28 — **security**
**Found:** while reading item 13's surroundings

`controllers/authController.js`, in `verifyEmail`. When the supplied token
matches no user, the handler does not stop. It runs a second query for *any*
account verified in the last 30 minutes and returns that row:

```sql
SELECT id, email, first_name FROM users
WHERE email_verified = TRUE AND email_verification_token IS NULL
  AND created_at > NOW() - INTERVAL '30 minutes'
ORDER BY created_at DESC LIMIT 1
```

The route is unauthenticated (`routes/auth.js`, no `auth` middleware). So
`GET /auth/verify-email/anything` returns the id, email address and first name
of an unrelated user — whoever most recently signed up — to any caller.

Verified: the route takes no credentials, and the query returns a real row with
those three columns. The live branch was not reachable at the time of writing
because no account had verified within the window, which is also why this has
never been noticed.

The intent was a friendly "you're already verified" message for someone who
clicks their link twice. Verification clears the token, so the second click is
genuinely indistinguishable from a forged one — and the query guessed.

**Fixed by deleting the fallback.** An unknown token now returns the 400 the
handler already had. Verified: forged tokens of both shapes return 400 with no
`@` anywhere in the response, and a real end-to-end verification still succeeds
and returns only that user's own row.

The same handler was also logging the raw verification token, which is a
credential — possession of it verifies the account — into every log sink the
platform ships to. That line no longer includes it.

**Follow-up, if the friendly message is wanted back:** it has to be keyed on
*which* token was consumed. Either stop nulling the token on verification and
branch on `email_verified`, or add a `email_verification_used_at` column. The
second is cleaner but needs a migration plus the matching `schema.sql` edit.
The frontend still has its `alreadyVerified` branch, which currently does the
same thing as the success branch, so restoring it is backend-only.

---

## 15. Two services crashed the whole app at boot without an optional key

**Status:** ✅ FIXED 2026-08-28
**Found:** by CI, on its first ever run

`services/aiPlanner.js` and `services/finnhubService.js` are both exported as
instances (`module.exports = new X()`), so their constructors run at *require*
time. `aiPlanner` built the OpenAI client there, and the SDK throws without
`OPENAI_API_KEY`; `finnhubService` threw explicitly without `FINNHUB_API_KEY`.

`investmentController` and `aiController` require them, so a missing key took
down the **entire API at boot** — every route, not just `/ai` and the stock
endpoints. Neither key is documented as required, and item 3's startup check
described both as degrading gracefully. They did not.

This is the clearest possible argument for item 5. It could not show locally,
because `.env` has both keys; it showed in CI within a minute of the workflow
existing, on a runner that has neither.

The OpenAI client is now built on first use, which also makes `generatePlan`'s
own `"OpenAI API key not configured"` guard reachable — it had been dead code,
since the process died before any request could arrive. `finnhubService` no
longer throws: its methods pass the key per request and callers already fall
back to `freeStockDataService`, so a missing key degrades to the free Yahoo
path as the layered design intended.

CI sets neither key, so this cannot regress.

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

1. ~~Rate limiters + `trust proxy`~~ — done (PR #12)
2. ~~The 6 zh translations, and namespacing the colliding keys~~ — done (PR #12)
3. ~~`config` as the single source of env and policy~~ — done (round 2, items 2/3/10)
4. ~~Make lint runnable~~ — done (round 2, item 6), which produced items 12–14
5. ~~Delete the `verify-email` fallback query~~ — done (round 2, item 14)
6. ~~Tests and CI~~ — done (round 2, item 5)
7. ~~A guard for untranslated keys~~ — done (round 3, item 9)
8. **Next:** translate the 62 missing Chinese strings (item 9), and push the
   scheduler's cleanup logic down out of the controllers (item 8)

**Waiting on a decision, not on work:** items 7 (orphan `Savings` category) and
13 (three dead symbols, and whether a missing `MAILBOXLAYER_API_KEY` should
stop 500ing registration). Item 9 needs someone who reads Chinese to check the
translations, though the mechanical part can be prepared first.

Items 7 and 8 are cleanup rather than risk; do them when touching that code.
