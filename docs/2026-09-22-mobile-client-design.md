# Mobile client: sharing the backend, and getting it onto a phone

Status: design note, nothing built. Written 2026-09-22.

Two questions, answered in order:

1. If we build a mobile version, can it share the existing backend?
2. If we only want to *use* the existing frontend on a phone, what does that
   take and what does it cost?

The short answers are **yes, with four fixes** and **nothing — it already
works in a phone browser, and the App Store is optional**.

---

## Part 1 — Sharing the backend

The API is a stateless REST service with bearer-token auth. A second client is
a supported case rather than a retrofit. Four things assume the one client is a
desktop browser.

### Already portable

**Auth needs no change.** `config.jwt` ([backend/config/index.ts](../backend/config/index.ts)) issues a
7-day bearer token and `middleware/auth.ts` reads `Authorization: Bearer`,
setting `req.user.userId`. There is no cookie and no server session anywhere in
the backend — a grep for either finds only comments about Postgres sessions. A
mobile client swaps `localStorage` for Keychain/Keystore and nothing else about
auth changes.

**CORS does not apply to a native app.** Native HTTP clients (URLSession,
OkHttp, React Native `fetch`) send no `Origin` header, so `cors()` never blocks
them. It matters only for a webview wrapper — Capacitor sends
`capacitor://localhost` — and then `config.cors.origin` has to accept a list
instead of a single string. It cannot be widened to `*`, because
`credentials: true` is set alongside it.

**The API already refuses to make clients compute things.** `/summary/rolling`
echoes `periodLabel`, `termLabel`, `startDate` and `endDate`; `DATE` columns
arrive as plain `'2026-08-28'` strings via the `pg` type parser in
[backend/db/connection.ts](../backend/db/connection.ts); currency conversion happens server-side at read
time. This is the property that keeps a second client from reimplementing the
Waterloo term calendar slightly differently — the trap a second client would
otherwise fall into first.

### Needs work, worst first

#### 1. Rate limiting will lock out mobile users

`authLimiter` allows **5 requests per 15 minutes per IP** across `/login`,
`/register`, `/resend-verification` and `/test-email` combined; `apiLimiter`
allows 100 ([backend/middleware/rateLimiter.ts](../backend/middleware/rateLimiter.ts)).

`app.set('trust proxy', 1)` in [backend/app.ts](../backend/app.ts) correctly recovers the client
address from Render's proxy. On cellular, that address is the carrier's
CGNAT egress — shared by thousands of subscribers. A dozen users on the same
carrier would throttle each other, and the failure surfaces as "the app is
broken", not as rate limiting.

The fix already exists in the codebase. `importLimiter` keys on the user:

```ts
keyGenerator: (req) => `user:${req.user.userId}`,
```

Extending that to `apiLimiter` on authenticated routes is small. `authLimiter`
is the hard half, because it runs before auth and has no user id to key on; it
needs a raised IP ceiling plus per-email or per-device-id keying. Do not simply
raise the IP ceiling and stop — that is the limiter protecting credential
stuffing.

#### 2. Screenshot import does not port as-is

`POST /import/parse` does not accept an image. It accepts OCR lines with pixel
boxes ([backend/routes/import.ts](../backend/routes/import.ts)), because OCR runs in the browser and the
image deliberately never reaches the server. There is no `onnxruntime-web` on
native.

The endpoint is agnostic about *who* performed the OCR, which is the opening.
Apple Vision and ML Kit both emit text, a confidence and a bounding box, so a
native client maps their output into the same `{ text, conf, box }` shape,
keeps the privacy property intact, and skips the ~45 MB model download
entirely — platform OCR ships with the OS and is much faster than WASM.

The catch: `classify.ts` picks a layout using gap thresholds measured against
the one pinned model (spec §4,
[docs/superpowers/specs/2026-09-16-ocr-import-design.md](superpowers/specs/2026-09-16-ocr-import-design.md)). A different engine's
box geometry invalidates that tuning. Before trusting a native OCR path,
re-run `npm run benchmark -- --set private` against the new engine's output and
re-record fixtures with `npm run fixtures`.

Do **not** solve this by adding an image-upload endpoint. That discards the
design's central privacy property and moves OCR compute onto a server that is
currently free-tier.

#### 3. Verification email links point at the web app

[backend/services/emailService.ts](../backend/services/emailService.ts) builds
`${config.frontendUrl}/verify-email?token=...`. Someone who registers inside a
native app receives mail that opens a browser instead. Needs universal links
(iOS) / app links (Android), or a web redirect page that hands off to the app.

#### 4. No API versioning

Routes mount bare at `/auth`, `/transactions`, `/summary`, `/goals`,
`/investments`, `/ai`, `/import`. On web, a breaking response change is fixed by
a deploy. A shipped store build cannot be force-updated, and old installs keep
calling the old shape for months.

Decide before the first release: either a `/v1` prefix, or a written
additive-only policy for response shapes. This is cheap now and expensive later.

### Smaller: category list drift

The canonical category list is the exported `categories` object in
[frontend/pages/transactions/new.tsx](../frontend/pages/transactions/new.tsx), and the backend does not validate
against it. `backend/test/demoData.test.ts` pins the backend's seed copy by
parsing that file, but a mobile client becomes a third copy with nothing
pinning it. Serving the list from the backend is the cheap fix and is easier
before a second client hardcodes it.

---

## Part 2 — Getting it onto a phone

The goal here is narrower: use the frontend we already have, on a phone. There
is a ladder, and most people do not need to climb past the second rung.

### Rung 0 — it already works

