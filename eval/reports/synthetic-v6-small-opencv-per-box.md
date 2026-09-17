# Import benchmark — synthetic

Config: preset `v6-small`, engine `opencv`, strategy `per-box`. OCR time p50 201 ms, p95 323 ms (Node, cached runs keep their first timing).

| Layout | Images | Layout right | Rows (true / found) | Precision | Recall | Amount | Date | Type | Description | Category | **Silent amount errors** | Silent type errors | Unflagged extra rows | Parser unsure |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bank-list | 24 | 24 | 164 / 164 | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 96.3% | 100.0% | **0 (0.0%)** | 0 (0.0%) | 0 | 0 |
| receipt | 24 | 24 | 24 / 24 | 100.0% | 100.0% | 100.0% | 79.2% | 100.0% | 100.0% | 100.0% | **0 (0.0%)** | 0 (0.0%) | 0 | 0 |

**Overall:** 188/188 rows found, amounts exact 100.0%, silent amount errors 0 (0.0%), silent type errors 0, unflagged extra rows 0.

## Rows that were wrong, missed or invented

### receipt-07.png

- wrong: expected `2026-09-08 33.94 expense CAFE PYRENEES`, got `null 33.94 expense CAFE PYRENEES` flags [arithmetic_verified, missing_date, low_confidence]

### receipt-10.png

- wrong: expected `2026-09-08 42.80 expense SHOPPERS DRUG MART`, got `null 42.80 expense SHOPPERS DRUG MART` flags [arithmetic_verified, missing_date, low_confidence]

### receipt-11.png

- wrong: expected `2026-09-11 57.61 expense SOBEYS`, got `null 57.61 expense SOBEYS` flags [arithmetic_verified, missing_date, low_confidence]

### receipt-18.png

- wrong: expected `2026-09-12 66.04 expense SHOPPERS DRUG MART`, got `null 66.04 expense SHOPPERS DRUG MART` flags [arithmetic_verified, missing_date, low_confidence]

### receipt-21.png

- wrong: expected `2026-09-07 45.54 expense SOBEYS`, got `null 45.54 expense SOBEYS` flags [arithmetic_verified, missing_date, low_confidence]

