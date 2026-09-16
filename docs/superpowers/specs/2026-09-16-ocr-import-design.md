# Screenshot Import (OCR) — Design

**Date:** 2026-09-16 · **Status:** approved in brainstorming, awaiting spec review · **Branch:** `feat/ocr-import`

## 1. Goal

A new **Import** tab where a user drops in screenshots of Canadian bank-app
transaction lists or photos of paper receipts, reviews the transactions that
open-source OCR (PaddleOCR PP-OCRv5) extracted, and saves them in one step.

The feature has to hold up as three things at once:

- **Product** — a drop-and-review flow that is faster than typing.
- **Open source** — the text is read by a self-hosted PaddleOCR service and
  structured by a parser written for this project; an LLM is a fallback, never
  the default, and never sees the image.
- **ML systems** — a benchmark with per-field accuracy and a headline
  *silent-error rate*, so every claim about accuracy is measured.

The governing rule is **checked, not trusted**: nothing the pipeline reads is
saved until a human confirms it, and every value that failed or skipped a check
is visibly flagged.

### Success criteria

1. On the benchmark, the **silent-error rate** (rows whose amount is wrong *and*
   carry no warning flag) is reported per layout and per source, and is the
   number tracked across changes.
2. A screenshot that yields no usable rows, or an OCR service that is down,
   produces a clear message — never a 500 and never a partial save.
3. No image bytes, OCR text, or extracted values appear in server logs
   (asserted by a test).
4. Import of up to 100 confirmed rows is atomic.

### Non-goals (v1)

WeChat Pay / Alipay bills, credit-card statement pages, PDFs, storing uploaded
images, server-side draft persistence, a native mobile app, learned
categorisation. The PP-OCRv5 recogniser reads Chinese, so WeChat/Alipay is a
natural v2 layout, not a model change.

## 2. Architecture

```
Browser (/import)                    Node API (Render)                  ocr-service (Render free tier, Python)
  drop / paste screenshot ─POST /import/ocr─▶ auth, importLimiter, multer (memory, 5 MB, magic bytes)
                                           ─POST /ocr + X-OCR-Secret─▶ RapidOCR, PP-OCRv5 mobile det+rec
                                           ◀── { lines:[{text, box, conf}], model_versions, duration_ms }
                                           parser: rows → tokens → classify → bankList | receipt
                                           low confidence → OCR *text* → gpt-4o-mini → same validators
  review table ◀── draft rows + flags ─────┘   (nothing persisted)
  edit / untick
  confirm ────POST /transactions/import───▶ re-validate every row → single DB transaction
```

Decisions:

- **Drafts are stateless.** `POST /import/ocr` returns drafts and stores
  nothing. The image lives in request memory only.
