# MindGo — Improvement Backlog

Findings from a code audit on 2026-08-27, after the database cleanup and the
Azure → AWS region migration. Each item was verified against the code at the
time of writing; file:line references are from that commit.

Ordered by value-per-effort, not by severity alone.

Three items remain open, and **all three are blocked on a decision** rather than
on work. They are collected under [Decisions needed](#decisions-needed) so they
can be answered without reading the whole backlog.

## Status

| # | Item | Status |
|---|---|---|
| 1 | Rate limiters written but never mounted | ✅ done — PR #12 |
| 2 | `config/index.js` is decorative; password length mismatch | ✅ done — round 2 |
| 3 | No fail-fast on missing secrets | ✅ done — round 2 |
| 4 | Six wrong Chinese translations (duplicate keys) | ✅ done — PR #12 |
| 5 | No tests; `npm test` passes by doing nothing | ✅ done — round 2 |
| 6 | `npm run lint` cannot run in *either* project | ✅ done — round 2 |
| 7 | Orphan `Savings` category | open — **decision A** |
| 8 | Scheduler depends upward on controllers | ✅ done — round 5 |
| 9 | 59 Chinese strings missing entirely | ✅ done — round 4 |
| 10 | Environment variables are undocumented | ✅ done — round 2 |
| 11 | `package-lock.json` drifted from `package.json` | ✅ fixed in passing — PR #12 |
| 12 | AI plans ignored the user's finances | ✅ fixed in passing — round 2 |
| 13 | Three dead top-level symbols, and a 500 on register | open — **decisions B and C** |
| 14 | `/auth/verify-email` leaks another user's email | ✅ done — round 2 |
| 15 | Two services crashed the whole app at boot without an optional key | ✅ done — round 3 |
| 16 | Registration writes verification tokens to the log | ✅ done — round 8 |
| 17 | Retention deletions are silent in production | open — **decision D** |

---

## Decisions needed

Four open questions. Each one is blocked on a judgement call, not on work — the
investigation behind each is done and recorded in the item it points to. A
recommendation is given for each; none is so clear-cut that it should be taken
without a look.

### A. The `Savings` category — item 7

**What was found.** All four rows come **verbatim from `db/seed.sql` lines
51–54**: same amount (`500.00`), same description (`Emergency Fund
Contribution`), dates on the 25th of Mar–Jun 2025, all owned by user 1 — the
demo account. **No real user ever chose `Savings`**, because the UI has never
offered it. This is the seed file disagreeing with the category list, not user
data needing rescue.

| Option | Consequence |
|---|---|
| **Promote `Savings` to a real category** | Add it to `categories.expense` in `frontend/pages/transactions/new.tsx` and to `CATEGORY_COLORS` in `frontend/pages/index.tsx`. The seed stays as-is and the four rows become legitimate. Note the app already has a whole `savings_goals` table and feature, so the concept is not foreign to it. |
| **Migrate the rows to `Other Expenses`** | One `UPDATE` plus an edit to `db/seed.sql`, so fresh setups stop reintroducing it. Loses the distinction between "money spent" and "money set aside" in the demo data. |

**Recommendation: promote it.** "Emergency Fund Contribution" is a real thing a
finance app should be able to categorise, the feature it pairs with already
exists, and the migration option requires editing the seed file anyway — so
neither option is cheaper. Whichever you pick, `db/seed.sql` and the category
list must end up agreeing; that they disagree today is the actual defect.

### B. The three dead symbols — item 13

Each was left in place with an `eslint-disable`, because "delete it" and "wire
it up" are both defensible:

| Symbol | Where | The question |
|---|---|---|
| `DISPOSABLE_EMAIL_DOMAINS` | `controllers/authController.js` | See decision C — it is the natural fallback. |
| `createSampleDataForNewUser` | `controllers/authController.js` | New accounts currently get no starter data. Removed feature, or lost wiring? Only you know which was intended. |
| `createAsciiPieChart` | `services/emailService.js` | The weekly report is assembled without it. |

**Recommendation: delete `createAsciiPieChart`, decide `createSampleDataForNewUser`
on product grounds, and keep `DISPOSABLE_EMAIL_DOMAINS` pending decision C.** An
ASCII pie chart in an HTML email is not something the report is missing. The
starter-data one is genuinely a product question — an empty dashboard on first
login is a worse first impression, but fake transactions in a real finance app
are worse still.

### C. Should registration work without `MAILBOXLAYER_API_KEY`? — item 13

**Verified, not inferred.** `validateEmailMailboxLayer()` throws at
`authController.js:32` when the key is missing, and that `throw` sits **outside**
the function's own `try` (which opens at line 35). It escapes to `register`'s
catch at line 138, which returns `res.status(500)`. So **`/auth/register` returns
500 for every caller** when the key is unset — while `.env.example` and the
startup check both describe the key as optional.

| Option | Consequence |
|---|---|
| **Fall back to `DISPOSABLE_EMAIL_DOMAINS`** | Registration works without the key, with weaker disposable-address filtering. Gives the dead list a job and makes "optional" true. |
| **Skip validation entirely when the key is absent** | Simplest. Registration works; no disposable filtering at all. |
| **Make the key genuinely required** | Fail at boot in `config/validate.js` rather than at the first registration. Honest, but the app cannot run without a paid third-party key. |

**Recommendation: fall back to the domain list.** It resolves B and C together,
makes the documented "optional" accurate, and keeps some filtering rather than
none. Whichever you choose, the current state — documented optional, actually
required, and failing as an opaque 500 — should not be one of them.

### D. Should retention deletions be visible in production? — item 17

`logger.info` is gated on `config.logging.enableConsoleLogs`, which is
`NODE_ENV === 'development'`. Routing the cleanup row counts through it (round 5)
matches the rest of `schedulerService`, but means **those counts are silent in
production**, where the old `console.log` always printed. Errors still always
print, in every environment.

| Option | Consequence |
|---|---|
| **Leave it** | Consistent with the rest of the scheduler. No record of what the retention jobs deleted in production. |
| **Add a level that always prints** | e.g. `logger.audit`, for events that delete user data. Small change, confined to `utils/logger.js` and its callers. |
| **Give `utils/logger.js` a real level hierarchy** | Today `logging.level` gates only `debug()`; `info`/`warn` ignore it and key off `enabled`, and `error` always prints. A proper hierarchy is the general fix, and the bigger job. |

**Recommendation: add an always-printing level for deletions.** These jobs
delete user accounts unattended; "how many did it remove last week" is a
question worth being able to answer. The general logging rework is a bigger job
and does not need to block this.

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

**Status:** open — **decision A**
**Effort:** trivial once decided

Four expense rows are categorised `Savings`, which appears in no category list
in the code — not `categories.expense` in
[frontend/pages/transactions/new.tsx](frontend/pages/transactions/new.tsx), not
`CATEGORY_COLORS` in [frontend/pages/index.tsx](frontend/pages/index.tsx). They
render with fallback styling, and the value cannot be re-selected if the
transaction is edited.

**Where they came from — checked against the live database.** All four are
verbatim `db/seed.sql` lines 51–54: `500.00`, `Emergency Fund Contribution`,
the 25th of March, April, May and June 2025, all owned by user 1, the demo
account. Nothing here is user-entered, and nothing else in the table uses the
category:

```
Savings         | expense | 4 rows | all 2025-06-29, user 1 (demo)
Other Expenses  | expense | 5 rows
```

So this is not orphaned user data — it is **`db/seed.sql` disagreeing with the
category list**, which is why fixing only the rows would not fix the problem.
See decision A above.

---

## 8. The scheduler depends upward on controllers

**Status:** ✅ DONE 2026-08-28

`autoDeleteOldAIPlans` and `deleteUnverifiedAccounts` moved out of
`aiController` / `authController` into a new
[services/cleanupService.js](backend/services/cleanupService.js). The scheduler
now depends downward, and the controllers no longer carry methods that were
never HTTP handlers.

**The premise of this item was wrong, in a way worth recording.** Both this file
and `CLAUDE.md` said the two functions were "invoked both by HTTP routes and the
scheduler", so the plan was to split shared logic out from under two callers.
Grepping found **no route mounts for either one** — they take no `(req, res)`,
never send a response, and the scheduler was the only caller. A move, not a
split. Both documents are corrected.

### The three real bugs found on the way

None of these was the layering problem; all three were in the timer plumbing.

1. **`stop()` never stopped the cleanup jobs.** It tried `job.stop()` then
   `job.destroy()` and gave up. `setInterval` returns a `Timeout`, which has
   neither — so it fell through both branches and logged
   `Stopped scheduled job: aiCleanup` for a job that kept firing. Latent rather
   than harmful today, because both callers in `app.js` follow it with
   `process.exit(0)`; it bites the first time anything stops the scheduler
   without exiting.

2. **The error handling could not catch anything.** The shape was
   `setInterval(() => { try { asyncThing(); logger.debug('completed') } catch {} })`.
   `asyncThing()` returns a promise, so the `try` block exits before the work
   finishes: the `catch` was unreachable, and "completed" was logged the instant
   the task *started*. A cleanup failing every single run looked healthy.

3. **`getStatus()` reported every job as active forever**, stopped ones
   included — it read `job.running` and `job.nextDate()`, neither of which
   exists on either job type under node-cron 4. Never called; fixed rather than
   deleted.

Also removed: the unverified-account DELETE used
`RETURNING id, email, created_at` and logged **every deleted account's email
address**, putting user emails into the server log on a ten-minute timer. Same
family as item 14. The row count is all the caller needed.

### Design note

`cleanupService` **throws** rather than logging and returning. What a failed
cleanup means belongs to the caller — the scheduler logs and stays alive; a
future admin endpoint would return a 500. Swallowing it in the service takes
that choice from both, and swallowing is what let the old code report success
for work that had failed.

Covered by `test/cleanupService.test.js` and `test/schedulerService.test.js`
(20 tests, no database). Mutation-tested: reverting `stop()`, dropping the
`await`, removing `unref()`, restoring `RETURNING`, and re-swallowing the error
each fail the suite.

**Open question for you:** `logger.info` is gated on
`config.logging.enableConsoleLogs`, which is `NODE_ENV === 'development'`. The
cleanup now logs its row counts through the logger, matching the rest of
`schedulerService` — which means **in production those lines are silent**. The
old `console.log` always printed. Errors still always print. If you want an
audit trail of what the retention jobs delete in production, that is a logger
change rather than a scheduler one.

**Not done, same family:** SQL still lives directly in controllers (~11
`db.query` calls in `transactionController.js` alone). Fine at current size; it
becomes the reason a schema change takes a day once the table count grows.

---

## 9. Chinese strings are missing entirely and render as English

**Status:** ✅ DONE 2026-08-28

All 475 keys now resolve in both locales. 59 Chinese translations and 25 English
entries were written; `npm run check:locales` reports `✔ every key resolves` for
both, and CI runs it.

Two subtleties about *counting* the gap, both of which produced a wrong number
before producing a right one:

1. **i18next resolution is not a dotted-path lookup.** It walks the key as a
   path **and then falls back to the literal flat key** — that fallback is
   `ignoreJSONStructure`, on by default. A naive path lookup reports every key
   merely *containing* a dot as missing: `"Saving..."`, and every sentence
   ending in one. The first version of the check did that and claimed 125.

2. **The key in the source is not the key at runtime.** `T_CALL` captures raw
   source text, so `t('We\'ve sent…')` yielded a key with the backslash still
   in it, matching nothing in `common.json` and reporting three perfectly good
   translations as missing. Fixed with `unescapeLiteral()`. This is what put the
   count at 62/28 when the original hand audit had said 59/25 — the hand audit
   was right.

The check is mutation-tested: deleting a translated key, fabricating a
*genuinely* missing escaped-quote key, and introducing a conflicting duplicate
are each caught. That third one still exits non-zero; unresolved keys remain
warnings.

**Adjacent, deliberately not done** — page `<title>` tags are outside the `t()`
system entirely, so a Chinese user gets an English browser tab. Two of them also
read `Personal Finance App` rather than `MindGo`
([pages/transactions/new.tsx](frontend/pages/transactions/new.tsx),
[pages/transactions/edit/[id].tsx](frontend/pages/transactions/edit/[id].tsx)).
Worth a follow-up; it is a different change from this one.

A `Data Retention Settings` / `Save to Blockchain` card in
[pages/settings.tsx](frontend/pages/settings.tsx) is hardcoded English, but it
sits inside a `{/* … */}` JSX comment and never renders. Dead UI, not an i18n
gap — see item 13.

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

**Status:** open — **decisions B and C**
**Found:** by the linter

Marked with `eslint-disable` and a comment rather than deleted, because "remove
it" and "wire it up" are both defensible and the choice is not mine:

1. **`DISPOSABLE_EMAIL_DOMAINS`** ([controllers/authController.js](backend/controllers/authController.js)) —
   ~30 throwaway-mail domains, superseded by the MailboxLayer API call.
2. **`createSampleDataForNewUser`** (same file) — never called, so new accounts
   get no starter data. Removed feature, or lost wiring?
3. **`createAsciiPieChart`** ([services/emailService.js](backend/services/emailService.js)) —
   the weekly report is assembled without it.

All three are still present and still unreferenced.

### The live bug entangled with the first one

`validateEmailMailboxLayer()` throws at **line 32** when
`MAILBOXLAYER_API_KEY` is absent:

```js
const apiKey = config.apiKeys.mailboxLayer;
if (!apiKey) {
  throw new Error('MailboxLayer API key not set');   // line 32
}
const url = `...`;
try {                                                 // line 35 — the try opens HERE
```

The `throw` is **outside** the function's own `try`. It escapes to `register`'s
catch at **line 138**, which returns `res.status(500).json({ error: 'Server
error' })`. So **`/auth/register` returns 500 for every caller** when the key is
unset — while `.env.example` and `config/validate.js` both describe the key as
optional.

Wiring the dead domain list in as the fallback would make it genuinely optional.
That is the case for "wire it up"; see decision C.

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

## 16. Registration writes verification tokens to the log

**Status:** ✅ DONE 2026-08-28 — **security**

`controllers/authController.js` logged the raw email-verification token twice on
the registration happy path (lines 108 and 125). Both were live. **Anyone who
could read the logs could verify an account they did not own**, for as long as
the token stayed valid — 30 minutes. On Render that is anyone with dashboard
access, plus whatever log aggregator is attached.

Both are gone. The line whose only content was the token was deleted; the other
now names the user id.

### The address logging, fixed in the same pass

Nine call sites in that file wrote a user's address to stdout, including one
that logged MailboxLayer's **entire API response** for every registration
attempt. The rule now followed, and written down in `CLAUDE.md`:

> log a user id where one exists, and a masked address only where one does not

`utils/privacy.js` provides `maskEmail()` — `j***@example.com`. It keeps the
domain, which is the part carrying diagnostic value (MX failures,
provider-specific bounces) and is not identifying for the mail hosts nearly
everyone uses. It uses a fixed number of stars rather than one per character,
because the local part's length is a free distinguisher to remove. It never
throws: it is called from inside logging statements, and a logging helper that
can throw turns a diagnostic line into an outage.

Also narrowed the two `console.error('Failed to send verification email',
emailError)` calls to the error's code or message. A nodemailer *connection*
failure carries no address — verified — but an SMTP-level rejection attaches
`envelope` and `rejected`, which do. That path is not reproducible without a
real SMTP server, so this is precautionary rather than a demonstrated leak.

### Verification

`test/privacy.test.js` (17 cases) and `test/registerLogging.test.js` (5 cases),
neither needing a database or network. The second runs the real `register`
handler with stubbed collaborators and asserts on everything it printed: no
token, no 64-hex string of any kind, no raw address, and — because silence is
not the goal — that the masked address and the user id *are* there.

Mutation-tested, four mutations, each caught: restoring the token log, logging
the raw address inside an object, making `maskEmail` a no-op, and restoring the
full MailboxLayer response dump.

**One of those mutations initially passed.** The harness rendered log arguments
with `String()`, so `console.log('...', { email })` became `[object Object]` and
an address logged inside an object was invisible to every assertion. The
harness now uses `util.inspect`. Worth recording because the test looked
thorough and proved nothing about that case — a guard against a leak has to see
the same bytes an operator would.

---

## 17. Retention deletions are silent in production

**Status:** open — **decision D**
**Effort:** small

Round 5 routed the cleanup jobs' row counts through `logger.info`, matching the
rest of `schedulerService`. `logger.info` is gated on
`config.logging.enableConsoleLogs`, which is `NODE_ENV === 'development'` — so
in production those counts print nowhere. The `console.log` they replaced always
printed.

Errors still always print, in every environment, so a *failing* cleanup is still
visible. What is lost is the record of a *successful* one: how many accounts and
AI plans the retention jobs deleted.

Related, and the reason this is worth deciding rather than patching: there is no
real level hierarchy in `utils/logger.js`. `config.logging.level` is consulted in
exactly one place — `debug()` at line 37, which needs `enabled` **and**
`level === 'debug'`. `info()` and `warn()` are gated on `enabled` alone and
ignore the level entirely; `error()` ignores both and always prints. So
`LOG_LEVEL` can only ever turn `debug` on, and only in development. See
decision D.

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
8. ~~Translate the 59 missing Chinese strings~~ — done (round 4, item 9)
9. ~~Push the scheduler's cleanup logic down out of the controllers~~ — done
   (round 5, item 8), which turned up three timer bugs and a second place user
   email addresses were being written to the log

10. ~~Stop logging verification tokens~~ — done (round 8, item 16), which also
    fixed nine address-logging sites and produced `utils/privacy.js`
11. **Next:** whichever of decisions **A**–**D** you have answered. C is worth
    answering early: registration is 500ing for anyone who deploys without a
    MailboxLayer key, and both `.env.example` and the startup check currently
    tell them the key is optional.

**Waiting on you, not on work:** decisions **A** (the `Savings` category, item
7), **B** and **C** (the dead symbols and the register 500, item 13), and **D**
(production visibility for the retention jobs, item 17). Each is written up
under [Decisions needed](#decisions-needed) with options and a recommendation.

**Worth a second pair of eyes:** the 59 Chinese strings in round 4 were written
to match the conventions already in `zh/common.json` — full-width `（）` around
Chinese, half-width ` ($)` for currency, `例如，` for "e.g.,", half-width `...`.
A native reader should still skim them; the check can prove a key *resolves*,
never that the wording is good.

Item 7 is cleanup rather than risk; do it when touching that code.
