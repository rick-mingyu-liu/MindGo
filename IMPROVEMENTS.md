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
| 7 | Orphan `Savings` category | ✅ done — round 9 |
| 8 | Scheduler depends upward on controllers | ✅ done — round 5 |
| 9 | 59 Chinese strings missing entirely | ✅ done — round 4 |
| 10 | Environment variables are undocumented | ✅ done — round 2 |
| 11 | `package-lock.json` drifted from `package.json` | ✅ fixed in passing — PR #12 |
| 12 | AI plans ignored the user's finances | ✅ fixed in passing — round 2 |
| 13 | Three dead top-level symbols, and a 500 on register | ✅ done — rounds 10 and 11 |
| 14 | `/auth/verify-email` leaks another user's email | ✅ done — round 2 |
| 15 | Two services crashed the whole app at boot without an optional key | ✅ done — round 3 |
| 16 | Registration writes verification tokens to the log | ✅ done — round 8 |
| 17 | Retention deletions are silent in production | ✅ done — round 12 |
| 18 | Nothing keeps `db/seed.sql` and the category list in step | open |
| 19 | `utils/logger.js` has no real level hierarchy | open |
| 20 | The 4-month window is a term, and the feature around it is unfinished | open — design decided |
| 21 | `/summary/rolling` returns every transaction, twice | open |
| 22 | No yearly view, and no way to pick a period | open |

---

## Decisions needed

**All four are answered** — A, B, C and D. Each write-up is kept below with the
decision recorded against it, because the reasoning is the part worth having
later; the work is in the item each one points to.

Two items are open but need no decision from you: **18** (nothing keeps the
seed file and the category list in step) and **19** (the logger has no real
level hierarchy).

### A. The `Savings` category — item 7 — ✅ ANSWERED 2026-08-29

**Decision: promote it**, the recommended option. `Savings` is now a real
expense category rather than a value only the seed file knew about. The work is
in item 7; nothing here is still open.

### B. The three dead symbols — item 13 — ✅ ANSWERED 2026-08-29

**Decision: delete all three.** The recommendation was to delete
`createAsciiPieChart`, decide `createSampleDataForNewUser` on product grounds,
and leave `DISPOSABLE_EMAIL_DOMAINS` to C. C wired the domain list up, and the
product question turned out to have an answer in the history rather than
needing one — see item 13. Nothing here is still open.

### C. Should registration work without `MAILBOXLAYER_API_KEY`? — item 13 — ✅ ANSWERED 2026-08-29

**Decision: fall back to the domain list**, the recommended option. Registration
works without the key, with weaker filtering rather than none, and "optional" is
now true in the code as well as in the docs. The work is in item 13; nothing
here is still open.

### D. Should retention deletions be visible in production? — item 17 — ✅ ANSWERED 2026-08-29

**Decision: add an always-printing level**, the recommended option —
`logger.audit`. The third option, a real level hierarchy for `utils/logger.js`,
was explicitly the bigger job and is now item 19; it did not need to block this.
The work is in item 17.

---|---|
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
now removed. Three dead top-level symbols were marked rather than deleted at
the time; all three are resolved as of round 11 — see item 13.

Both lint scripts run in CI as of item 5, so nothing runs unattended any more.

---

## 7. Orphan `Savings` category

**Status:** ✅ DONE 2026-08-29 — decision A answered: promoted

`Savings` is a real expense category now. Four edits, all frontend:

- added to `categories.expense` in
  [frontend/pages/transactions/new.tsx](frontend/pages/transactions/new.tsx) —
  the canonical list, which the edit page and the dashboard both import;
- given a colour in `CATEGORY_COLORS` in
  [frontend/pages/index.tsx](frontend/pages/index.tsx);
- translated in both locale files (`储蓄`), because the picker renders
  categories through `t(category)`.

**What was actually wrong.** Not orphaned user data. All four rows are verbatim
`db/seed.sql` lines 51–54: `500.00`, `Emergency Fund Contribution`, the 25th of
March–June 2025, all owned by user 1 — the demo account. No real user ever
chose `Savings`, because the UI never offered it. The defect was **`db/seed.sql`
disagreeing with the category list**, which is why editing the rows would not
have fixed it.

**Verified against the live database after the change.** Every category that
appears in `transactions` is now in the canonical list, with the matching type:

