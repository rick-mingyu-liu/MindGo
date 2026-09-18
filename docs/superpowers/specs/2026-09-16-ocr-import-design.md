# Screenshot Import (OCR) — Design

**Date:** 2026-09-16 · **Status:** implemented 2026-09-16 on feat/ocr-import (Task 16, the LLM fallback, not built); extended 2026-09-17 with real-screenshot fixes and the Uber, Uber Eats and WeChat Pay layouts (see *Revision notes (2026-09-17)*) · **Branch:** `feat/ocr-import` · **Plan:** `docs/superpowers/plans/2026-09-16-ocr-import.md` — untracked; recoverable from git history

## 1. Goal

A new **Import** page where a user drops in screenshots of Canadian bank-app
transaction lists, photos of paper receipts, or screenshots of Uber's trip
activity, Uber Eats' past orders or WeChat Pay's transaction list, reviews the
transactions that
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

Alipay bills, credit-card statement pages, PDFs, a native mobile app, learned
categorisation, server-side draft persistence, a server-side OCR path,
multi-threaded or GPU inference. WeChat Pay's transaction list was added on
2026-09-17 (§4.9) as a new parser layout with no model change, since PP-OCRv6's
dictionary covers Chinese; Alipay would be the same kind of change. Uber Eats'
*Past items* tab is deliberately not a layout: it shows today's menu prices
and no dates, so nothing on it is a charge (§4.8).

## 2. Architecture

```
Browser (/import)                                          Node API (Render)
  drop / paste screenshot
  Web Worker: ppu-paddle-ocr + ONNX Runtime Web (WASM, 1 thread)
    PP-OCRv6 small det + rec → lines [{text, conf, box}]
  ── POST /import/parse { today, model, image:{w,h}, lines } ──▶ auth, importLimiter, validate payload
                                                                 parser: rows → tokens → classify → bankList | receipt | uberActivity | uberEats | wechat
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
  { "name": "PP-OCRv6_small", "preset": "v6-small", "engine": "canvas-native", "strategy": "per-box",
    "files": { "detection": "PP-OCRv6_small_det.ort", "recognition": "PP-OCRv6_small_rec.ort",
               "charactersDictionary": "ppocrv6_dict.txt" } }
  ```

  The web build of the library always uses the canvas-native engine (it has no
  OpenCV), so the profile names it and the benchmark runs it.

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

Pure functions, one purpose per module. §4.1–4.7 were implemented and tested
in the plan; §4.8–4.9 and the rules marked *(2026-09-17)* came from real
screenshots afterwards. This section states the rules.

Several rules below compare a vertical **gap** between two lines with a line
**height**. Every such threshold was set from measured boxes, with the
synthetic set's nearest opposite case recorded next to it, so a change can be
checked against both.

### 4.1 `rows.js` — boxes to visual rows

- **Icons are dropped first** *(2026-09-17)*. A box holding one character that
  is not a Latin letter, a digit, a sign or a currency symbol is an icon the
  model tried to read: a shopping bag came back as `凸` at up to 0.96
  confidence, so confidence cannot tell them apart. A lone `A`, `7`, `-`, `$`
  or `¥` is kept.
- A line joins the row above when their vertical extents overlap by at least
  half the shorter one **and** the line's middle lies inside the row so far
  *(2026-09-17)*. Without the second rule a tall chevron straddling an amount
  and the balance beneath it widened the row until it swallowed the next
  line, and the two amounts came back in the wrong order.
- Within a row, lines read **top line first, then left to right**
  *(2026-09-17)*; ordering by x alone put a wrapped second line first when it
  started a pixel further left.
- Each row keeps its lines, bounding box, height and minimum confidence.

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
  refused as ambiguous). Spaces OCR squeezes out are put back first
  *(2026-09-17)*: `SEP15,2026`, `SEP 16,2026` and `14SEP` all read. A day with no year is the most recent such day not
  after `today`, and is marked `inferredYear`. No `Date` objects: civil-date
  integer arithmetic, so the server's timezone never matters (tested in four
  timezones).

### 4.3 `classify.js` — layout

Counts signals for each layout; the layout is the largest count and confidence
is its share of all signals. A tie goes to the earlier layout in this list. No
signals at all is `unknown`.

| Layout | Signals |
|---|---|
| `receipt` | `SUBTOTAL`, `TOTAL`, tax names, `TIP`, `CHANGE`, card brands, masked card numbers, `THANK YOU`, a total line (+2) |
| `bank-list` | `Pending`, `Posted`, `Balance`, `Transactions`, `e-Transfer`, date rows (up to 3), three or more rows ending in an amount (+2) |
| `uber-activity` | `Rebook`, an `Activity` title, rows dated with a time (`Sep 16 • 6:14 p.m.`, up to 3) |
| `uber-eats-orders` | `View store`, `Past orders`, order lines (`Mar 15 • $60.54 • 1 item`, up to 3). **Counted only when at least one order line exists**, because the tab labels also appear on the Past items tab |
| `wechat-pay` | WeChat words (`微信`, `零钱`, `转账`, `红包`), `Expenditures`/`Incomes` or `支出`/`收入`, `M/D HH:MM` lines (up to 3), a `2026/9` month header. **Counted only when both the words and a date-time line are present**, so another app's `9/13 20:23` does not trip it |