`https://mind-go.vercel.app` opens in mobile Safari or Chrome today. The
codebase has ~158 Tailwind responsive utilities across `pages/` and
`components/`, so the layouts were built with small screens in mind.

Cost: nothing. Setup: nothing.

### Rung 1 — Add to Home Screen (PWA)

A web manifest plus icons makes the site installable: a home-screen icon, a
full-screen shell with no browser chrome, and its own app switcher entry. On
iOS this is Safari's Share → Add to Home Screen; on Android, Chrome's Install
prompt. No store, no review, no fee, no Mac, and updates ship the instant
Vercel deploys.

For MindGo this needs three small things:

1. **`frontend/public/manifest.json`** — name, short name, theme colour,
   `display: "standalone"`, and icon entries. There is no manifest today
   (`frontend/public/` holds only `locales`, `models`, `ort` and three images).
2. **Icons at 192px and 512px.** `MindGo.png` and `MindGo_dark.png` exist and
   can be resized; `logo_pure.jpg` is the current favicon.
3. **A viewport tag with `initial-scale=1`.** Next 14 injects only
   `<meta name="viewport" content="width=device-width"/>` — verified against
   the live deploy — and there is no `_document.tsx`. Adding
   `width=device-width, initial-scale=1` to the `<Head>` in
   [frontend/pages/_app.tsx](../frontend/pages/_app.tsx) prevents iOS Safari from
   picking its own scale.

One caveat specific to this app: **screenshot import is the risky part in a
mobile browser.** It downloads ~45 MB and runs ONNX Runtime under WASM,
single-threaded on purpose. Phone OCR speed is already an open unknown in
CLAUDE.md's known gaps; mobile Safari also enforces tighter per-tab memory
limits than desktop, and a tab that exceeds them is reloaded without warning.
Measure on a real device before relying on import from a phone. Everything else
in the app is ordinary CRUD over HTTPS and will behave.

### Rung 2 — a real app binary

Only needed for: App Store presence, push notifications, native OCR, or
offline-first behaviour. None of those are required to "play around with it on
a phone".

- **Capacitor** wraps the existing Next build in a webview. Cheapest path to a
  binary; keeps the browser OCR path working unchanged, and inherits its
  unknowns.
- **React Native / Expo** means writing the UI a second time, but unlocks
  platform OCR (see §2 above) and native performance.

Either way, backend items 1, 3 and 4 apply.

---

## Part 3 — Costs

### Distribution

| Path | Cost | Notes |
|---|---|---|
| Mobile web / PWA | **$0** | No store, no review, no Mac, no account. Updates deploy instantly. |
| Android sideload (APK) | **$0** | Build an APK, transfer it, allow install from unknown sources. No developer account required. |
| iOS on your own device, free signing | **$0** | Xcode personal team. Requires a Mac. The build **expires after 7 days** and must be re-signed and reinstalled; limited to a few apps at a time. Fine for a demo, painful as a habit. |
| Apple Developer Program | **$99 USD / year**, recurring | Required for TestFlight *and* for the App Store. There is no one-time option. |
| Google Play Console | **$25 USD once** | One-time registration fee, not annual. |

Notes on the store paths:

- **TestFlight needs the $99 membership.** It allows up to 100 internal testers
  with no review, and up to 10,000 external testers behind a lighter "beta app
  review". Builds expire after 90 days.
- **Google Play requires a closed test before a new personal developer account
  can publish to production** — a minimum number of testers running the app for
  14 continuous days. The exact threshold has been revised more than once;
  check the current Play Console policy rather than trusting a number quoted
  here.
- **Apple review for a finance app is stricter than average.** Expect to supply
  a privacy policy URL, complete the privacy nutrition labels, and provide
  working demo credentials. The last one is already solved: the seeded demo
  account (`john.doe@example.com`) exists for exactly this kind of purpose, and
  after migration `010` its password actually works.
- "Sign in with Apple" is **not** required here. That rule applies when an app
  offers third-party social login; MindGo has its own email/password flow only.

### Infrastructure — the one that actually bites

The Render service (`srv-d1im68ndiees739ucrog`) is on the **free** plan,
verified 2026-09-22. Free instances spin down after roughly 15 minutes of
inactivity, and the next request pays a cold start that can run close to a
minute while the Node process boots and reconnects to Neon.

On desktop, during active development, this is rarely noticed. On a phone —
opened once in the evening, after hours of idleness — the first screen is a
long spinner, every time. It reads as a broken app rather than a sleeping
server, and no amount of frontend work fixes it.

**Render Starter is $7 USD/month** and removes spin-down. If MindGo is going to
be opened casually from a phone, this is a better first $7 than anything on the
distribution table above.

Other running costs, unchanged by a mobile client:

- **Vercel** — Hobby is free and sufficient for this frontend.
- **Neon** — free tier; note that it also suspends idle compute, which compounds
  the Render cold start on the first request after a quiet period.
- **OpenAI** — pay-as-you-go, currently out of credit, so every `/ai` endpoint
  answers `503 ai_unavailable`. A mobile client would surface that the same way
  the web one does.

### Recommended spend

For "play with it on a phone": **$0 on distribution, $7/month on Render.**
Build the PWA manifest, keep using the URL, and skip the stores until there is
a reason to be in them.

---

## Suggested sequence

1. Add `manifest.json`, two icon sizes, and `initial-scale=1`. Install it to a
   home screen and use it for a week.
2. Decide on Render Starter based on whether cold starts actually annoy you.
3. Measure screenshot import on a real phone. That single number decides
   whether a native app is worth building at all.
4. Only if a store build is wanted: fix rate-limiter keying (§1) and pick a
   versioning policy (§4) *before* the first binary ships, because both are
   much harder once installs exist in the wild.
