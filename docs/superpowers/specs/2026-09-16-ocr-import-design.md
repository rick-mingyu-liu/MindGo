# Screenshot Import (OCR) — Design

**Date:** 2026-09-16 · **Status:** approved in brainstorming, awaiting spec review · **Branch:** `feat/ocr-import`

## 1. Goal

A new **Import** tab where a user drops in screenshots of Canadian bank-app
transaction lists or photos of paper receipts, reviews the transactions that
open-source OCR (PaddleOCR PP-OCRv5, running **on the user's device**)
extracted, and saves them in one step.

The feature has to hold up as three things at once:

- **Product** — a drop-and-review flow that is faster than typing.
- **Open source, on-device** — the text is read in the browser by PaddleOCR
  models through `ppu-paddle-ocr` and `onnxruntime-web`, and structured by a
  parser written for this project. **The image never leaves the device.** An
  LLM is a fallback, never the default, and only ever sees OCR text.
- **ML systems** — a benchmark with per-field accuracy and a headline
  *silent-error rate*, so every claim about accuracy is measured.

The governing rule is **checked, not trusted**: nothing the pipeline reads is
saved until a human confirms it, and every value that failed or skipped a check
is visibly flagged.

The whole feature is JavaScript/TypeScript. There is no Python and no
separately deployed OCR service.

### Success criteria

1. On the benchmark, the **silent-error rate** (rows whose amount is wrong *and*
   carry no warning flag) is reported per layout and per source, and is the
   number tracked across changes.
2. A screenshot that yields no usable rows, a device that cannot run the model,
   or a failed model download produces a clear message — never a crash and
   never a partial save.
3. No image bytes reach the server. No OCR text or extracted values appear in
   server logs (asserted by a test).
4. Import of up to 100 confirmed rows is atomic.

### Non-goals (v1)

WeChat Pay / Alipay bills, credit-card statement pages, PDFs, a native mobile
app, learned categorisation, server-side draft persistence, a server-side OCR
path. The PP-OCRv5 multilingual recogniser reads Chinese, so WeChat/Alipay is a
natural v2 layout, not a model change.

## 2. Architecture

```
Browser (/import)                                          Node API (Render)
  drop / paste screenshot
  Web Worker: ppu-paddle-ocr + onnxruntime-web
    PP-OCRv5 det + rec  → lines [{text, box, conf}]
  ── POST /import/parse { today, image:{w,h}, model, lines } ──▶ auth, importLimiter, validate payload
                                                                 parser: rows → tokens → classify → bankList | receipt
                                                                 low confidence → row text → gpt-4o-mini → same validators
                                                                 possible_duplicate lookup
  review table ◀──────────── draft rows + flags ────────────────┘   (nothing persisted)
  edit / untick
  confirm ─────── POST /transactions/import ────────────────────▶ re-validate every row → single DB transaction
```

Decisions:

- **OCR runs in a Web Worker** so inference never blocks the UI thread. The
  worker is created only on `/import` and loads the library with a dynamic,
  client-only import (Pages Router, no SSR).
- **The image stays on the device.** Only the OCR lines (text, box, confidence)
  and the image dimensions are sent to the server. The screenshot is shown back
  to the user from a local object URL.
- **The parser runs on the server**, not in the browser: the backend has the
  test runner (the frontend has none), the LLM key, and the duplicate lookup.
  The OCR text therefore does reach the server, which is stated plainly in the
  UI; the logging rules in §5 cover it.
- **Drafts are stateless.** `POST /import/parse` stores nothing.
- **The server never trusts the client.** It validates the OCR payload's shape
  and size, and `POST /transactions/import` validates each confirmed row with
  the same rules as `POST /transactions`.
- **Decimal strings end to end.** Amounts are never parsed to floats in the
  pipeline; they are `^\d+\.\d{2}$` strings until the INSERT.
- **Days, not instants.** The browser sends `today` (its local
  `YYYY-MM-DD`); all date inference is relative to it. Dates are built with
  integer arithmetic or `toDay()` — never `new Date(y, m, d).toISOString()`.

## 3. On-device OCR (`frontend/lib/ocr/`)

- **Library:** `ppu-paddle-ocr` (MIT, TypeScript) with the `onnxruntime-web`
  peer, imported from its `/web` subpath.
- **Model:** a PP-OCRv5 mobile preset. The candidates are
  `V5_EN_MOBILE_MODEL`, its int8 variant, and `V5_MOBILE_MODEL` (Chinese +
  English); the benchmark (§8) chooses between them on accuracy, download size,
  and time. PP-OCRv6 presets are also shipped by the library and are measured
  as a comparison, not adopted by default.
- **Model hosting:** model files are served from `frontend/public/models/`
  (self-hosted, same origin) rather than fetched from a third-party URL at
  runtime, so a first import does not depend on another site and the exact
  files are pinned in the repo or fetched by a pinned script at build time.
- **`ocrWorker.ts`** — owns the `PaddleOcrService` instance; initialises on the
  first message and keeps the session for later images. Messages:
  `init` → progress events → `ready`; `recognize(ImageBitmap)` →
  `{ lines, image: { width, height }, model, durationMs }`; `error`.
- **`useOcr.ts`** — a hook that wraps the worker: state
  `idle | downloading(progress) | ready | recognizing | unsupported | failed`,
  and a `recognize(file)` that queues calls one at a time.
- **Recognition options** — `flatten: true` and `minimumConfidence: 0`: the
  library's default of 0.5 silently drops low-confidence text, and this design
  flags low confidence rather than discarding it. The library returns boxes as
  `{ x, y, width, height }` in original-image pixels, which is the wire format
  as-is, so the review screen can overlay them directly. The library's own
  `detection.maxSideLength: "auto"` handles downscaling.
- **Recognition strategy** is chosen by the benchmark, not assumed. Measured
  on 2026-09-16 with `V5_EN_MOBILE_MODEL` in Node: `per-line` (the default)
  read `-$23.47` correctly but gave every word on a line one shared confidence
  and dropped a `TOTAL 0.07` line; `per-box` kept that line and gave
  per-word confidences but read `-$23.47` as **`$23.47`** — the minus sign
  lost with high confidence. Minus signs are therefore never the only evidence
  for a transaction's type (see §4.4).
- **Processing engine** — the library's default `opencv` engine bundles
  OpenCV.js; `canvas-native` avoids it. The spike measures the download cost
  of each and the benchmark measures accuracy; eval and browser always use the
  same engine.
- **Self-hosted runtime** — `onnxruntime-web` fetches its WASM from jsDelivr
  unless `ort.env.wasm.wasmPaths` is set; the worker sets it to `/ort/`, and
  the WASM files are copied from `node_modules/onnxruntime-web/dist` into
  `public/ort/` by the same script that fetches the models.
- **Unsupported devices** — if WebAssembly is unavailable or initialisation
  fails, the page shows a message and a link to manual entry. There is no
  server-side OCR fallback in v1.
- **Verified 2026-09-16 (Node):** `new PaddleOcrService({ model })`,
  `await initialize()`, `recognize(arrayBuffer, options)`; the v5 English
  mobile model files total 12 MB; first initialise about 1 s, recognition
  about 70 ms for a small image; process RSS about 400 MB.
- **Verify first (plan step 1):** whether it runs inside a Worker under
  Next.js, multi-threaded WASM requirements (`SharedArrayBuffer` needs cross-origin isolation headers; the
  single-threaded path must work without them), total download size, and
  recognition time on a laptop and a mid-range phone.

## 4. Parser (`backend/services/import/`)

Pure functions, one purpose per module.

### 4.1 `rows.js` — boxes to visual rows

Group OCR lines whose vertical centres overlap (tolerance relative to line
height) into rows; sort each row left to right. Each row keeps its member
lines, bounding box, and minimum `conf`.

### 4.2 `tokens.js` — values

- **`parseAmount(text)`** → `{ value: "1234.56", sign: -1|1|null, corrected: bool } | null`.
  Accepts `$1,234.56`, `-$12.50`, `−12.50` (U+2212), `(12.50)`, `12.50 CR`,
  `+12.50`. Rejects comma-decimal forms such as `1 234,56`: Canadian English
  bank apps do not use them, and rejecting beats misreading. Character repairs
  `O→0`, `o→0`, `l→1`, `I→1`, `S→5`, `B→8` apply only inside a token that
  already has an amount shape (digits, separators, exactly two decimals after
  repair) and set `corrected: true`.
- **`parseDate(text, today)`** → `'YYYY-MM-DD' | null`. Accepts `Sep 14`,
  `September 14`, `Sep 14, 2026`, `2026-09-14`, `09/14/2026`, `14/09/2026` only
  when the day is > 12 (otherwise ambiguous → null), `Today`, `Yesterday`.
  A date with no year resolves to the most recent date **not after** `today`.
- **`isDateHeader(row)`** — a row consisting only of a date.

### 4.3 `classify.js` — layout

Scores `receipt` vs `bank-list` and returns `{ layout, confidence }`.

- Receipt signals: `SUBTOTAL`, `TOTAL`, `GST`, `HST`, `PST`, `TIP`,
  `CHANGE`, masked card `****1234` / `XXXX1234`, one or two amount-bearing rows
  with a total keyword.
- Bank-list signals: date headers, ≥ 3 rows ending in an amount, words like
  `Pending`, `Posted`, `Balance`.

### 4.4 `bankList.js`

- Every row whose right-most token is an amount becomes a transaction.
- `description` = the row's text left of the amount, trimmed of dates.
- `date` = a date in the row, else the nearest date header above, else null
  (flag `missing_date`).
- `type` = `expense` when the sign is negative; `income` when positive-signed or
  the description matches income words (`Payroll`, `Deposit`,
  `e-Transfer received`, `Refund`, `Interest`); otherwise `expense` with flag
  `type_guessed`. Because OCR can drop a minus sign (§3), an unsigned amount is
  never treated as a confirmed expense: it always carries `type_guessed`
  unless the running-balance check confirms the direction.
- **Running balance:** a row with two amounts treats the right-most as a
  balance candidate. If consecutive balances differ by exactly the row amount
  (with the sign implied by `type`), mark the rows `arithmetic_verified` and
  drop the balance; if they don't, keep the left amount and flag
  `balance_mismatch`.
- Rows containing `Pending` get flag `pending`.

### 4.5 `receipt.js`

- Exactly one transaction, `type: expense`.
- `amount` = the highest-ranked total line: `TOTAL` > `AMOUNT DUE` >
  `BALANCE DUE` > `AMOUNT`; never a line containing `SUBTOTAL`. Ties → the
  lower line on the page.
- If `SUBTOTAL`, tax lines (and optional `TIP`) are present and
  `subtotal + Σtax (+ tip) == total` in integer cents → `arithmetic_verified`;
  if present but unequal → `arithmetic_failed` (triggers fallback).
- `description` = the tallest-box text line in the top 20 % of the image,
  excluding phone numbers, URLs, and street-address patterns.
- `category` = `categorize(description)`: a small keyword map
  (`merchantCategories.js`) onto the canonical list in
  `frontend/pages/transactions/new.tsx`; unmatched → `null`.

### 4.6 Confidence and fallback

- Field confidence = OCR `conf` of the source line, × 0.8 if `corrected`,
  × 0.9 if the value was inferred (year, type).
- Row confidence = minimum of its field confidences, raised to at least 0.95
  when `arithmetic_verified`.
- A row is flagged `low_confidence` below `IMPORT_CONFIDENCE_THRESHOLD`
  (default 0.80, in `config/index.js`).
- **LLM fallback** (`llmFallback.js`) runs when any of: layout confidence <
  0.6, zero rows parsed, `arithmetic_failed`. It sends **only the reconstructed
  row text** plus `today` and the canonical category list to `gpt-4o-mini`
  (via the existing OpenAI client) with a strict JSON schema. Its rows pass
  through `parseAmount` / `parseDate` / the category list; any row that fails is
  dropped with a warning. LLM rows carry `source: "llm"` and are always flagged
  `low_confidence` unless the receipt arithmetic check passes on their values.
- Fallback **never blocks**: no API key, a network error, an HTTP error, or an
  unparseable response returns the parser's result plus a warning, and logs via
  `console.error` without content.

### 4.7 Output contract

```json
{
  "layout": "bank-list",
  "layoutConfidence": 0.91,
  "model": "PP-OCRv5_en_mobile",
  "warnings": ["ai_fallback_unavailable"],
  "rows": [{
    "date": "2026-09-14",
    "amount": "23.47",
    "currency": "CAD",
    "description": "Sobeys",
    "category": "Groceries",
    "type": "expense",
    "confidence": 0.93,
    "flags": ["arithmetic_verified"],
    "source": "parser",
    "boxes": [{ "x": 12, "y": 40, "width": 298, "height": 38 }]
  }]
}
```

`currency` defaults to `CAD` for both v1 layouts; a `US$`/`USD` token in the
row sets `USD`. `flags` values: `arithmetic_verified`, `arithmetic_failed`,
`balance_mismatch`, `corrected_chars`, `low_confidence`, `missing_date`,
`type_guessed`, `pending`, `possible_duplicate`.

## 5. API

### `POST /import/parse` (`backend/routes/import.js`, mounted at `/import`)

`router.use(auth)` at the top, per repo convention. `importLimiter`
(30 per 15 min, keyed on `req.user.userId`) because each call may reach the
LLM and always queries the database.

Body, parsed with a route-level `express.json({ limit: '1mb' })` (the app-wide
parser keeps its default):

```json
{
  "today": "2026-09-16",
  "model": "PP-OCRv5_en_mobile",
  "image": { "width": 1170, "height": 2532 },
  "lines": [{ "text": "Sobeys #1234", "conf": 0.97,
              "box": { "x": 12, "y": 40, "width": 298, "height": 38 } }]
}
```

Validation (`body([...])`): `today` is `YYYY-MM-DD`; `model` a short string;
`image.width`/`height` integers 1–10 000; `lines` an array of at most 2 000;
each `text` a string of at most 500 characters; `conf` in [0, 1]; `box` an object of four
non-negative numbers `x`, `y`, `width`, `height`. Then: parser → fallback → `possible_duplicate` by querying the
user's transactions for matching `(date, amount, currency)`.

### `POST /transactions/import`

Body `{ rows: [{ date, amount, description, category, type, currency, source, edited }] }`,
1–100 rows. Each row validated with the existing `transactionValidation` rules
via wildcard paths (`rows.*.amount`, …); `source ∈ {ocr, ocr_llm}`; `edited`
boolean. The client maps draft `source` `parser` → `ocr` and `llm` → `ocr_llm`.
Inserts all rows in one transaction on a dedicated client
(`db.getPool().connect()`), returns `{ ids }`. On any invalid row → 400 with the
failing indices and no insert. Audit-logs counts only: rows imported, rows
edited, rows by source.

### Errors

| Condition | Response |
|---|---|
| Malformed or oversized OCR payload | `400` with validation errors / `413` |
| `lines` empty | `200` with `rows: []`, `warnings: ["no_text_found"]` |
| No rows parsed and fallback unavailable | `200` with `rows: []` and the reconstructed row text in `unparsedLines`, for manual entry |
| Any confirmed row invalid | `400` with the failing indices; nothing saved |

### Logging

Neither route logs `lines`, row values, or request bodies. Errors are logged
with a user id and an error code only.

### Config

`IMPORT_CONFIDENCE_THRESHOLD` in `backend/config/index.js`. No new backend
dependency.

## 6. Database

Migration `backend/db/migrations/011_add_transaction_source.sql`, mirrored in
`schema.sql`:

```sql
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'ocr', 'ocr_llm'));
```

Existing rows become `manual`. `POST /transactions` and `PUT
/transactions/:id` do not accept `source`. Editing an imported transaction later
keeps its source.

## 7. Frontend (`frontend/pages/import.tsx`)

Entry points: an **Import from screenshot** button on the dashboard
(`pages/index.tsx`) and on `pages/transactions/index.tsx`.

1. **Engine banner** from `useOcr`: *Downloading the reading model (n %)* on
   first use, then *Ready*; *This device can't run on-device reading* with a
   link to manual entry when unsupported; retry on a failed download. One line
   of copy states that screenshots stay on the device and only the recognised
   text is sent to MindGo.
2. **Drop zone** — drag-and-drop, file picker, and clipboard paste (PNG, JPEG,
   WebP). Up to 5 images per batch, processed one at a time; each shows
   queued / reading / parsing / done / failed, with retry. Files may be dropped
   while the model downloads.
3. **Review table** (`components/ui/table`): checkbox, date, description,
   category (same picker as `new.tsx`, rendered through `t()`), type, amount,
   currency, source. All cells editable; editing sets `edited: true` on the row.
   Badges: **Verified**, **Check this** (`low_confidence`, `corrected_chars`,
   `balance_mismatch`, `missing_date`, `type_guessed`), **Pending**,
   **Possible duplicate** (starts unticked), **AI-read**. Rows missing a
   required field cannot be ticked until fixed.
4. **Source preview** — selecting a row shows its screenshot (a local object
   URL; revoked on unmount) with that row's boxes outlined.
5. **Totals** of ticked rows, per currency.
6. **Confirm** — "Import N transactions" → `POST /transactions/import` →
   redirect to `/transactions`. On 400, highlight failing rows; nothing saved.
7. `unparsedLines`, when present, are shown as copyable text with a link to
   `/transactions/new`.

All user-facing strings go into both `public/locales/en/common.json` and
`public/locales/zh/common.json`; `npm run check:locales` must pass. Dates are
rendered with `lib/date.ts`. New frontend dependencies: `ppu-paddle-ocr`,
`onnxruntime-web`.

## 8. Evaluation (`eval/`, its own npm project)

A top-level `eval/` directory with its own `package.json`, so
`onnxruntime-node` (about 258 MB of native binaries) never enters the backend's
or frontend's install or deploy. It runs the **same library and model files**
as the browser, through `onnxruntime-node`, and requires the backend parser by
relative path. `npm run eval` from `eval/`.

- **Datasets**
  - `eval/synthetic/` (committed): a generator script draws bank-app lists
    and receipts from seeded random values onto `@napi-rs/canvas` (already a
    dependency of the OCR library, so no headless browser), writes each PNG
    with its ground truth alongside, and is re-run only to regenerate.
  - `eval/private/` (gitignored): 20–30 real screenshots with hand-written
    `*.label.json`. Never committed and never uploaded anywhere; OCR runs
    locally.
- **OCR cache** — `eval/.cache/<sha256>-<model>.json` so parser iterations
  don't re-run OCR. Synthetic cache files are committed as
  `backend/test/fixtures/ocr/` and double as parser test fixtures, so backend
  tests and CI never need the model.
- **Browser parity** — native and WASM inference can differ slightly. Plan
  step 1 records the browser's output for three synthetic images and the eval
  compares it with the Node output; any text difference is reported.
- **Matching** — predicted rows are matched to labelled rows by date +
  amount, then by description similarity.
- **Metrics**, per layout, per source (`parser` / `llm`), and per model:
  row precision and recall; exact-match rate for amount, date, type;
  normalised-description match; category accuracy where labelled;
  fallback rate; OCR time p50/p95; model download size.
- **Headline:** **silent-error rate** = rows with a wrong amount and none of
  the warning flags, divided by matched rows.
- **Output:** `eval/reports/<date>-<model>.md` (synthetic reports committed;
  private-set reports gitignored).

## 9. Testing

- **Parser** (`backend/test/importParser.test.js`): amount formats and
  rejections, character repair only inside amount shapes, year inference swept
  across four timezones (as `terms.test.js` does), date headers,
  running-balance verification and mismatch, receipt total ranking and
  arithmetic, category mapping against the list parsed from `new.tsx` (as
  `demoData.test.js` does).
- **Routes** (`backend/test/importRoutes.test.js`): real router on an ephemeral
  port with `db.query` and the LLM client stubbed — payload validation and size
  limit, empty lines, fallback-unavailable degradation, duplicate flagging, and
  that nothing printed contains OCR text or row values (as
  `registerLogging.test.js` does).
- **Import endpoint** (`api.test.js`, needs `TEST_DATABASE_URL`): atomicity on
  one bad row, `source` persisted, 100-row cap.
- **CI:** backend job picks up the new tests. The frontend job's `build`
  covers the worker and dynamic import compiling. `eval/` is not run in CI.
- **Frontend:** no runner; verify by running the app and walking the flow —
  first-use download, a bank screenshot, a receipt photo, an unsupported
  browser path — in light and dark themes and at phone width.

## 10. Build order

1. **Spike:** `ppu-paddle-ocr` recognising a sample screenshot in Node and in a
   Worker on a throwaway Next.js page; settle model hosting, WASM threading,
   download size, and timing. Spike code is discarded.
2. `eval/` project, synthetic dataset, fixtures, parser, `npm run eval` —
   first real numbers, and the model choice.
3. Migration, `POST /import/parse`, `POST /transactions/import`.
4. `lib/ocr/` worker and hook, `/import` page, entry buttons.
5. LLM fallback — built only if step 2's numbers show the parser needs it, and
   measured with the same benchmark.

## 11. Risks

- **First-use download** (models plus the WASM runtime) is tens of megabytes;
  the progress banner and browser caching are the mitigation, and step 1
  measures the size.
- **Slow or unsupported devices** — older phones may take several seconds per
  image; step 1 measures it, and unsupported devices get manual entry.
- **Multi-threaded WASM** needs cross-origin isolation headers, which can break
  third-party embeds; v1 ships the single-threaded path unless step 1 shows it
  is too slow.
- **Library dependence** — `ppu-paddle-ocr` is a young, fast-moving package;
  its version is pinned, and the model files are self-hosted so an upstream
  change cannot silently swap the model.
- **Bank-app layouts vary**; the benchmark's per-layout numbers show where the
  parser falls short, and the fallback covers it.
