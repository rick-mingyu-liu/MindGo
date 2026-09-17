# Import benchmark — synthetic

Config: preset `v5-en-mobile`, engine `opencv`, strategy `per-box`. OCR time p50 163 ms, p95 259 ms (Node, cached runs keep their first timing).

| Layout | Images | Layout right | Rows (true / found) | Precision | Recall | Amount | Date | Type | Description | Category | **Silent amount errors** | Silent type errors | Unflagged extra rows | Parser unsure |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bank-list | 24 | 24 | 164 / 160 | 100.0% | 97.6% | 100.0% | 83.1% | 99.4% | 91.3% | 95.8% | **0 (0.0%)** | 0 (0.0%) | 0 | 0 |
| receipt | 24 | 23 | 24 / 23 | 78.3% | 75.0% | 100.0% | 50.0% | 100.0% | 83.3% | 83.3% | **0 (0.0%)** | 0 (0.0%) | 0 | 6 |

**Overall:** 178/188 rows found, amounts exact 100.0%, silent amount errors 0 (0.0%), silent type errors 0, unflagged extra rows 0.

## Rows that were wrong, missed or invented

### bank-pending-01.png

- wrong: expected `2026-09-15 102.82 expense NETFLIX.COM`, got `null 102.82 expense NETFLIX.COM` flags [type_guessed, missing_date, low_confidence]

### bank-pending-02.png

- wrong: expected `2026-09-13 1008.62 income INTEREST PAID`, got `2026-09-13 1008.62 expense INTERESTPAID` flags [type_guessed, low_confidence]

### bank-pending-03.png

- wrong: expected `2026-09-15 60.29 expense UBER EATS`, got `2026-09-16 60.29 expense UBER EATS` flags [type_guessed]

### bank-pending-05.png

- missed: `2026-09-13 2021.10 income E-TRANSFER RECEIVED`

### bank-pending-06.png

- wrong: expected `2026-09-15 3.46 expense W STORE UWATERLOO`, got `2026-09-16 3.46 expense W STORE UWATERLOO` flags [type_guessed]
- wrong: expected `2026-09-15 1269.63 income PAYROLL DEPOSIT`, got `2026-09-16 1269.63 income PAYROLL DEPOSIT` flags [type_guessed]
- wrong: expected `2026-09-15 84.76 expense PRESTO FARE`, got `2026-09-16 84.76 expense PRESTO FARE` flags [type_guessed]
- wrong: expected `2026-09-13 2050.06 income PAYROLL DEPOSIT`, got `null 2050.06 income PAYROLL DEPOSIT` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-13 44.71 expense SOBEYS #1234`, got `null 44.71 expense SOBEYS #1234` flags [type_guessed, missing_date, low_confidence]
- missed: `2026-09-13 1591.85 income PAYROLL DEPOSIT`

### bank-pending-08.png

- wrong: expected `2026-09-15 336.50 income INTEREST PAID`, got `null 336.50 income INTEREST PAID` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-15 117.69 expense FARM BOY`, got `null 117.69 expense FARM BOY` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-14 1694.74 income INTEREST PAID`, got `null 1694.74 income INTEREST PAID` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-14 76.96 expense FARM BOY`, got `null 76.96 expense FARM BOY` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-14 144.84 expense AMAZON.CA`, got `null 144.84 expense AMAZON.CA` flags [type_guessed, missing_date, low_confidence]
- missed: `2026-09-12 1999.83 income PAYROLL DEPOSIT`

### bank-signed-01.png

- wrong: expected `2026-09-16 145.29 expense CINEPLEX`, got `null 145.29 expense CINEPLEX` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-16 64.44 expense W STORE UWATERLOO`, got `null 64.44 expense W STORE UWATERLOO` flags [missing_date, low_confidence]
- wrong: expected `2026-09-14 115.79 expense SHOPPERS DRUG MART`, got `null 115.79 expense SHOPPERS DRUG MART` flags [missing_date, low_confidence]

### bank-signed-03.png

- wrong: expected `2026-09-15 1217.98 income E-TRANSFER RECEIVED`, got `2026-09-16 1217.98 income E-TRANSFER RECEIVED` flags [low_confidence]

### bank-signed-06.png

- wrong: expected `2026-09-16 81.78 expense PRESTO FARE`, got `null 81.78 expense PRSTOFARE` flags [missing_date, low_confidence]
- wrong: expected `2026-09-16 2427.86 income E-TRANSFER RECEIVED`, got `null 2427.86 income E-TRANSFER RECEIVED` flags [missing_date, low_confidence]
- wrong: expected `2026-09-16 4.33 expense AMAZON.CA`, got `null 4.33 expense AMAZON.CA` flags [missing_date, low_confidence]
- wrong: expected `2026-09-16 95.06 expense LOCAL BAKERY`, got `null 95.06 expense LOCAL BAKERY` flags [missing_date, low_confidence]
- wrong: expected `2026-09-16 148.19 expense PRESTO FARE`, got `null 148.19 expense PRESTOFARE` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-15 147.61 expense FARM BOY`, got `null 147.61 expense FARM BOY` flags [missing_date, low_confidence]