- **The server never trusts the client's confirmed rows.** `POST
  /transactions/import` validates each row with the same rules as `POST
  /transactions`.
- **The OCR service is publicly reachable** (Render's free tier has no private
  network), so `POST /ocr` requires a shared secret known only to Node. Browsers
  never call it.
- **Cold starts are a designed state.** The free tier sleeps after ~15 minutes
  idle. Opening `/import` calls `GET /import/status`, which pings the service's
  `/health` to wake it; the UI shows a warming state. Node's OCR call times out
  at `OCR_TIMEOUT_MS` (default 90 000).
- **Parser in Node, model in Python.** The parser consumes recorded OCR JSON,
  so it is tested with `node --test` and no model.
- **Decimal strings end to end.** Amounts are never parsed to floats in the
  pipeline; they are `^\d+\.\d{2}$` strings until the INSERT.
- **Days, not instants.** The browser sends `today` (its local
  `YYYY-MM-DD`); all date inference is relative to it. Dates are built with
  integer arithmetic or `toDay()` — never `new Date(y, m, d).toISOString()`.

## 3. OCR service (`ocr-service/`)

New top-level directory, deployed as its own Render web service.

- **Stack:** Python 3.12, FastAPI, uvicorn, `rapidocr` + `onnxruntime`,
  PP-OCRv5 **mobile** detection and recognition models (fit in 512 MB).
- **`GET /health`** — unauthenticated; returns `{ status: "ok", model_versions }`.
- **`POST /ocr`** — requires header `X-OCR-Secret`, compared with
  `hmac.compare_digest`; missing or wrong → 401. Body: the image bytes
  (`multipart/form-data`, field `image`). Downscales so the longest side is at
  most 2000 px before inference. Response:

  ```json
  {
    "image": { "width": 1170, "height": 2532, "scale": 0.79 },
    "model_versions": { "det": "PP-OCRv5_mobile_det", "rec": "PP-OCRv5_mobile_rec" },
    "duration_ms": 842,
    "lines": [
      { "text": "Sobeys #1234", "conf": 0.97,
        "box": [[12, 40], [310, 40], [310, 78], [12, 78]] }
    ]
  }
  ```

  Box coordinates are in the **original** image's pixel space, so the browser
  can overlay them on the image it already holds.
- Logs contain request duration and line count only — never text.
- **Dockerfile** with models baked into the image, so a cold start does not
  download them.
- **Verify first (plan step 1):** that the current `rapidocr` release ships
  PP-OCRv5 models and how they are selected; pin the version in
  `requirements.txt`.
- **Tests:** `pytest` against one committed synthetic image (auth rejected
  without the secret; known text recovered; boxes rescaled correctly).

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
  bank apps do not use them, and rejecting beats misreading. Character repairs `O→0`, `o→0`, `l→1`, `I→1`, `S→5`,
  `B→8` apply only inside a token that already has an amount shape
  (digits, separators, exactly two decimals after repair) and set
  `corrected: true`.
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
  `type_guessed`.
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
  "model_versions": { "det": "…", "rec": "…" },
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
    "boxes": [[[12, 40], [310, 40], [310, 78], [12, 78]]]
  }]
}
```

`currency` defaults to `CAD` for both v1 layouts; a `US$`/`USD` token in the
row sets `USD`. `flags` values: `arithmetic_verified`, `arithmetic_failed`,
`balance_mismatch`, `corrected_chars`, `low_confidence`, `missing_date`,
`type_guessed`, `pending`, `possible_duplicate`.

## 5. API (`backend/routes/import.js`, mounted at `/import`)

`router.use(auth)` at the top, per repo convention.

| Endpoint | Behaviour |
|---|---|
| `GET /import/status` | Pings `ocr-service /health` with a short timeout. Returns `{ ocr: "ready" \| "warming" \| "down" \| "disabled" }`. `disabled` when `OCR_SERVICE_URL` is unset. |
| `POST /import/ocr` | `importLimiter` (30 per 15 min, keyed on `req.user.userId`), multer memory storage, 5 MB, single field `image`, type confirmed by magic bytes (PNG, JPEG, WebP). `today` is a multipart form field, validated with `body('today')` as `YYYY-MM-DD` after multer parses it. Calls the OCR client, runs the parser, marks `possible_duplicate` by querying the user's transactions for matching `(date, amount, currency)`. |
| `POST /transactions/import` | Body `{ rows: [{ date, amount, description, category, type, currency, source, edited }] }`, 1–100 rows. Each row validated with the existing `transactionValidation` rules via wildcard paths (`rows.*.amount`, …); `source ∈ {ocr, ocr_llm}`; `edited` boolean. The client maps draft `source` `parser` → `ocr` and `llm` → `ocr_llm`. Inserts all rows in one transaction on a dedicated client (`db.getPool().connect()`), returns `{ ids }`. On any invalid row → 400 with the failing indices and no insert. Audit-logs counts only: rows imported, rows edited, rows by source. |

Errors:

| Condition | Response |
|---|---|
| OCR unreachable or timed out | `503 { code: "OCR_UNAVAILABLE" }` |
| OCR returns 401 (secret mismatch) | `503 { code: "OCR_UNAVAILABLE" }`, `console.error` names the misconfiguration |
| Not an accepted image | `400 { code: "UNSUPPORTED_IMAGE" }` |
| Over 5 MB | `413` |
| No text | `200` with `rows: []`, `warnings: ["no_text_found"]` |
| No rows parsed and fallback unavailable | `200` with `rows: []` and the raw row text in `unparsedLines`, for manual entry |