```
Business 3 | Dining Out 22 | Education 20 | Entertainment 110 | Freelance 26
Groceries 34 | Healthcare 11 | Housing 17 | Investment Returns 9
Other Expenses 5 | Other Income 1 | Salary 17 | Savings 4 | Shopping 27
Transportation 60 | Travel 2 | Utilities 29
```

`Savings` was the only mismatch, and its 4 rows belong to user 1 alone. `Tax
Refund` and `Investment` are offered but unused — the list is a superset of what
exists, which is the harmless direction.

**Two things this fixed that were easy to miss:**

- The dashboard was classifying `Savings` as an expense only by falling through
  to a default in `getCategoryChartData`
  ([frontend/pages/index.tsx](frontend/pages/index.tsx)) — the right answer with
  no reasoning behind it, and the wrong one for any unlisted *income* category
  someone adds later. It is explicit now.
- Its colour came from `getCategoryColor`'s name hash: stable, but arbitrary,
  and free to land next to a real category's. It is `#64748b` now, picked from
  slate — the one hue family none of the other seventeen occupy.

**What this does not fix:** nothing enforces the agreement. See item 18.

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

**Status:** ✅ DONE 2026-08-29 — the 500 in round 10 (decision C), the symbols
in round 11 (decision B)
**Found:** by the linter

### The 500 — fixed

`validateEmailMailboxLayer()` threw at line 32 when `MAILBOXLAYER_API_KEY` was
absent, and the `throw` sat **outside** the function's own `try` (which opened
at line 35). It escaped to `register`'s catch and became
`res.status(500).json({ error: 'Server error' })`, so **`/auth/register`
returned 500 for every caller** — while `.env.example` and `config/validate.js`
both called the key optional.

It now falls back to the disposable-domain list, in a new
[services/emailValidationService.js](backend/services/emailValidationService.js).
The controller keeps one call, `validateEmail(email)`, which never throws.

**The fix covers three more paths that produced the same outcome**, and this is
the part worth reading. A missing key was the loudest way to make validation a
gate, not the only one:

| Situation | What it used to do | What it does now |
|---|---|---|
| No key | threw → **500 for everyone** | domain list |
| apilayer unreachable / HTTP error | old `catch` returned `{ valid: false }` → **every address rejected** | domain list |
| Expired key or exhausted quota | 200 with `success: false` and no `format_valid`, read as falsy → **"Invalid email format"** on a perfectly good address | domain list |
| Any unrecognised response shape | same as above | domain list |

The third is the nastiest: a *wrong* answer rather than a missing one, blaming
the user for the service's problem. That is why `isUsableResponse()` requires
`format_valid` to be a boolean rather than just checking the HTTP status —
apilayer reports its own errors with HTTP 200.

The rule the module is built on: **a validator that cannot reach its service
must not become a gate.** Filtering degrades from "deliverability plus a large
disposable database" to "30 known disposable domains" — weaker, but a real
check, and every fallback prints via `console.error`/`console.warn` so it is
visible in production, where it means registrations are being waved through on
the weaker check.

Also fixed in passing: the domain list was a 40-element array containing 30
distinct domains — `tmpmail.net` and three neighbours appeared three times
each. It is a sorted `Set` now, so a repeat shows up in a diff.

### The three symbols — all resolved

`DISPOSABLE_EMAIL_DOMAINS` was settled by decision C: it is the fallback now,
and lives in `services/emailValidationService.js`. The other two are **deleted**
(round 11, 134 lines), and the last `eslint-disable` in the backend went with
them.

Both were written up as judgement calls — "removed feature or lost wiring?" —
and **both turned out to have an answer in the git history**, which is worth
recording because the question was posed as if it needed a product decision:

- **`createSampleDataForNewUser`** (108 lines, `authController.js`) seeded a new
  account with eight sample transactions, an Emergency Fund goal and three
  watchlist stocks. It was **deliberately unwired**: commit `6746ca1`,
  2025-07-03, *"clear the mock data implementation"*, deleting exactly the three
  lines that called it and leaving the body behind. Not lost wiring — a removed
  feature, removed on purpose, by the repo owner. Nothing to decide.

  Worth knowing if it is ever wanted back: it inserted `'Sample Salary
  Payment'`-style rows straight into `transactions` with no flag marking them
  synthetic, so they would have been indistinguishable from real entries in
  every total, chart and AI plan. Reviving it should not mean reviving that.

