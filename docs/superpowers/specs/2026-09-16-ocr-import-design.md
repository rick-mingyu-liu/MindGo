# Screenshot Import (OCR) — Design

**Date:** 2026-09-16 · **Status:** approved; revised the same day after prototyping (see *Revision notes*) · **Branch:** `feat/ocr-import` · **Plan:** [`docs/superpowers/plans/2026-09-16-ocr-import.md`](../plans/2026-09-16-ocr-import.md)

## 1. Goal

A new **Import** page where a user drops in screenshots of Canadian bank-app
transaction lists or photos of paper receipts, reviews the transactions that
open-source OCR (PaddleOCR, **PP-OCRv6 small**, running **on the user's
device**) extracted, and saves them in one step.

The feature has to hold up as three things at once:

- **Product** — a drop-and-review flow that is faster than typing.
- **Open source, on-device** — the text is read in the browser by PaddleOCR
  models through `ppu-paddle-ocr` and ONNX Runtime Web, and structured by a
  parser written for this project. **The image never leaves the device.** An
  LLM is an optional fallback, never the default, and only ever sees OCR text.
- **ML systems** — a benchmark with per-field accuracy and a headline
  *silent-error rate*, so every claim about accuracy is measured. The model
  and its settings were chosen by that benchmark (§8.4).

The governing rule is **checked, not trusted**: nothing the pipeline reads is
saved until a human confirms it, and every value that failed or skipped a check
is visibly flagged.

The whole feature is JavaScript/TypeScript. There is no Python and no
separately deployed OCR service.

### Success criteria

1. On the benchmark, the **silent-error rate** (rows whose amount is wrong *and*
   carry no warning flag) is reported per layout, and is the number tracked
   across changes. A backend test fails if any recorded fixture produces a
   silent amount error, a silent direction error, or an unflagged invented row.
2. A screenshot that yields no usable rows, a device that cannot run the model,
   or a failed model download produces a clear message — never a crash and
   never a partial save.
3. No image bytes reach the server. No OCR text or extracted values appear in
   server logs (asserted by tests).
4. Import of up to 100 confirmed rows is atomic.

### Non-goals (v1)

WeChat Pay / Alipay bills, credit-card statement pages, PDFs, a native mobile
app, learned categorisation, server-side draft persistence, a server-side OCR
path, multi-threaded or GPU inference. PP-OCRv6's dictionary covers Chinese, so
WeChat/Alipay is a new layout for the parser, not a model change.

## 2. Architecture

```
Browser (/import)                                          Node API (Render)
  drop / paste screenshot
  Web Worker: ppu-paddle-ocr + ONNX Runtime Web (WASM, 1 thread)
    PP-OCRv6 small det + rec → lines [{text, conf, box}]
  ── POST /import/parse { today, model, image:{w,h}, lines } ──▶ auth, importLimiter, validate payload
                                                                 parser: rows → tokens → classify → bankList | receipt
                                                                 (optional) unsure → row text → LLM → same validators
                                                                 possible_duplicate lookup
  review (table ≥ md, cards < md) ◀── draft rows + flags ───────┘   (nothing persisted)
  edit / untick / view source
  confirm ─────── POST /transactions/import ────────────────────▶ re-validate every row
                                                                 → one INSERT statement: rows + import_batches record
```

Decisions:

- **OCR runs in a Web Worker** so inference never blocks the page. The worker
  is created when `/import` mounts and terminated when it unmounts.
- **The image stays on the device.** Only the OCR lines (text, confidence,
  box) and the image dimensions are sent to the server. The screenshot is shown
  back to the user from a local object URL.
- **The parser runs on the server**, not in the browser: the backend has the
  test runner (the frontend has none), the LLM key, and the duplicate lookup.
  The OCR text therefore does reach the server, which the page says plainly;
  the logging rules in §5 cover it.
- **Drafts are stateless.** `POST /import/parse` stores nothing.
- **The server never trusts the client.** It validates the OCR payload's shape
  and size, and `POST /transactions/import` validates each confirmed row with
  the same rules as `POST /transactions`.
- **Decimal strings end to end.** Amounts are never parsed to floats in the
  pipeline; they are `^\d+\.\d{2}$` strings until the INSERT.
