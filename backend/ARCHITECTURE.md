# MindGo Backend — Architecture & Design Patterns

The backend is a **layered MVC-style Express REST API**. It follows a
`route → middleware → controller → service → database` layering. There is **no
traditional Observer pattern** — the closest thing is a time-driven scheduler.

## Request flow

```
Client (frontend / axios)
        │  HTTP  (Authorization: Bearer <JWT>)
        ▼
┌─────────────────────────────────────────────────────────────┐
│  app.ts — global middleware chain                            │
│  helmet → morgan → cors → express.json()                     │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│  routes/*.ts   (URL → handler mapping)                       │
│    router.use(auth)              ← auth middleware           │
│    body([...]) validators        ← express-validator        │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│  middleware/                                                 │
│    auth.ts       verifies JWT, sets req.user.userId          │
│    rateLimiter.ts  authLimiter, per-route on 4 /auth routes  │
│                    aiLimiter, on the /ai router              │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│  controllers/*.ts   (the "C")                                │
│    - checks validationResult(req)                            │
│    - reads req.user.userId                                   │
│    - orchestrates services + DB                              │
└─────────────────────────────────────────────────────────────┘
        │                              │
        ▼                              ▼
┌───────────────────────┐   ┌─────────────────────────────────┐
│ services/*.ts         │   │ db/connection.ts                │
│  email, exchangeRate, │   │  query(text, params)            │
│  finnhub, freeStock,  │   │  lazy pool, auto-close after    │
│  aiPlanner, cleanup   │   │  5 min idle                     │
└───────────────────────┘   └─────────────────────────────────┘
        │                              │
        ▼                              ▼
   External APIs                   PostgreSQL
   (Finnhub, Yahoo,                (users, transactions,
    Alpha Vantage,                  savings_goals, watchlist,
    OpenAI, SMTP)                   ai_plans)
        ▲
        │  cron / setInterval (out-of-band, not request-driven)
┌─────────────────────────────────────────────────────────────┐
│  services/schedulerService.ts  (Singleton)                   │
│    weekly report emails + cleanup jobs                       │
└─────────────────────────────────────────────────────────────┘
        │  calls down into  →  services/cleanupService.ts
```

The global middleware runs in the order drawn, but two things sit outside it:
`app.set('trust proxy', 1)` comes first — the rate limiters read
`X-Forwarded-For`, and Render terminates TLS in front of the app — and
`apiLimiter` is mounted globally *before* the routers, not after them.

## Response / error flow

- Controllers return JSON directly.
- A **global error handler** and **404 handler** are mounted last in `app.ts`.
- On the frontend, `utils/api.ts` interceptors handle `401` (logout) and
  `403/404/500` (SweetAlert dialog) globally.

## Patterns in use

| Pattern | Where | Notes |
|---|---|---|
| **Layered MVC** | `routes/` → `controllers/` → `services/` → `db/` | Primary organizing pattern. No `View` (JSON API); the frontend is the view. |
| **Chain of Responsibility** | Express middleware pipeline | `helmet → cors → json → auth → validation → controller → error handler`. |
| **Strategy + fallback** | Stock data | `finnhubService → freeStockDataService → Alpha Vantage`, interchangeable sources with graceful degradation. |
| **Singleton** | `schedulerService` (single class instance holding a `jobs` Map of `{ job, kind }`); lazy DB pool | One shared instance each. `kind` is `'cron'` or `'interval'` — it is what tells `stop()` which API it is holding, since the two job types share no methods. |
| **Scheduler / publish-on-timer** | `schedulerService` (`node-cron` + `setInterval`) | Time-driven, **not** Observer. |

## Is there an Observer pattern?

**No.** A true Observer has objects *subscribing* to a subject and being
*notified on its state changes*. This codebase has nothing like that. The
scheduler reacts to **time events**, not to state changes in another object —
that's the Scheduler pattern. (Node's underlying `EventEmitter` is
observer-based, but no custom emitters/listeners are defined here.)

## Where the layering leaks

These are minor and common in Express apps, but worth noting:

1. **No `models/` layer.** SQL lives directly in controllers — e.g.
   `transactionController.ts` calls `db.query(...)` 10 times. The "Model" is
   thin/absent, so it's really **Route–Controller–Repository**, not full MVC
   with an ORM. Business + data-access concerns are mixed in the controller.

2. **Every controller imports services** (all 6 do), which is fine — but
   combined with (1), the controller ends up doing both orchestration *and*
   raw persistence.

### Resolved

- **Service imported controllers (inverted dependency).** `schedulerService.ts`
  used to `require` `authController` and `aiController` in order to call
  `autoDeleteOldAIPlans` and `deleteUnverifiedAccounts`. Both now live in
  [services/cleanupService.ts](services/cleanupService.ts), and the scheduler
  depends downward.

  An earlier draft of this document said that cleanup logic was *"reused by
  both HTTP routes and the scheduler"*. That was wrong — no route ever mounted
  either function; they took no `(req, res)` and never sent a response. The fix
  was a move, not a split; three timer bugs were found alongside it.

- **Address validation lived in the controller.** `authController` held a
  30-domain disposable list, an apilayer client and the verdict logic, ~60
  lines above the controller object. All of it is
  [services/emailValidationService.ts](services/emailValidationService.ts) now;
  the controller makes one call, `validateEmail(email)`.

  Worth noting as a **strategy/fallback** instance, the same shape the stock
  services use: MailboxLayer is the primary, the domain list is the fallback,
  and the caller sees one function and one result shape (`{ valid, reason?,
  source }`). The rule it encodes — **a validator that cannot reach its service
  must not become a gate** — matters because the previous version turned a
  missing key, an outage, an expired key and an exhausted quota all into a
  blocked registration, three of them silently.

## Bottom line

- **Yes to MVC** — clean, idiomatic Express layering.
- **No traditional Observer** — the scheduler is time-driven.
- Supporting patterns: **middleware chain**, **strategy/fallback**, **singleton**.
- Main structural smell remaining: the absent model layer. The scheduler's
  upward dependency on controllers is fixed.
