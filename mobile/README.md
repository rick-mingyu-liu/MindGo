# MindGo mobile

A React Native client for the existing MindGo API, built with Expo (SDK 57) and
Expo Router. This is a deliberate first mobile project: four screens that
exercise every mobile fundamental once, against a backend that already works.

## Getting it onto your phone

```bash
cd mobile
npm install
npx expo start
```

Install **Expo Go** from the App Store or Play Store, then scan the QR code in
the terminal. That is the whole loop — no Xcode, no Apple Developer account, no
$99, no build step. Saving a file reloads the app on the phone.

Press `i` in the terminal for the iOS simulator instead, or `w` for the browser.

Sign in with the demo account, which the login screen pre-fills:

```
john.doe@example.com / password123
```

### The first request is slow, and that is not your code

The backend is on Render's free plan, which spins the service down after ~15
minutes of inactivity. The first request after a quiet spell pays a cold start —
**measured at 21 seconds on 2026-09-22**. The login screen says so, and the API
client's timeout is 60 s for this reason. Render Starter ($7/month) removes it.

## Pointing at a local backend

The app defaults to production (`https://mindgo.onrender.com`). To run against
your own machine, edit `API_URL` in [src/lib/config.ts](src/lib/config.ts).

**`localhost` will not work from a physical phone.** This is the single most
common first-day wall in mobile development: `localhost` on the phone means the
phone. Use your Mac's LAN address instead:

```bash
ipconfig getifaddr en0        # e.g. 192.168.1.42
```

then set `API_URL` to `http://192.168.1.42:3001`, with both devices on the same
Wi-Fi and the backend listening on `0.0.0.0` rather than `127.0.0.1`.

The simulators are different again: the iOS simulator shares the host's network
stack so `http://localhost:3001` works there, while an Android emulator needs
`http://10.0.2.2:3001`.

## Layout

```
src/
  app/                    every file here is a screen (Expo Router)
    _layout.tsx           root navigator + AuthProvider + safe area
    index.tsx             the gate: decides login vs. tabs on launch
    login.tsx             email + password
    (tabs)/
      _layout.tsx         tab navigator, and the signed-in guard
      index.tsx           dashboard — term summary and category totals
      transactions.tsx    paginated list, pull to refresh, infinite scroll
      add.tsx             new transaction form with a native date picker
  lib/                    everything that is not a screen
    api.ts                axios instance, async auth interceptor
    auth.tsx              session context, restore-on-launch, sign out
    storage.ts            keychain via expo-secure-store
    config.ts             API_URL and the localhost explanation
    date.ts               copied verbatim from frontend/lib/date.ts
    categories.ts         copied from the web app's canonical list
    format.ts             currency, and the amount-is-a-string trap
    theme.ts              one static palette
  types/api.ts            response shapes, captured from the live API
```

Expo Router uses file-based routing, the same idea as the web app's Pages
Router — which is why the structure should look familiar coming from `frontend/`.

## What actually differs from the web client

The parts worth reading, because they are where the platform forced a real
decision rather than a port:

- **Token storage** (`lib/storage.ts`). The web keeps the JWT in
  `localStorage`; there is no DOM here, so it goes in the iOS keychain or
  Android keystore. Reading it is **asynchronous**, which ripples: the request
  interceptor in `lib/api.ts` is an async function, and `AuthProvider` has a
  `loading` state because for the first frames after launch the app genuinely
  does not know whether anyone is signed in.
- **401 handling** (`lib/api.ts`). The web interceptor calls `logout()` and
  reaches for `window.location`. Here navigation belongs to the router, so the
  interceptor only publishes the event and `AuthProvider` subscribes.
- **`useFocusEffect` instead of `useEffect`** (the two tab screens). Tabs are
  not unmounted when you switch away, so a `useEffect` would fetch once and
  never again — a transaction added on the Add tab would not appear on the
  Dashboard until a full restart.
- **Keyboard handling** (`login.tsx`, `add.tsx`). `KeyboardAvoidingView` with
  an iOS-specific `behavior`. The web never has to think about the keyboard
  covering the submit button.
- **Safe areas** (`app/_layout.tsx`). Notches and home indicators eat content
  that is not wrapped.
- **Keyboard types** (`login.tsx`, `add.tsx`). `email-address` and
  `decimal-pad`, plus `autoCapitalize="none"` on the email field. These are the
  difference between a usable and an infuriating mobile form.

## What ported unchanged

- **`lib/date.ts`**, verbatim. It never touches the DOM and never builds a
  `Date` in order to name one. That matters more here than on the web, because
  a phone's timezone travels with the person holding it.
- **The axios interceptor pattern** from `frontend/utils/api.ts`.
- **Every label on the dashboard.** `periodLabel`, `termLabel`, `startDate` and
  `endDate` are computed by the server, which is what stops this client and the
  web one disagreeing about where a term begins.

## Two traps the types encode

- **`transaction.amount` is a string**, not a number — Postgres `NUMERIC` comes
  through `pg` as a string so no precision is lost. `"105.44" + 2` is
  `"105.442"`. Use `convertedAmount`, or `amountOf()` in `lib/format.ts`.
- **`summary.endDate` is exclusive.** Fall 2026 ends `2027-01-01`, which is not
  a day in the term. `formatDayRange()` accounts for it.

## Checks

```bash
npx tsc --noEmit     # typecheck
npx expo lint        # eslint
npx expo-doctor      # dependency and config health
```

All three pass as of 2026-09-22. There is no test runner here yet — the same
gap the web frontend has.

## Good next exercises

Roughly in order of how much new ground each covers:

1. **Dark mode.** `useColorScheme()` plus making `lib/theme.ts` reactive. The
   web app already has a ThemeContext to mirror.
2. **Edit and delete a transaction.** `PUT`/`DELETE /transactions/:id` already
   exist. Teaches dynamic routes (`[id].tsx`) and `useLocalSearchParams`.
3. **The period selector.** The dashboard is pinned to `term=current`; the API
   also takes `term=previous`, `year=`, and `months=` — but exactly one at a
   time, or it answers 400.
4. **Pull the category list from the server** instead of the copy in
   `lib/categories.ts`, which is now a third copy that nothing pins.
5. **Camera and OCR.** The big one: `expo-camera` plus Apple Vision or ML Kit
   feeding the existing `POST /import/parse`, which accepts OCR lines rather
   than an image and so does not care who produced them. Read
   [docs/2026-09-22-mobile-client-design.md](../docs/2026-09-22-mobile-client-design.md) first — the
   parser's layout thresholds were tuned against one specific OCR model, and a
   different engine's box geometry needs `eval/` re-run before the output can
   be trusted.
6. **A real build.** `eas build --profile development` when you need a native
   module Expo Go does not bundle, or TestFlight when you want it on someone
   else's phone. That is where the $99/year starts.

## Known limits

- New transactions are hardcoded to **CAD**. The API accepts CAD, USD, EUR,
  GBP, AUD and CNY; the form does not offer a picker yet.
- There is **no registration screen** — sign in with an account that exists.
  Registration would also need the email-verification link to deep-link back
  into the app rather than open the web frontend.
- **Web is not a target.** `expo-secure-store` has no web implementation, so
  `lib/storage.ts` falls back to `localStorage` purely to keep `npm run web`
  usable while iterating. It is not secure and is not meant to ship.