- **Days, not instants.** The browser sends `today` (its local
  `YYYY-MM-DD`); all date inference is relative to it, by integer arithmetic.

## 3. On-device OCR (`frontend/lib/ocr/`)

### 3.1 Library and model

- **Library:** `ppu-paddle-ocr` 6.6.0 (MIT, TypeScript), web build
  (`ppu-paddle-ocr/web`). Pinned exactly.
- **Profile** — `frontend/lib/ocr/profile.json` is the single statement of what
  runs, read by both the worker and the benchmark:

  ```json
  { "name": "PP-OCRv6_small", "preset": "v6-small", "engine": "opencv", "strategy": "per-box",
    "files": { "detection": "PP-OCRv6_small_det.ort", "recognition": "PP-OCRv6_small_rec.ort",
               "charactersDictionary": "ppocrv6_dict.txt" } }
  ```

  Recognition calls always pass `flatten: true` and `minimumConfidence: 0`: the
  library's default of 0.5 silently drops low-confidence text, and this design
  flags low confidence rather than discarding it. Boxes come back as
  `{ x, y, width, height }` in original-image pixels, which is the wire format
  as-is.
- **Model files** are self-hosted from `frontend/public/models/` (31 MB),
  downloaded by `frontend/scripts/ocr-assets.js` from a **pinned commit** of the
  Hugging Face mirror the library itself uses, and checked against SHA-256. A
  changed file fails the build rather than silently changing what the
  benchmark measured. The directory is gitignored; the script runs before
  `dev` and `build`.

### 3.2 Runtime loading (why there is a shim)

ONNX Runtime Web's ES module builds refer to themselves through
`import.meta.url`. Webpack emits that as a separate `.mjs` asset, and Next's
minifier fails the build parsing it (reproduced with both `ort.bundle.min.mjs`
and `ort.min.mjs`; disabling webpack's URL parsing did not help).

So the runtime is **not bundled**. `next.config.js` aliases `onnxruntime-web`
to `frontend/lib/ocr/ortRuntime.js`, which calls
`importScripts('/ort/ort.wasm.min.js')` — the WASM-only classic-script build —
and re-exports the three members `ppu-paddle-ocr` uses (`env`,
`InferenceSession`, `Tensor`). The asset script copies `ort.wasm.min.js`,
`ort-wasm-simd-threaded.wasm` and `ort-wasm-simd-threaded.mjs` (14 MB) from
`node_modules/onnxruntime-web/dist` into `public/ort/`, and the worker sets
`env.wasm.wasmPaths = '/ort/'`. The general `ort.min.js` build asks for the
WebGPU (`jsep`) variant and is not used.

### 3.3 Threads and speed

- **One thread**, pinned with `env.wasm.numThreads = 1`. Multi-threaded WASM
  needs a cross-origin isolated page; with isolation headers on, this
  classic-script runtime **hangs** starting its thread workers (one thread
  initialised in 666 ms; four never did). Isolation is therefore not enabled.
- **Measured** (M-series Mac, Chrome, production build): about **1–2 s per
  screenshot** while the tab is visible; 8–15 s when Chrome throttled the
  hidden automated tab. Phone speed is not yet measured (§11).

### 3.4 Worker and hook

- **`ocr.worker.ts`** fetches the three model files itself, streaming, so the
  page can show real download progress; builds the `PaddleOcrService` from the
  buffers; posts `progress` → `ready`; answers `recognize` with
  `{ lines, image, model, durationMs }`, or `error`. A failed load is not
  cached, so *Try again* starts over.
- **`useOcr.ts`** wraps the worker: state
  `idle | loading(loaded, total) | ready | unsupported | failed`, a
  `recognize(file)` that queues calls one at a time (and may be called before
  the model is ready), and `retry`. `unsupported` when `Worker` or
  `WebAssembly` is missing. There is no server-side OCR fallback.

## 4. Parser (`backend/services/import/`)

Pure functions, one purpose per module. Implemented and tested in the plan;
this section states the rules.

### 4.1 `rows.js` — boxes to visual rows

Lines whose vertical extents overlap by at least half the shorter one form a
row; each row is sorted left to right and keeps its lines, bounding box, height
and minimum confidence.

### 4.2 `tokens.js` — values

- **`parseAmount`** accepts `$1,234.56`, `-$12.50`, `$-12.50`, `−12.50`,
  `(12.50)`, `12.50 CR`, `+12.50`, `US$ 3.00`, `3.00 USD`; returns
  `{ value, sign, currency, corrected }`. It requires cents, and rejects
  comma-decimal forms (`1 234,56`) — rejecting beats misreading. Letter repairs
  (`O o → 0`, `l I → 1`, `S → 5`, `B → 8`) apply only inside a token already
  shaped like an amount, and set `corrected`.
- **`extractAmounts`** peels amounts off the end of a line, so a row can carry
  a transaction amount and a running balance.
- **`parseDateDetail`** accepts ISO and `YYYY/MM/DD`, `Sep 14`, `SEPT. 14`,
  `September 14, 2025`, `14 Sep`, weekday prefixes, `Today`, `Yesterday`, and
  `MM/DD/YYYY` or `DD/MM/YYYY` **only when one part exceeds 12** (otherwise
  refused as ambiguous). A day with no year is the most recent such day not
  after `today`, and is marked `inferredYear`. No `Date` objects: civil-date
  integer arithmetic, so the server's timezone never matters (tested in four
  timezones).