### bank-signed-07.png

- wrong: expected `2026-09-16 78.70 expense W STORE UWATERLOO`, got `null 78.70 expense W STORE UWATERLOO` flags [missing_date, low_confidence]
- wrong: expected `2026-09-16 83.45 expense PRESTO FARE`, got `null 83.45 expense PRESTO FARE` flags [missing_date, low_confidence]
- wrong: expected `2026-09-15 80.68 expense NETFLIX.COM`, got `null 80.68 expense NETFLIX.COM` flags [missing_date, low_confidence]
- wrong: expected `2026-09-15 131.79 expense PRESTO FARE`, got `null 131.79 expense PRESTO FARE` flags [missing_date, low_confidence]
- missed: `2026-09-15 1320.09 income E-TRANSFER RECEIVED`

### bank-signed-08.png

- wrong: expected `2026-09-15 67.96 expense ROGERS WIRELESS`, got `null 67.96 expense ROGERS WIRELESS` flags [missing_date, low_confidence]

### receipt-03.png

- missed: `2026-09-16 9.40 expense TIM HORTONS`

### receipt-04.png

- missed: `2026-09-09 42.18 expense TIM HORTONS`

### receipt-07.png

- missed: `2026-09-08 33.94 expense CAFE PYRENEES`

### receipt-08.png

- wrong: expected `2026-09-09 71.18 expense TIM HORTONS`, got `null 71.18 expense TIM HORTONS` flags [missing_date, low_confidence]

### receipt-09.png

- missed: `2026-09-09 32.56 expense SHOPPERS DRUG MART`

### receipt-10.png

- wrong: expected `2026-09-08 42.80 expense SHOPPERS DRUG MART`, got `null 42.80 expense SHOPPERS DRUG MART` flags [missing_date, low_confidence]

### receipt-11.png

- wrong: expected `2026-09-11 57.61 expense SOBEYS`, got `null 57.61 expense SOBEYS` flags [arithmetic_verified, missing_date, low_confidence]

### receipt-13.png

- wrong: expected `2026-09-07 82.57 expense SHOPPERS DRUG MART`, got `null 82.57 expense SHOPPERS DRUG MART` flags [arithmetic_verified, missing_date, low_confidence]

### receipt-16.png

- wrong: expected `2026-09-08 55.58 expense SHOPPERS DRUG MART`, got `null 55.58 expense SHOPPERS DRUG MART` flags [arithmetic_verified, missing_date, low_confidence]

### receipt-17.png

- missed: `2026-09-11 46.94 expense DOLLARAMA`

### receipt-18.png

- wrong: expected `2026-09-12 66.04 expense SHOPPERS DRUG MART`, got `null 66.04 expense SHOPPERS DRUG MART` flags [arithmetic_verified, missing_date, low_confidence]

### receipt-19.png

- wrong: expected `2026-09-14 19.57 expense DOLLARAMA`, got `null 19.57 expense DOLLARAMA` flags [arithmetic_verified, missing_date, low_confidence]

### receipt-20.png

- wrong: expected `2026-09-15 60.17 expense DOLLARAMA`, got `null 60.17 expense DOLLARAMA` flags [arithmetic_verified, missing_date, low_confidence]

### receipt-21.png

- wrong: expected `2026-09-07 45.54 expense SOBEYS`, got `null 45.54 expense TOTA` flags [type_guessed, missing_date, low_confidence]
- extra: `null 10.16 expense COFFEE` flags [type_guessed, missing_date, low_confidence]
- extra: `null 14.81 expense ` flags [type_guessed, missing_date, low_confidence]
- extra: `null 15.33 expense ` flags [type_guessed, missing_date, low_confidence]
- extra: `null 40.30 expense ` flags [type_guessed, missing_date, low_confidence]
- extra: `null 5.24 expense HST 13%` flags [type_guessed, missing_date, low_confidence]

### receipt-23.png

- missed: `2026-09-16 45.20 expense SHOPPERS DRUG MART`

