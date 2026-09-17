# Import benchmark — synthetic

Config: preset `v6-small`, engine `canvas-native`, strategy `per-line`. OCR time p50 234 ms, p95 378 ms (Node, cached runs keep their first timing).

| Layout | Images | Layout right | Rows (true / found) | Precision | Recall | Amount | Date | Type | Description | Category | **Silent amount errors** | Silent type errors | Unflagged extra rows | Parser unsure |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bank-list | 24 | 24 | 164 / 164 | 100.0% | 100.0% | 100.0% | 81.1% | 100.0% | 99.4% | 100.0% | **0 (0.0%)** | 0 (0.0%) | 0 | 0 |
| receipt | 24 | 24 | 24 / 24 | 100.0% | 100.0% | 100.0% | 83.3% | 100.0% | 100.0% | 100.0% | **0 (0.0%)** | 0 (0.0%) | 0 | 0 |

**Overall:** 188/188 rows found, amounts exact 100.0%, silent amount errors 0 (0.0%), silent type errors 0, unflagged extra rows 0.

## Rows that were wrong, missed or invented

### bank-pending-01.png

- wrong: expected `2026-09-09 2017.43 income PAYROLL DEPOSIT`, got `null 2017.43 income PAYROLL DEPOSIT` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-09 17.29 expense NETFLIX.COM`, got `null 17.29 expense NETFLIX.COM` flags [type_guessed, missing_date, low_confidence]

### bank-pending-02.png

- wrong: expected `2026-09-09 91.20 expense PRESTO FARE`, got `null 91.20 expense PRESTO FARE` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-09 42.43 expense LOCAL BAKERY`, got `null 42.43 expense LOCAL BAKERY` flags [type_guessed, missing_date, low_confidence]

### bank-pending-03.png

- wrong: expected `2026-09-14 1799.14 income INTEREST PAID`, got `null 1799.14 income INTEREST PAID` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-13 392.83 income PAYROLL DEPOSIT`, got `null 392.83 income PAYROLL DEPOSIT` flags [type_guessed, missing_date, low_confidence]

### bank-pending-05.png

- wrong: expected `2026-09-13 82.90 expense PRESTO FARE`, got `null 82.90 expense PRESTO FARE` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-13 2021.10 income E-TRANSFER RECEIVED`, got `null 2021.10 income E-TRANSFER RECEIVED` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-11 50.56 expense PRESTO FARE`, got `null 50.56 expense PRESTO FARE` flags [type_guessed, missing_date, low_confidence]

### bank-pending-06.png

- wrong: expected `2026-09-13 99.88 expense TIM HORTONS #2291`, got `null 99.88 expense TIM HORTONS #2291` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-13 1591.85 income PAYROLL DEPOSIT`, got `null 1591.85 income PAYROLL DEPOSIT` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-13 2050.06 income PAYROLL DEPOSIT`, got `null 2050.06 income PAYROLL DEPOSIT` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-13 44.71 expense SOBEYS #1234`, got `null 44.71 expense SOBEYS #1234` flags [type_guessed, missing_date, low_confidence]

### bank-pending-07.png

- wrong: expected `2026-09-14 9.24 expense W STORE UWATERLOO`, got `null 9.24 expense W STORE UWATERLOO` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-14 32.73 expense CINEPLEX`, got `null 32.73 expense CINEPLEX` flags [type_guessed, missing_date, low_confidence]

### bank-signed-01.png

- wrong: expected `2026-09-14 115.79 expense SHOPPERS DRUG MART`, got `null 115.79 expense SHOPPERS DRUG MART` flags [missing_date, low_confidence]

### bank-signed-02.png

- wrong: expected `2026-09-14 87.62 expense FARM BOY`, got `null 87.62 expense FARM BOY` flags [missing_date, low_confidence]
- wrong: expected `2026-09-14 145.77 expense AMAZON.CA`, got `null 145.77 expense AMAZON.CA` flags [missing_date, low_confidence]
- wrong: expected `2026-09-14 20.08 expense SOBEYS #1234`, got `null 20.08 expense SOBEYS #1234` flags [missing_date, low_confidence]
- wrong: expected `2026-09-14 1157.58 income E-TRANSFER RECEIVED`, got `null 1157.58 income E-TRANSFER RECEIVED` flags [missing_date, low_confidence]
- wrong: expected `2026-09-12 52.89 expense SHOPPERS DRUG MART`, got `null 52.89 expense SHOPPERS DRUG MART` flags [missing_date, low_confidence]
- wrong: expected `2026-09-12 9.61 expense TIM HORTONS #2291`, got `null 9.61 expense TIM HORTONS #2291` flags [missing_date, low_confidence]

### bank-signed-03.png

- wrong: expected `2026-09-09 1.21 expense W STORE UWATERLOO`, got `null 1.21 expense W STORE UWATERLOO` flags [missing_date, low_confidence]
- wrong: expected `2026-09-09 90.84 expense FARM BOY`, got `null 90.84 expense FARM BOY` flags [missing_date, low_confidence]

### bank-signed-04.png

- wrong: expected `2026-09-10 2.62 expense SHOPPERS DRUG MART`, got `null 2.62 expense SHOPPERS DRUG MART` flags [missing_date, low_confidence]
- wrong: expected `2026-09-10 15.21 expense LOCAL BAKERY`, got `null 15.21 expense LOCAL BAKERY` flags [missing_date, low_confidence]

### bank-signed-06.png

- wrong: expected `2026-09-13 33.52 expense CINEPLEX`, got `null 33.52 expense CINEPLEX` flags [missing_date, low_confidence]

### bank-signed-08.png

- wrong: expected `2026-09-14 77.61 expense SOBEYS #1234`, got `null 77.61 expense SOBEYS #1234` flags [missing_date, low_confidence]
- wrong: expected `2026-09-14 24.92 expense PRESTO FARE`, got `null 24.92 expense PRESTO FARE` flags [missing_date, low_confidence]
- wrong: expected `2026-09-12 146.49 income PAYROLL DEPOSIT`, got `null 146.49 income PAYROLL DEPOSIT` flags [missing_date, low_confidence]
- wrong: expected `2026-09-11 6.91 expense LOCAL BAKERY`, got `null 6.91 expense LOCAL BAKERY` flags [missing_date, low_confidence]

### receipt-07.png

- wrong: expected `2026-09-08 33.94 expense CAFE PYRENEES`, got `null 33.94 expense CAFE PYRENEES` flags [arithmetic_verified, missing_date, low_confidence]

### receipt-11.png

- wrong: expected `2026-09-11 57.61 expense SOBEYS`, got `null 57.61 expense SOBEYS` flags [arithmetic_verified, missing_date, low_confidence]

### receipt-18.png

- wrong: expected `2026-09-12 66.04 expense SHOPPERS DRUG MART`, got `null 66.04 expense SHOPPERS DRUG MART` flags [arithmetic_verified, missing_date, low_confidence]

### receipt-21.png

- wrong: expected `2026-09-07 45.54 expense SOBEYS`, got `null 45.54 expense SOBEYS` flags [arithmetic_verified, missing_date, low_confidence]