### 4.3 `classify.js` — layout

Counts receipt signals (`SUBTOTAL`, `TOTAL`, tax names, `TIP`, `CHANGE`, card
brands, masked card numbers, `THANK YOU`, a total line) against bank-list
signals (`Pending`, `Posted`, `Balance`, `Transactions`, `e-Transfer`, date
headers, three or more rows ending in an amount). The layout is the larger
count; confidence is its share. No signals at all is `unknown`.

### 4.4 `bankList.js`

- Every row with an amount becomes a transaction. The description is the rest
  of the row minus a leading date and the words `Pending`/`Posted`.
- The date is a leading date in the row, else the current date header.
- **A row with no amount after the first transaction ends the current
  header**, even if it does not read as a date: OCR misread a bold grey
  "Yesterday" as `Yer` (measured), and carrying the previous header forward
  would have dated the rows below it wrongly and silently. They get
  `missing_date` instead.
- **Direction:** a minus is an expense, a plus is income. An unsigned amount is
  income if the description has an income word (`payroll`, `deposit`,
  `e-transfer received/from`, `refund`, `interest`, `dividend`), else expense —
  **and always carries `type_guessed`**, because OCR can drop a minus sign with
  high confidence (measured: `-$23.47` read as `$23.47`).
- **Running balance** — consecutive balances must differ by exactly the
  transaction between them. The list's order (newest- or oldest-first) is
  whichever more pairs agree with. A row that checks out is
  `arithmetic_verified`; one that does not is `balance_mismatch`. **This
  verifies the amount only, never the direction**: a credit card's balance
  rises with purchases, and OCR drops minus signs from balances too.
- Also: `pending`, `corrected_chars`; zero amounts are skipped.

### 4.5 `receipt.js`

One expense. The amount is the highest-ranked total line (`TOTAL` > `AMOUNT
DUE` > `BALANCE DUE` > `AMOUNT`; the lower of equal ranks), never a subtotal,
a tax total or `TOTAL SAVINGS`. When a subtotal and at least one tax or tip
line sit between it and the total, their sum must equal the total in integer
cents (`arithmetic_verified`, else `arithmetic_failed`). The merchant is the
tallest text in the top fifth of the image that is not a phone number, URL,
address or date. The date is the first run of up to four words anywhere that
parses as one.

### 4.6 `parse.js` — confidence and output

- Field confidences: amount (OCR confidence, × 0.8 if corrected), date (× 0.9
  if the year was inferred; 0 if missing), description (0 if empty), type (0.9
  if guessed). `arithmetic_verified` lifts **only the amount** to at least
  0.95. Row confidence is the minimum; below `IMPORT_CONFIDENCE_THRESHOLD`
  (default 0.80) the row is `low_confidence`.
- `category` from `categorize.js`: a small keyword map onto the canonical
  category list (checked against `db/demoData.js`, which is pinned to the
  frontend list); no confident match → `null`.