New config in `backend/config/index.js`: `OCR_SERVICE_URL`,
`OCR_SERVICE_SECRET`, `OCR_TIMEOUT_MS`, `IMPORT_CONFIDENCE_THRESHOLD`.
Startup validation warns (does not exit) when the URL is set without the secret.

New dependency: `multer`.

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
(`pages/index.tsx`) and on `pages/transactions/index.tsx`, both hidden when
status is `disabled`.

1. **Status banner** from `GET /import/status`: Ready / Warming up (poll every
   5 s, up to 2 min) / Unavailable.
2. **Drop zone** — drag-and-drop, file picker, and clipboard paste. Up to 5
   images per batch, processed sequentially; each shows queued / reading /
   parsed / failed, with retry on failure. Files may be dropped while warming.
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
rendered with `lib/date.ts`.

## 8. Evaluation (`backend/eval/`)

`npm run eval` (backend).

- **Datasets**
  - `eval/synthetic/` (committed): a generator script renders HTML templates
    of bank-app lists and receipts from randomised, seeded values to PNG, and
    writes the ground truth alongside. Rendering needs a headless browser; it
    runs only when regenerating, and the PNGs plus labels are committed.
  - `eval/private/` (gitignored): 20–30 real screenshots with hand-written
    `*.label.json`. Never committed, never uploaded anywhere but the OCR
    service.
- **OCR cache** — `eval/.cache/<sha256>-<model_versions>.json` so parser
  iterations don't re-run OCR. Synthetic cache files are committed as
  `backend/test/fixtures/ocr/` and double as parser test fixtures.
- **Matching** — predicted rows are matched to labelled rows by date +
  amount, then by description similarity.
- **Metrics**, per layout and per source (`parser` / `llm`):
  row precision and recall; exact-match rate for amount, date, type;
  normalised-description match; category accuracy where labelled;
  fallback rate; OCR `duration_ms` p50/p95.
- **Headline:** **silent-error rate** = rows with a wrong amount and none of
  the warning flags, divided by matched rows.
- **Output:** `eval/reports/<date>-<model_versions>.md` (synthetic reports
  committed; private-set reports gitignored).

## 9. Testing

- **Parser** (`test/importParser.test.js`): amount formats and rejections,
  character repair only inside amount shapes, year inference swept across four
  timezones (as `terms.test.js` does), date headers, running-balance
  verification and mismatch, receipt total ranking and arithmetic, category
  mapping against the list parsed from `new.tsx` (as `demoData.test.js` does).
- **Routes** (`test/importRoutes.test.js`): real router on an ephemeral port
  with the OCR client and `db.query` stubbed — magic-byte rejection, size
  limit, 503 mapping, `disabled` status, fallback-unavailable degradation, and
  that nothing printed contains OCR text or row values (as
  `registerLogging.test.js` does).
- **Import endpoint** (`api.test.js`, needs `TEST_DATABASE_URL`): atomicity on
  one bad row, `source` persisted, 100-row cap.
- **OCR service:** `pytest`.
- **CI:** add an `ocr-service` job (install, pytest). Backend job unchanged
  apart from new tests.
- **Frontend:** no runner; verify by running the app and walking the flow in
  light and dark themes and at phone width.

## 10. Build order

1. `ocr-service` running locally and on Render; `rapidocr`/PP-OCRv5 pinned.
2. Parser, synthetic dataset, fixtures, `npm run eval` — first real numbers.
3. Migration, `/import` routes, `POST /transactions/import`.
4. `/import` page and entry buttons.
5. LLM fallback — built only if step 2's numbers show the parser needs it, and
   measured with the same benchmark.

## 11. Risks

- **Free-tier cold start** can exceed a minute; the warming UI and the 90 s
  timeout are the mitigation. Upgrading to a paid instance is a config change.
- **512 MB memory** with mobile models and a 2000 px cap is expected to fit;
  step 1 measures it.
- **Bank-app layouts vary**; the benchmark's per-layout numbers show where the
  parser falls short, and the fallback covers it.
- **The public OCR endpoint** is protected by the shared secret only; it
  holds no user data and stores nothing.