- **`createAsciiPieChart`** (26 lines, `emailService.js`) was **never called in
  any revision** — checked by walking every commit that touched the file; it
  appears exactly once per revision, as its own definition. Born dead in
  `e2a4761`, "email sending service with formatted email". The weekly report has
  always been HTML, where a `█`-bar chart in a monospace block would have been
  the wrong medium anyway.

Verified after deleting: lint clean (the disables went with the code they were
suppressing), 79 tests still green, and `generateWeeklyReport` still returns its
`{ text, html }` pair — exercised directly with `db.query` stubbed, since no
test covers it.

### How it was verified

- 23 new tests in [test/emailValidation.test.js](backend/test/emailValidation.test.js),
  one per row of the table above plus the MailboxLayer verdict paths. Suite:
  55 → **79**, green with and without every optional key.
- Four mutations, each caught: making the no-key path a gate (4 failures),
  restoring the old rejecting `catch` (2), removing the usable-response check
  (2), and turning the domain list into a waiver (5).
- The characterisation test in `registerLogging.test.js` that pinned the 500
  now asserts a 201, plus a second test that the fallback path leaks no token
  or raw address either — it prints different lines from the MailboxLayer path.
- `configValidate.test.js` pinned the old warning text ("registration fails
  outright"). It now pins the new text **and** asserts the old wording is gone;
  a startup warning describing behaviour the code no longer has is worse than
  none.
- Real boot on port 3099, `NODE_ENV=production`, key removed, database pointed
  at a dead socket: `someone@mailinator.com` → **400** "Disposable email
  addresses are not allowed" `(domain-list)`; `john.doe@example.com` → past
  validation and into the database, failing with `ECONNREFUSED` rather than at
  the validator. The one-per-process "no key" warning printed exactly once
  across both requests.

  Note for anyone repeating this: `env -u MAILBOXLAYER_API_KEY` does **not**
  remove the key, because `.env` puts it back. `MAILBOXLAYER_API_KEY=` does —
  dotenv will not overwrite a variable already present in the environment.

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
an address logged inside an object was invisible to every assertion — the shape
half the call sites used. The harness now uses `util.inspect`. Worth recording
because the test looked thorough and proved nothing about that case: a guard
against a leak has to see the same bytes an operator would.

**And CI caught a second problem with it — item 13, demonstrating itself.** The
suite was green locally and red in CI, because `validateEmailMailboxLayer()`
throws before it reaches any of the code under test when `MAILBOXLAYER_API_KEY`
is unset. It passed locally only because a developer `.env` happened to have a
key; CI sets none, so `register` returned 500 and never generated a token. The
test now sets the key on `config` itself and the HTTP call stays mocked, so it
no longer depends on the environment — verified by running it with the key
blanked.

That failure was the strongest argument for **decision C**: the missing key did
not merely break registration in production, it silently changed what a test of
unrelated code was exercising. Round 10 answered C, so the characterisation
test that pinned the 500 now asserts a 201, and a second test covers the
fallback path's own log lines.

---

## 17. Retention deletions are silent in production

**Status:** ✅ DONE 2026-08-29 — decision D answered: an always-printing level

Round 5 routed the cleanup jobs' row counts through `logger.info`, matching the
rest of `schedulerService`. `logger.info` is gated on
`config.logging.enableConsoleLogs`, which is `NODE_ENV === 'development'`, so in
production those counts printed nowhere — while the `console.log` they replaced
always had. Errors always print, so a *failing* cleanup stayed visible; what was
lost was the record of a *successful* one.

`logger.audit(message, data)` now exists in
[utils/logger.js](backend/utils/logger.js) and prints in every environment. It
is documented as being for events that **destroy or irreversibly change user
data** — an audit level that fills up with routine chatter stops being one.

**Two judgement calls inside the implementation**, both worth disagreeing with
if you see it differently:

- **Only a non-zero deletion is audited.** The two intervals fire **432 times a
  day** between them (`aiPlanCleanup` every 5 minutes, `unverifiedAccountCleanup`
  every 10) and almost always delete nothing. Auditing the zeros would bury the
  lines that matter under ~13k rows a month. A zero-row run still logs through
  `logger.info`, so development output is unchanged.
- **Scheduling the jobs is itself audited**, one line at boot naming both jobs
  and their intervals. This is the cost of the first decision: with zero-row
  runs silent, a production log containing no deletion lines is otherwise
  ambiguous between "nothing needed deleting" and "the jobs were never
  mounted". One line at startup separates those.

**Fixed in passing:** `scheduleWeeklyReports` logged `Weekly report sent to
${user.email}` and the matching failure line, two raw addresses that round 8's
sweep of item 16 missed because it only covered `authController`. The `SELECT`
above them already fetches `id`, so both now name the user id — the rule from
item 16, applied where it had not been.

### How it was verified

- 8 new tests in [test/logger.test.js](backend/test/logger.test.js), the first
  tests this file has had: `audit` and `error` print with `enabled` false,
  `info`/`warn`/`debug` stay silent, and the audit line carries an ISO timestamp
  and an optional payload.
- 4 new tests in `schedulerService.test.js`: a real deletion is audited, a
  zero-row run is not, the scheduling line is audited, and — the one that
  matters — the count **reaches `console.log` with `logger.enabled` false**,
  asserted through the real logger rather than a mock of it. Suite: 79 → **91**.
- One existing test broke and was retargeted rather than deleted: it asserted
  the count arrived via `logger.info`. It now captures both channels and still
  pins what it was really for — that the number logged is the number the task
  returned.
- Four mutations, each caught: gating `audit` on `enabled` (5 failures),
  auditing every run including zeros (1), putting the count back on `info` (2),
  and putting the boot line back on `info` (1).
- A real run under `NODE_ENV=production` with `enableConsoleLogs` confirmed
  `false`: a 4-row deletion printed `[AUDIT]`, a 0-row run printed nothing, and
  a throwing task still printed `[ERROR]` with its stack.

---

## 18. Nothing keeps `db/seed.sql` and the category list in step

**Status:** open
**Effort:** small

Item 7 existed for months because the seed file used a category the UI did not
offer, and nothing anywhere noticed. Fixing it removed the disagreement; it did
not remove the way the disagreement happened.

The two halves live in different npm projects. The category list is
`categories` in
[frontend/pages/transactions/new.tsx](frontend/pages/transactions/new.tsx); the
seed rows are [backend/db/seed.sql](backend/db/seed.sql). Backend CI never reads
the frontend, frontend CI never reads the backend, and the backend does not
validate `category` against any list either — `routes/transactions.js:15` only
requires it to be non-empty. So a new seed category, or a renamed frontend one,
drifts silently again.

Options, cheapest first:

| Option | Consequence |
|---|---|
| **A script in the frontend, run by `check:locales`'s job** | Parse the category names out of `../backend/db/seed.sql` and assert each is in `categories` with the right type. Cheap, and CI already runs frontend scripts. Reaches across the project boundary with a relative path, which is ugly but honest — the coupling is real. |
| **Move the category list to a shared JSON file** both projects read | Removes the parsing. Costs a new shared location the repo does not currently have, and a build step for the frontend to import it. |
| **Validate `category` server-side** against the list | Fixes more than drift — it also stops a client sending an arbitrary category. But it puts the list in the backend, so the frontend then has to derive from *it*, which is the same coupling pointed the other way. |

No recommendation yet; the third is the most valuable and the most work, and it
is worth deciding alongside whether categories should ever be user-defined.

---

## 19. `utils/logger.js` has no real level hierarchy

**Status:** open
**Effort:** small, but it touches every logging call site

The third option under decision D, deferred rather than rejected — it was the
general fix, and `logger.audit` did not need to wait for it.

`config.logging.level` (`LOG_LEVEL`, default `'info'`) is consulted in **exactly
one place**: `debug()`, which needs `enabled` *and* `level === 'debug'`. `info()`
and `warn()` are gated on `enabled` alone and ignore the level entirely;
`error()` and now `audit()` ignore both and always print. So `LOG_LEVEL` can
only ever turn `debug` on, and only in development — setting it to `'warn'` or
`'error'` in production does nothing at all, which is not what anyone reading
`.env.example` would expect.

`enabled` is also a constructor snapshot of `NODE_ENV === 'development'`, so the
real switch is the environment, not the level. Two knobs, one of which is
inert.

A hierarchy would mean ranking the levels, comparing against `level` in one
place, and deciding where `audit` sits — probably outside the ranking entirely,
since "always print" is its whole purpose.

Not urgent: nothing is broken, and the two things that must be visible in
production (errors and deletions) are. It is a trap for whoever next assumes
`LOG_LEVEL` works.

---

## 20. The 4-month window is a term, and the feature around it is unfinished

**Status:** open — **design decided 2026-08-29**, not yet built
**Effort:** small for the defect, medium for the feature
**Found:** by asking whether the 4-month window deletes anything

### First, the correction

An earlier draft of this item recommended **deleting** the auto-delete endpoint
as an unfinished feature nobody wanted. That was wrong, and wrong in an
instructive way: I read "no caller" as "no intent". The 4-month figure is not
arbitrary — **it is a Waterloo term.** Study terms and co-op terms are both four
months, and budgeting across one co-op term is the thing this app is for. The
feature has a motivation; it is the implementation that is unfinished.

### The window does not delete anything, and that part is fine

`/summary/rolling?months=4` is a `WHERE` clause on a `SELECT`. Checked against
the live database: **282 of 397 transactions are older than four months and
still present**, the oldest dated 2025-03-01. The scheduler's only two jobs
touch `ai_plans` and `users`, never `transactions`.

### Finding 1 — a *rolling* four months is not a *term*

This is the substantive bug, and it is in the feature that works, not the one
that is missing. `getRollingSummary` counts back four months from *today*, so
the window equals the term **only in the last month of each term**:

| Viewing in | Window covers | Term | |
|---|---|---|---|
| Jan | Oct, Nov, Dec, Jan | Winter (Jan–Apr) | straddles |
| Feb | Nov, Dec, Jan, Feb | Winter | straddles |
| Mar | Dec, Jan, Feb, Mar | Winter | straddles |
| **Apr** | **Jan, Feb, Mar, Apr** | **Winter** | **= the term** |
| May | Feb, Mar, Apr, May | Spring (May–Aug) | straddles |
| … | | | |
| **Aug** | **May, Jun, Jul, Aug** | **Spring** | **= the term** |
| **Dec** | **Sep, Oct, Nov, Dec** | **Fall** | **= the term** |

Three months out of twelve — and precisely when the term is already over. In
the **first** month of a co-op term, which is when someone actually sets a
budget, three quarters of the window is the previous term's money: a student
starting co-op in May sees February–April, most of it a school term with
different income and different spending.

Fixing this does not need new storage. It needs the window to snap to term
boundaries (Jan–Apr, May–Aug, Sep–Dec) instead of counting back from today —
the same `WHERE date >= $2 AND date < $3` query with different endpoints, plus
a way to pick *which* term. That is the feature the 4-month number was reaching
for.

### Finding 2 — deleting old data is the wrong lever for the scaling worry

The concern behind the sliding window was memory: more users, more rows, the
app falls over. Measured rather than assumed, on the live database:

| | |
|---|---|
| 397 transactions | **128 kB** total (48 kB heap + 80 kB indexes) |
| per row, including indexes | **~330 bytes** (124 B heap; the rest is index and page overhead that amortises) |
| whole database, 12 users | 7.8 MB, most of it Postgres catalogue |

Extrapolating at a generous 1,000 transactions per user per year:

| Scale | Rows | Storage |
|---|---|---|
| 1,000 users × 4 years | 4M | **~1.3 GB** |
| 10,000 users × 4 years | 40M | **~13 GB** |

40M rows in one Postgres table is unremarkable, and the index this app needs
already exists — `idx_transactions_user_date` on
`(user_id, date DESC, created_at DESC)` (migration 006). Every summary query is
`WHERE user_id = $1 AND date >= … AND date <  …`, which that index answers as a
range scan over one user's rows. **How many other users exist does not affect
it.** Storage becomes a bill before it becomes a crash, and a bill is answered
by archiving to a summary table, not by destroying the data.

There is also a product cost to deleting: term-over-term comparison — *this
co-op term versus last year's* — is exactly what this audience wants, and it is
impossible if the data is gone.

### Finding 3 — the endpoint that exists is a footgun

`DELETE /transactions/auto-delete` is mounted (`routes/transactions.js:26`) and
runs `DELETE FROM transactions WHERE user_id = $1 AND date < $2`. Nothing calls
it — not the scheduler, not the frontend, not its own origin commit `0bfc252`.
Its `months` parameter is unvalidated; verified by running the arithmetic:

| `?months=` | cutoff | effect |
|---|---|---|
| `4` / absent | 4 months back | intended |
| `0` | **today** | deletes every transaction before today |
| `-6` | **6 months ahead** | deletes everything, future-dated rows included |
| `abc`, empty, huge | — | `toISOString()` throws → 500 |

The empty case looks safe and is not: `const { months = 4 }` defaults only on
`undefined`, so `?months=` is `''`.

Scoped to the caller's own `user_id` and requires their JWT, so it is not a
cross-user risk — but it is a live, irreversible, unvalidated delete that no
part of the product exposes.

**And `months` means two opposite things in this API.** Three endpoints take it:

| Endpoint | `months` means |
|---|---|
| `GET /summary/rolling` | show me the last N months |
| `GET /summary/trends` | show me the last N months |
| `DELETE /transactions/auto-delete` | **destroy everything older than N months** |

Same name, same type, same default of 4 — and one of them is irreversible. That
is worth fixing beyond validation; see below.

#### What "validate `months`" actually means

Nothing to do with the term design. It is one line in the route file, in the
style the project already uses for bodies — `routes/transactions.js` has
`transactionValidation` as a `body([...])` array, and **no route in the backend
validates a query parameter at all** today:

```js
const autoDeleteValidation = [
  query('months').optional().isInt({ min: 1, max: 60 })
    .withMessage('months must be a whole number between 1 and 60'),
];
router.delete('/auto-delete', autoDeleteValidation, transactionController.autoDeleteOldTransactions);
```

plus the `validationResult(req)` check at the top of the controller method, the
same as every other validated handler. The 1–60 bound is not invented — it is
the range `updateDataRetentionSettings` already enforces on the same concept
(Finding 4), so this makes the write path agree with the settings path.

**Better than validating it: stop taking a relative count.** For a destructive
call, `?before=2025-05-01` is safer than `?months=4` — there is no arithmetic to
get wrong, no `months=0` edge, no timezone question about when "four months ago"
starts, and the caller has to state exactly what will be destroyed. Once
retention is term-based (see below) the endpoint should take
`?keepTerms=6` or nothing at all, and the relative-month form can go.

### Finding 4 — the retention settings API reports persistence it does not do

`getDataRetentionSettings` returns a hardcoded
`{ autoDeleteEnabled: false, retentionMonths: 4, lastCleanup: null }`, and
`updateDataRetentionSettings` validates `retentionMonths` (1–60) then returns
`"updated successfully"` **without writing anything** — its own comment says
*"In a real app, you'd save these to a user_preferences table"*. `settings.tsx`
round-trips both fields but renders no control bound to them, so nothing lies to
a user today. It starts lying the moment someone adds the toggle.

### The design — decided 2026-08-29

Settled in conversation: **the window is a view concept and is not coupled to
deletion.** Data is kept for **2 years**, and the app grows a yearly view
alongside the term view. Three refinements came out of working through it.

**1. Retain by terms, not by months.** A rolling 24-month cutoff slices a term
in half. In April 2027, Winter 2025 (Jan–Apr 2025) is 27 months back, so January
and February fall off while March and April survive — and the chart shows a
Winter term with 60% of its real spending. A partial term in a comparison is
worse than a missing one. **Keep the last 6 complete terms; delete only whole
terms.** Same principle as the view fix: snap to the boundary.

**2. The justification is data hygiene, not scale.** At the measured ~330 bytes
per row, 10,000 users over 4 years is ~13 GB and over 2 years is ~6.5 GB —
halving a number that was never the problem (Finding 2). The real case is that
this is financial history, and holding less of it is a smaller breach surface.
That reason stands on its own and does not depend on a scaling claim the
measurements do not support.

**3. Archive to monthly totals before deleting, so the yearly view survives the
retention edge.** The charts need per-month, per-category totals and nothing
else — they do not read the transaction rows at all (item 21). So: **2 years of
rows, monthly aggregates kept indefinitely.**

Measured on the live database, aggregating at `(month, category, type)`:

| user | transactions | aggregate rows | ratio |
|---|---|---|---|
| 6 (heaviest) | 348 | 105 | 3.3× |
| 1 | 43 | 39 | 1.1× |

The ratio is not the point, and it is deliberately recorded here so nobody
oversells it later. **The point is that aggregate rows are bounded by
time × categories — roughly 180 per user-year, a hard ceiling — regardless of
how much a user logs.** Someone recording 500 transactions a month costs the
same in the summary table as someone recording 20. That decouples storage from
activity, which rolling deletion never does.

### How a term becomes a parameter

The question the design leaves open: if the view is "Spring 2026" rather than
"the last four months", what does the request look like?

**The server owns the term calendar.** This is the load-bearing decision, and
it is item 18's lesson in a new place: the *view* needs term boundaries and the
*retention job* needs the same boundaries to delete whole terms. If the frontend
computes them and the cleanup job computes them separately, they drift, and the
drift is silent until a chart and a deletion disagree about where Spring starts.
One module, two consumers:

```js
// backend/utils/terms.js — a Waterloo term is four months.
//   Winter Jan–Apr | Spring May–Aug | Fall Sep–Dec
termOf(date)            // Date        -> '2026-spring'
boundsOf('2026-spring') // term id     -> { start: '2026-05-01', end: '2026-09-01' }
currentTerm(now)        //             -> '2026-spring'
previousTerm(id)        // '2026-spring' -> '2026-winter'
lastNTerms(n, now)      // 6           -> ['2025-winter' … '2026-spring']
```

Bounds are **half-open** `[start, end)`, matching the query the summary
controller already runs (`date >= $2 AND date < $3`), which sidesteps
end-of-month and leap-day questions entirely.

**The API then takes a term id, not a month count:**

```
GET /summary/rolling?term=2026-spring
GET /summary/rolling?term=current      # alias, so the client needs no calendar
GET /summary/rolling?term=previous
```

and the response echoes what it resolved to:

```json
{ "term": "2026-spring", "label": "Spring 2026",
  "start": "2026-05-01", "end": "2026-09-01", … }
```

That echo is the part that keeps the frontend out of the calendar business: it
renders `label` on the chart and passes `term` back, never computing a date. It
also makes the response self-describing in a log or a bug report — `months=4`
tells you nothing about *which* four months a user was looking at, `2026-spring`
tells you exactly.

`?months=` stays for `/summary/trends` and for anything that genuinely wants a
rolling count; the two are different questions and can coexist. What changes is
that the **dashboard** stops asking for a rolling count it never wanted.

**And the retention job calls `lastNTerms(6)`** for its cutoff, which is what
makes "delete only whole terms" true by construction rather than by a comment.

Term ids sort by year then need a term order, so store a term index (0/1/2)
alongside the key if a sort ever matters — `'2026-fall' < '2026-spring' <
'2026-winter'` lexically, which is wrong three ways.

### Order of work

1. **Validate `months`** on the auto-delete endpoint (Finding 3). A defect fix,
   no decision, do it whenever.
2. **Make the term view term-aligned** (Finding 1). Needs no retention policy
   and fixes the bug that actually affects users today.
3. **Add the yearly view** — item 22.
4. **Fix `/summary/rolling`** — item 21. It has to land before a longer window
   is affordable.
5. **Make retention settings actually persist.** `updateDataRetentionSettings`
   validates its input and returns *"updated successfully"* while writing
   nothing (Finding 4). If a retention toggle ships on top of that, the user
   gets a switch that silently does not govern the deletion of their own
   financial records. **This is a prerequisite for any of the rest**, not a
   follow-up.
6. **Then the monthly summary table and the 6-term retention job**, in that
   order — the archive has to exist before the first deletion, or the first
   deletion is the one that loses data with no aggregate behind it.

**Still not recommended: deleting to save space.** Deleting for hygiene, with an
archive behind it and a real setting in front of it, is a different thing and is
what this design does.

---

## 21. `/summary/rolling` returns every transaction, twice

**Status:** open
**Effort:** medium
**Found:** while testing the scaling premise behind item 20

The real per-request cost, and the thing that will actually strain under load —
unlike total row count, which item 20 measures as a non-issue.

`getRollingSummary` ([controllers/summaryController.js](backend/controllers/summaryController.js))
does `SELECT *`, loads every row in the window into Node, converts each one, and
then puts the full list into the response **twice**: once as `transactions`, and
again inside each `monthlyBreakdown[].transactions`. All aggregation — totals,
per-category, per-month — happens in JavaScript over that array.

Measured from real rows (286 bytes per converted transaction as JSON, doubled):

| Window | Transactions | Response |
|---|---|---|
| 4 months, light user | 60 | ~34 kB |
| 4 months, heavy user | 200 | ~112 kB |
| 12 months, heavy | 600 | ~335 kB |
| 4 years, heavy | 2,400 | ~1.3 MB |

The dashboard uses the totals and the per-month figures. It does not need the
transaction list at all — `pages/transactions/index.tsx` fetches that
separately.

**Why this matters for item 20:** this cost is *per user, per request*. Deleting
other users' old data does nothing for it. A `SUM(...) GROUP BY` in SQL and
dropping the duplicated array would cut the response by an order of magnitude
and move the work to the database, which is what the existing
`(user_id, date)` index is for. That is the change that makes a longer window —
a year, or all of history — cheap.

---

## 22. No yearly view, and no way to pick a period

**Status:** open
**Effort:** small once item 21 lands
**Comes from:** the item 20 design

The dashboard offers exactly one period: whatever
`/summary/rolling?months=4` returns, with `4` hardcoded at
[frontend/pages/index.tsx](frontend/pages/index.tsx). The API already accepts
`?months=`, so the backend is most of the way there — what is missing is
term-aligned endpoints and a control.

The selector this needs, for an audience whose year is three four-month terms:

- **This term** — term-aligned, the default (item 20, Finding 1)
- **Last term** — the comparison that makes a co-op budget mean something
- **This year** — and *which* year is a real choice: calendar (Jan–Dec),
  academic (Sep–Aug), or rolling 12 months. Rolling 12 is the least surprising
  mid-term; academic matches how the audience already thinks. Worth deciding
  deliberately rather than defaulting to calendar because it is easiest.
- **All time** — cheap once the monthly summary table exists (item 20), since
  it reads aggregates rather than rows.

Blocked in practice on item 21: a yearly window at today's response shape is
~335 kB for a heavy user, and all-time is worse.

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
11. ~~Promote `Savings` to a real category~~ — done (round 9, item 7, decision
    A), which turned up that the dashboard was classifying it correctly only by
    accident, and produced item 18
12. ~~Make registration work without a MailboxLayer key~~ — done (round 10,
    item 13, decision C), which turned up three more ways validation became a
    gate — an outage, an expired key and an exhausted quota — and settled one
    of decision B's three symbols
13. ~~Delete the dead symbols~~ — done (round 11, item 13, decision B). Both
    questions had answers in the git history rather than needing a product
    call: one was deliberately unwired in `6746ca1`, the other was never called
    in any revision
14. ~~Make retention deletions visible in production~~ — done (round 12,
    item 17, decision D), which also caught two raw email addresses in the
    weekly-report logs that item 16's sweep had missed, and produced item 19

**All four original decisions — A, B, C and D — are answered and shipped.**
Three items remain:

- **18** — nothing keeps `db/seed.sql` and the frontend category list in step.
  Prevention, not a defect; worth doing before the next person adds a category.
  Needs no decision.
- **19** — `utils/logger.js` has no real level hierarchy, so `LOG_LEVEL` is
  inert except for `debug`. A trap rather than a bug. Needs no decision.
- **20** — the 4-month window is a **Waterloo term**, and the feature built
  around it is unfinished. The window rolls back from today, so it equals the
  term only in April, August and December — in the *first* month of a co-op
  term, when a budget actually gets set, three quarters of it is the previous
  term. Also holds a live, unvalidated, irreversible delete endpoint nothing
  calls. **Needs a product decision**; the `months` validation is a defect fix
  either way.
- **21** — `/summary/rolling` serialises every transaction in the window twice
  and aggregates in Node rather than SQL. This, not row count, is the real
  per-request cost — and it is per user, so deleting old data does not help it.
- **22** — no yearly view and no period selector; `months=4` is hardcoded in the
  dashboard. Comes out of the item 20 design.

Item 18 is the one with a repeat offence behind it; item 20 has the live
footgun and now carries a decided design; item 21 has to land before any longer
window is affordable, which makes it the gate on 22.

**Worth a second pair of eyes:** the 59 Chinese strings in round 4 were written
to match the conventions already in `zh/common.json` — full-width `（）` around
Chinese, half-width ` ($)` for currency, `例如，` for "e.g.,", half-width `...`.
A native reader should still skim them; the check can prove a key *resolves*,
never that the wording is good.