- `needsFallback` when layout confidence < 0.6, no rows, or
  `arithmetic_failed`. `unparsedLines` (every row's text) when no rows.
- Warning flags — the ones that mean *look at this row* — are
  `arithmetic_failed`, `balance_mismatch`, `corrected_chars`,
  `low_confidence`, `missing_date`, `type_guessed`. The rest
  (`arithmetic_verified`, `pending`, `possible_duplicate`) are informational.

Output:

```json
{
  "layout": "bank-list", "layoutConfidence": 0.91, "model": "PP-OCRv6_small",
  "warnings": [], "unparsedLines": [],
  "rows": [{
    "date": "2026-09-14", "amount": "23.47", "currency": "CAD",
    "description": "SOBEYS #1234", "category": "Groceries", "type": "expense",
    "confidence": 0.93, "flags": ["type_guessed"], "source": "parser",
    "boxes": [{ "x": 12, "y": 40, "width": 298, "height": 38 }]
  }]
}
```

### 4.7 LLM fallback (conditional)

Built only if the private benchmark shows the parser needs it (plan Task 16).
When built: `needsFallback` sends the reconstructed row text (never the image)
with `today` and the category list to the existing OpenAI client; its rows go
through the same `parseAmount`/`parseDateDetail`/category checks, carry
`source: "llm"`, and are always `low_confidence`. No key, a network or HTTP
error, or an unusable response returns the parser's result with the warning
`ai_fallback_unavailable` — which is also what the route adds whenever
`needsFallback` is true and no fallback exists.

## 5. API

### `POST /import/parse` (`backend/routes/import.js`)

`router.use(auth)`; then `importLimiter` (30 per 15 min, keyed on
`req.user.userId`, env `RATE_LIMIT_IMPORT_MAX`). The app-wide JSON limit is
100 kB, so `app.js` mounts `express.json({ limit: '1mb' })` on `/import`
before the app-wide parser (which then skips the already-read body).

Validation: `today` a real `YYYY-MM-DD`; `model` 1–100 characters;
`image.width`/`height` integers 1–10 000; `lines` an array of at most 2 000;
each `text` a string of at most 500 characters, `conf` in [0, 1], and a `box`
of numbers. Then the parser, then duplicate flagging: one query for the
user's transactions on the drafts' days, matched on `(date, amount,
currency)` — `DATE` arrives as a day string and `DECIMAL(10,2)` as a
two-place string, so both compare exactly.

### `POST /transactions/import`

`{ rows }`, 1–100 rows, each checked like a manual entry plus: `amount` a
string `^\d{1,8}\.\d{2}$` above zero, `date` a real `YYYY-MM-DD`, `source` in
`ocr | ocr_llm`, `edited` a strict boolean; descriptions are trimmed. Any
invalid row → 400 with `invalidRows` (indices) and nothing written. Otherwise
**one statement** — a data-modifying CTE — inserts every row and one
`import_batches` record (row count, edited count, LLM count), so they are
written together or not at all. Returns `{ ids }`.

### Errors and logging

| Condition | Response |
|---|---|
| Malformed payload / over 1 MB | `400` / `413` |
| `lines` empty | `200`, `rows: []`, `warnings: ["no_text_found"]` |
| No rows parsed | `200`, `rows: []`, `unparsedLines`, `warnings: ["ai_fallback_unavailable"]` |
| Any confirmed row invalid | `400` with `invalidRows`; nothing saved |
| Unexpected failure | `500`; logged as `{ userId, error: name, code }` only |

Neither route logs bodies, lines or row values — a database error message can
quote the value it rejected, so errors are logged by name and code. Tests
assert this. The frontend's axios interceptor no longer shows its global error
dialog for 4xx responses from `/import` URLs; the page reports those itself.

**Why not `logger.audit`:** it is reserved for events that destroy or
irreversibly change user data, and `logger.info` prints nothing in production.
The per-import counts live in `import_batches` instead, where they can be
queried.

## 6. Database

Migration `011_add_import_tracking.sql`, mirrored in `schema.sql`:

```sql
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'ocr', 'ocr_llm'));

CREATE TABLE IF NOT EXISTS import_batches (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    row_count INTEGER NOT NULL CHECK (row_count > 0),
    edited_count INTEGER NOT NULL CHECK (edited_count >= 0),
    llm_count INTEGER NOT NULL CHECK (llm_count >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_import_batches_user_id ON import_batches(user_id);
```

Existing rows become `manual`; the migration is safe to re-run (verified).
`POST /transactions` and `PUT /transactions/:id` do not accept `source`.

## 7. Frontend (`frontend/pages/import.tsx`)

Entry points: **Import from screenshot** buttons beside *Add Transaction* on
the dashboard and on `/transactions`.

1. **Engine banner** — download progress with a bar on first use; *Reading
   model ready*; *This browser can't read screenshots on the device* with a
   link to manual entry; *The reading model failed to load* with *Try again*.
2. **Privacy line** — screenshots are read on this device; only the recognised
   text is sent; nothing is saved until you confirm.
3. **Drop zone** — drag and drop, file picker, or paste anywhere on the page;
   PNG, JPEG, WebP; up to five per batch. Each image shows queued / reading /
   parsing / done / failed, layout and read time, with *Try again* and remove.
   An image with no rows shows the text that was read and a link to manual
   entry.
4. **Review** — a table from `md` up and one card per row below it (a
   seven-column table on a phone hid the badges off-screen). Every field is
   editable; editing marks the row `edited`. Under each description:
   **Amount checked** (`arithmetic_verified`), **Check: *reason*** for the most
   serious warning flag (all reasons in its tooltip; hidden once the row has
   been edited), **Pending**, **Possible duplicate** (also for a row repeated
   across the batch's own screenshots), **AI-read**. Duplicates and incomplete
   rows start unticked; incomplete rows cannot be ticked.
5. **Source** — a picture button on each row opens a dialog with the
   screenshot and that row's boxes outlined.
6. **Totals** of ticked rows, income and expense per currency, and
   **Import N transactions**. On 400 the failing rows are highlighted and
   nothing is saved; on success, a toast and `/transactions`.

All strings are in both `en` and `zh` `common.json`; `check:locales` passes.

## 8. Evaluation (`eval/`)

### 8.1 Project

A top-level npm project (`ppu-paddle-ocr`, `onnxruntime-node`,
`@napi-rs/canvas`, all pinned) so `onnxruntime-node`'s 287 MB never enters
the backend's or frontend's install. It runs the same library, and for the
shipped profile the same model files, as the browser, then the real backend
parser (required by path), then the scorer.

### 8.2 Data

- `eval/synthetic/` (committed): `generate.mjs` draws 48 seeded images — 8
  each of three bank-list styles (signed amounts under date headers; unsigned
  amounts with a running-balance column; unsigned amounts with pending rows)
  and 24 receipts (tilted, with ambiguous and unambiguous date formats and
  optional tips) — each with a `.truth.json`.
- `eval/private/` (gitignored): real screenshots with hand-written
  `.truth.json`. Never committed or uploaded; OCR runs locally.

### 8.3 Scoring (`eval/lib/score.cjs`)

Predicted rows are matched to true rows by date + amount, then amount alone,
then description similarity — the last pass is what catches a misread amount.
Reported per layout: precision, recall, exact amount / date / type /
description, category accuracy, **silent amount errors**, silent type errors,
unflagged extra rows, and images the parser was unsure of. `run.mjs` caches
OCR output by image hash and configuration, and writes a Markdown report with
every wrong, missed or invented row.

`exportFixtures.mjs` copies the shipped profile's cached OCR output for the
synthetic set into `backend/test/fixtures/ocr/` (192 KB), and
`backend/test/importFixtures.test.js` replays it through the parser in CI:
zero silent errors of any kind, recall ≥ 95%, amounts ≥ 98% exact.

### 8.4 Results that chose the model (synthetic set, 2026-09-16)

| Configuration | Bank rows found | Bank dates | Receipts found | Receipt dates | Silent amount / type errors |
|---|---|---|---|---|---|
| v5 English mobile, per-line | 164/164 | 64.0% | 16/24 | 37.5% | 0 / 0 |
| v5 English mobile, per-box | 160/164 | 83.1% | 18/24 (plus 5 flagged extra rows; 1 layout wrong) | 50.0% | 0 / 0 |
| v5 English mobile, canvas engine | 163/164 | 62.6% | 15/24 | 46.7% | 0 / 0 |
| v5 multilingual mobile | 163/164 | 50.3% | 22/24 | 77.3% | 0 / 0 |
| v6 small, per-line | 163/164 | 77.3% | 24/24 | 79.2% | 0 / 0 |
| **v6 small, per-box (shipped)** | **164/164** | **100%** | **24/24** | **79.2%** | **0 / 0** |

All amounts that were found were exact in the shipped configuration. The five
receipt dates it misses are all printed as `MM/DD/YYYY` with a day of 12 or
less, which the parser refuses as ambiguous and flags `missing_date` — by
design. Synthetic images are clean; the private set is what measures real
screenshots and photos.

## 9. Testing

- **Parser** — `importTokens`, `importRows`, `importClassify`,
  `importBankList`, `importReceipt`, `importParse` tests (95 cases), with
  hand-built layouts in `test/helpers/ocrLayouts.js`.
- **Recorded OCR** — `importFixtures.test.js` (§8.3).
- **Routes** — `importRoutes.test.js`: both endpoints through the real routers
  with auth and `db.query` stubbed — payload validation, the 1 MB limit,
  duplicate flagging, all-or-nothing rejection with row indices, one-statement
  writes, and that nothing printed contains screenshot text even when the
  database throws.
- **Integration** — `api.test.js` (needs `TEST_DATABASE_URL`): rows saved
  with their source and one batch record, a rejected import saves nothing, a
  manual entry is `manual`, and parse flags a row just imported.
- **Eval** — `eval/test/score.test.mjs`.
- **Frontend** — no runner. Verified by `npm run build` (types and lint), and
  in Chrome: the full flow, source dialog, the import itself (rows and batch
  record checked in the database), dark theme, and a 390 px viewport.
- **CI** — the backend job runs the new tests; the frontend job's build runs
  `ocr-assets` first, so it downloads the model (31 MB) from the pinned commit.

## 10. Build order

1. Parser, token by token, then rows, layout, bank lists, receipts, the whole.
2. Evaluation project, synthetic set, model assets and profile, benchmark,
   recorded fixtures.
3. Migration, `POST /import/parse`, `POST /transactions/import`.
4. Worker and hook; the import page; entry points and strings.
5. Browser verification; documentation.
6. LLM fallback — only if the private benchmark shows the parser needs it.

## 11. Risks and open items

- **Phone speed is unmeasured.** Single-threaded WASM took 1–2 s per image on
  a laptop; a mid-range phone may take several times that. Measure on a real
  phone before announcing the feature; the options if it is too slow are the
  `v6-tiny` preset (benchmark it first), fewer recognition calls
  (`per-line` costs accuracy, §8.4), or making threads work (a module worker
  loading the ESM runtime outside webpack).
- **First-use download** is about 45 MB (model 31 MB, runtime 14 MB). The
  progress bar and HTTP caching are the mitigation.
- **Build-time download** — the frontend build needs the Hugging Face mirror to
  be reachable; a changed file fails the build by checksum rather than
  shipping an unmeasured model.
- **Library dependence** — `ppu-paddle-ocr` is young and moves fast; its
  version is pinned and the model files are self-hosted.
- **Real layouts vary**; the private set's per-layout numbers show where the
  parser falls short.

## Revision notes (2026-09-16, after prototyping)

Everything in the plan was built and run in a scratch copy before the plan was
written. What that changed from the first approved draft:

- **Model:** PP-OCRv5 English mobile → **PP-OCRv6 small, per-box** (§8.4).
- **Balance check verifies amounts only**, not direction (§4.4); an
  unreadable header ends the previous date (§4.4); verification lifts only the
  amount's confidence (§4.6).
- **ONNX Runtime is loaded through a shim**, single-threaded (§3.2, §3.3).
- **Import counts go to `import_batches`**, not the audit log; the rows and
  the batch are one statement (§5, §6).
- **Review UI:** reason-named warning badges, a source dialog instead of a
  side panel, cards on phones (§7).
- **Eval** is a top-level project with a canvas-drawn synthetic set (§8).