The date-and-time and order-line matchers belong to their parsers and are
imported by the classifier, so the two cannot disagree about what a line is.

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
- **Balance beneath the amount** *(2026-09-17)*. Some apps (RBC) stack an
  entry: the amount on the right with the running balance directly under it.
  A row holding one amount that sits right under the previous entry's amount,
  right edges aligned, with a gap under **0.4** of the amount's height, is
  that entry's balance, and its text continues the entry's description.
  Measured: 0.26–0.27 for a stacked balance; never below 0.85 between
  single-line transactions in the synthetic set.
- **A description that wraps** *(2026-09-17)* puts its second line on a row of
  its own with no amount. Tucked under the description (same 0.4 cut-off,
  left edges aligned) it continues that description instead of ending the
  date header. Measured: 0.04 for a wrapped name; never below 0.97 for the
  date header after a transaction.
- **Rows of pure symbols** (chevrons, icons) are skipped rather than read as
  headers, and symbol-only lines never join a description *(2026-09-17)*.
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
  frontend list); no confident match → `null`. **A parser that sets
  `category` itself — including to `null` — wins over the keyword guess**
  *(2026-09-17)*: an Uber trip to "The Toronto Clinic" is Transportation, not
  Healthcare, and an Uber Eats order from an unknown store must not become
  Dining Out because its description starts with "Uber Eats".
- **Direction.** On a bank list an unsigned amount is always `type_guessed`
  (§4.4). A receipt, an Uber trip and an Uber Eats order are charges by
  layout, so their rows are expenses without that flag. WeChat Pay prints its
  own `+` and `−`, and only its unsigned amounts are guessed (§4.9).
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

### 4.8 `uberActivity.js` and `uberEats.js` *(2026-09-17)*

Both work on **lines**, not rows, where logos and buttons share rows with the
text that matters. "Tucked" below means a gap of under half the smaller
line's height.

**Uber trips** (`uber-activity`):

```
The Toronto Clinic            <- destination, may wrap
Sep 16 • 6:14 p.m.   Rebook   <- date and time, beside a button
$10.38                        <- the fare, alone on its line
```

- A trip is a date-and-time line (`•` or `·`, then `h:mm a.m./p.m.`) with a
  lone fare tucked under it. The destination is the run of text lines tucked
  above it (measured 0.02–0.34 inside a card; over 1.0 from the map's street
  names above the first card).
- Buttons (`Rate`, `Rebook`, `Help`, `Details`, `Receipt`) are removed first.
- Every row is an expense, category **Transportation**, description
  `Uber: <destination>`. `$0.00` (cancelled) is skipped.

**Uber Eats orders** (`uber-eats-orders`, the *Past orders* tab):

```
[logo]  Shoppers Drug Mart            <- store
        Mar 15 • $60.54 • 1 item      <- date, total paid, item count
        Ankle Brace, Medium ...       <- first items     [View store]
```

- An order is its date-total-count line, squeezed forms included
  (`Mar15·$60.54·1item`, `23 item s`). The store is the text tucked above it
  **in the same column** (left edges within a line height): the logo is read
  as text too (`SHOPPERS`, `LCBO`) and sits further left. Measured 0.19–0.28
  from a store to its order line; over 1.5 from the previous order's last
  item line.
- The total is what was charged, fees and tip included. Item names are not
  kept. Every row is an expense, description `Uber Eats: <store>`, category
  from the **store name alone**, else `null`.

These rides and orders are also on the card statement; the only protection
against importing both is `possible_duplicate` (same day, amount and
currency), which misses a charge posted on a different day (§11).

### 4.9 `wechat.js` *(2026-09-17)*

```
2026/9        Expenditures¥485.00  Incomes¥485.00   <- month header
[avatar]  微信红包-来自张三                  +120.00    <- description, amount
          9/13 20:23                                <- date and time
```

- A transaction is a row holding an amount with an `M/D HH:MM` line under its
  description (gap under one description-line height, left edges aligned;
  measured 0.4–0.63 of the smaller line, over 1.5 to the next description).
  A date line that a tall amount box pulled onto the description's row is
  still a date, never description.
- **Year** from the nearest `YYYY/M` month header above; with none above, the
  most recent such day, flagged as inferred.
- **Currency is always `CNY`**: a WeChat Pay balance holds nothing else, and
  the headers print `¥`.
- **Amounts** always have two decimals, so one stray character after them
  (`+150.00.`, `+4.801`, measured) is dropped and the row is flagged
  `corrected_chars`, with amount confidence × 0.8.
- **Direction:** `+` income, `−` expense. Unsigned amounts are moves between
  the user's own balances (`零钱通转出-到零钱`, which WeChat's own monthly totals
  leave out); they are guessed from their words (`来自`, `收款`, `退款`,
  `到零钱` → income, else expense) and flagged `type_guessed`.
- Not built: checking a month's rows against the header's `Expenditures` and
  `Incomes` totals, which would verify repaired amounts the way running
  balances do on a bank list.

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
   parsing / done / failed, layout (*Bank list*, *Receipt*, *Uber trips*,
   *Uber Eats orders*, *WeChat Pay*, *Unrecognised layout*) and read time,
   with *Try again* and remove.
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
  `.truth.json`. Never committed or uploaded; OCR runs locally. The fixtures
  built from them for the backend tests keep the measured boxes and OCR
  quirks but replace names, places and reference numbers.

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
| v6 small, per-line, canvas engine | 164/164 | 81.1% | 24/24 | 83.3% | 0 / 0 |
| v6 small, per-box, OpenCV engine | 164/164 | 100% | 24/24 | 79.2% | 0 / 0 |
| **v6 small, per-box, canvas engine (shipped)** | **164/164** | **100%** | **24/24** | **79.2%** | **0 / 0** |

All amounts that were found were exact in the shipped configuration. Of the
five receipt dates it misses, four are printed as an ambiguous `MM/DD/YYYY`
with a day of 12 or less, which the parser refuses as ambiguous and flags
`missing_date` — by design; the fifth is printed as `YYYY/MM/DD` merged with
the receipt's printed time (`2026/09/08 12:31`), which OCR read as one token
the parser does not recognise as a date, so it is flagged `missing_date` too.
Synthetic images are clean; the private set is what measures real screenshots
and photos.

### 8.5 Real screenshots (private set, 2026-09-17)

Seven screenshots, shipped profile, after the 2026-09-17 changes (the
synthetic results above were unchanged by them):

| Screenshot | Layout | Rows (true / found) | Amount, date, type exact | Silent errors |
|---|---|---|---|---|
| RBC account, balance under each amount | bank-list | 2 / 2 | yes | 0 |
| Wealthsimple card, icons, wrapped merchant | bank-list | 7 / 7 | yes | 0 |
| Uber trip activity | uber-activity | 5 / 5 | yes | 0 |
| Uber Eats past orders | uber-eats-orders | 6 / 6 | yes | 0 |
| Uber Eats past items (no charges) | unknown | 0 / 0 | — | 0 |
| WeChat Pay transactions | wechat-pay | 7 / 7 | yes | 0 |

Before the changes, the RBC screenshot was classified as a receipt with no
rows, the Wealthsimple rows carried icon characters and were all *Hard to
read*, the Uber rows had no date or description, and the WeChat Pay
screenshot lost three rows and every date and read as CAD. The browser's OCR
output can differ slightly from Node's on the same image (seen once: a date
line grouped onto its description's row), which is why the WeChat parser
tolerates that case.

## 9. Testing

- **Parser** — `importTokens`, `importRows`, `importClassify`,
  `importBankList`, `importReceipt`, `importUberActivity`, `importUberEats`,
  `importWechat`, `importParse` tests, with hand-built layouts in
  `test/helpers/ocrLayouts.js` — five of them (`stackedBalanceLines`,
  `iconListLines`, `uberActivityLines`, `uberEatsOrderLines`,
  `wechatPayLines`) copied from real screenshots' OCR boxes with the personal
  details replaced.
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
  in Chrome: the full flow, source dialog, the import itself (16 rows plus one
  `import_batches` record checked in the database), duplicates re-flagged on a
  second import, paste, `zh`, dark theme, and a 390 px viewport.
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
  parser falls short. Every layout added so far needed at least one
  measured-gap rule (§4.1, §4.4, §4.8, §4.9); a new bank app should be
  expected to need its own.
- **Double counting.** Uber trips and Uber Eats orders are also card
  charges. `possible_duplicate` matches only the same day, amount and
  currency, so a charge posted a day later is not flagged.
- **Browser and Node OCR differ slightly** on the same image, so the
  benchmark is close to, not identical with, what a user sees.

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

## Revision notes (2026-09-17, from real screenshots)

- **Row grouping** requires a line's middle inside the row, reads rows top
  line first, and drops single-character icons (§4.1).
- **Squeezed dates** parse (§4.2).
- **Bank lists** read a balance stacked under its amount, join a wrapped
  description, and skip symbol-only rows (§4.4).
- **New layouts:** Uber trips and Uber Eats past orders (§4.8), WeChat Pay in
  CNY (§4.9); the classifier gates the last two on their own evidence (§4.3).
- **A parser's own category wins** over the keyword guess, and direction is
  guessed only where a layout leaves it open (§4.6).
- **Evidence:** seven real screenshots, all read correctly (§8.5).
