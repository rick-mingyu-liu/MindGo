# Import benchmark — synthetic

Config: preset `v5-en-mobile`, engine `canvas-native`, strategy `per-line`. OCR time p50 199 ms, p95 302 ms (Node, cached runs keep their first timing).

| Layout | Images | Layout right | Rows (true / found) | Precision | Recall | Amount | Date | Type | Description | Category | **Silent amount errors** | Silent type errors | Unflagged extra rows | Parser unsure |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bank-list | 24 | 24 | 164 / 163 | 100.0% | 99.4% | 100.0% | 62.6% | 100.0% | 93.3% | 95.1% | **0 (0.0%)** | 0 (0.0%) | 0 | 0 |
| receipt | 24 | 23 | 24 / 15 | 100.0% | 62.5% | 100.0% | 46.7% | 100.0% | 93.3% | 93.3% | **0 (0.0%)** | 0 (0.0%) | 0 | 9 |

**Overall:** 178/188 rows found, amounts exact 100.0%, silent amount errors 0 (0.0%), silent type errors 0, unflagged extra rows 0.

## Rows that were wrong, missed or invented

### bank-pending-01.png

- wrong: expected `2026-09-16 14.08 expense TIM HORTONS #2291`, got `null 14.08 expense TIM HORTONS #2291` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-11 10.51 expense AMAZON.CA`, got `null 10.51 expense AMAZON.CA` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-11 64.24 expense NETFLIX.COM`, got `null 64.24 expense NETFLIX.COM` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-09 2017.43 income PAYROLL DEPOSIT`, got `null 2017.43 income PAYROLL DEPOSIT` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-09 17.29 expense NETFLIX.COM`, got `null 17.29 expense NETFLIX.COM` flags [type_guessed, missing_date, low_confidence]

### bank-pending-02.png

- wrong: expected `2026-09-13 1008.62 income INTEREST PAID`, got `null 1008.62 income INTEREST PAID` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-10 17.53 expense SHOPPERS DRUG MART`, got `null 17.53 expense SHOPPERS DRUG MART` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-09 91.20 expense PRESTO FARE`, got `null 91.20 expense PRESTO FARE` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-09 42.43 expense LOCAL BAKERY`, got `null 42.43 expense LOCAL BAKERY` flags [type_guessed, missing_date, low_confidence]

### bank-pending-03.png

- wrong: expected `2026-09-15 60.29 expense UBER EATS`, got `2026-09-16 60.29 expense UBER EATS` flags [type_guessed, low_confidence]
- wrong: expected `2026-09-14 1799.14 income INTEREST PAID`, got `null 1799.14 income INTEREST PAID` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-13 392.83 income PAYROLL DEPOSIT`, got `null 392.83 income PAYROLL DEPOSIT` flags [type_guessed, missing_date, low_confidence]

### bank-pending-04.png

- wrong: expected `2026-09-15 1418.28 income PAYROLL DEPOSIT`, got `2026-09-16 1418.28 income PAYROLL DEPOSIT` flags [type_guessed, low_confidence]
- wrong: expected `2026-09-15 47.19 expense CINEPLEX`, got `2026-09-16 47.19 expense CINEPLEX` flags [type_guessed, low_confidence]
- wrong: expected `2026-09-15 47.20 expense TIM HORTONS #2291`, got `2026-09-16 47.20 expense TIM HORTONS #2291` flags [type_guessed, low_confidence]
- missed: `2026-09-15 134.94 expense CINEPLEX`

### bank-pending-05.png

- wrong: expected `2026-09-14 116.67 expense SHOPPERS DRUG MART`, got `null 116.67 expense SHOPPERS DRUG MART` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-14 51.67 expense ROGERS WIRELESS`, got `null 51.67 expense ROGERS WIRELESS` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-14 83.60 expense PRESTO FARE`, got `null 83.60 expense PRESTO FARE` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-13 82.90 expense PRESTO FARE`, got `null 82.90 expense PRESTO FARE` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-13 2021.10 income E-TRANSFER RECEIVED`, got `null 2021.10 income E-TRANSFER RECEIVED` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-11 50.56 expense PRESTO FARE`, got `null 50.56 expense PRESTO FARE` flags [type_guessed, missing_date, low_confidence]

### bank-pending-06.png

- wrong: expected `2026-09-15 3.46 expense W STORE UWATERLOO`, got `null 3.46 expense W STORE UWATERLOO` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-15 1269.63 income PAYROLL DEPOSIT`, got `null 1269.63 income PAYROLL DEPOSIT` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-15 84.76 expense PRESTO FARE`, got `null 84.76 expense PRESTO FARE` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-13 99.88 expense TIM HORTONS #2291`, got `null 99.88 expense TIM HORTONS #2291` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-13 1591.85 income PAYROLL DEPOSIT`, got `null 1591.85 income PAYROLL DEPOSIT` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-13 2050.06 income PAYROLL DEPOSIT`, got `null 2050.06 income PAYROLL DEPOSIT` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-13 44.71 expense SOBEYS #1234`, got `null 44.71 expense SOBEYS #1234` flags [type_guessed, missing_date, low_confidence]

### bank-pending-07.png

- wrong: expected `2026-09-14 9.24 expense W STORE UWATERLOO`, got `null 9.24 expense W STORE UWATERLOO` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-14 32.73 expense CINEPLEX`, got `null 32.73 expense CINEPLEX` flags [type_guessed, missing_date, low_confidence]

### bank-pending-08.png

- wrong: expected `2026-09-15 336.50 income INTEREST PAID`, got `null 336.50 income INTEREST PAID` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-15 117.69 expense FARM BOY`, got `null 117.69 expense FARM BOY` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-14 1694.74 income INTEREST PAID`, got `null 1694.74 income INTEREST PAID` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-14 76.96 expense FARM BOY`, got `null 76.96 expense FARM BOY` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-14 144.84 expense AMAZON.CA`, got `null 144.84 expense AMAZON.CA` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-12 1999.83 income PAYROLL DEPOSIT`, got `null 1999.83 income PAYROLL DEPOSIT` flags [type_guessed, missing_date, low_confidence]

### bank-signed-01.png

- wrong: expected `2026-09-15 61.16 expense TIM HORTONS #2291`, got `null 61.16 expense TIM HORTONS #2291` flags [missing_date, low_confidence]
- wrong: expected `2026-09-15 215.06 income INTEREST PAID`, got `null 215.06 income INTEREST PAID` flags [missing_date, low_confidence]
- wrong: expected `2026-09-15 29.44 expense NETFLIX.COM`, got `null 29.44 expense NETFLIX.COM` flags [missing_date, low_confidence]
- wrong: expected `2026-09-15 120.00 expense ROGERS WIRELESS`, got `null 120.00 expense ROGERS WIRELESS` flags [missing_date, low_confidence]
- wrong: expected `2026-09-15 82.37 expense ROGERS WIRELESS`, got `null 82.37 expense ROGERS WIRELESS` flags [missing_date, low_confidence]

### bank-signed-02.png

- wrong: expected `2026-09-15 17.99 expense LOCAL BAKERY`, got `2026-09-16 17.99 expense LOCAL BAKERY` flags [low_confidence]
- wrong: expected `2026-09-12 52.89 expense SHOPPERS DRUG MART`, got `null 52.89 expense SHOPPERS DRUG MART` flags [missing_date, low_confidence]
- wrong: expected `2026-09-12 9.61 expense TIM HORTONS #2291`, got `null 9.61 expense TIM HORTONS #2291` flags [missing_date, low_confidence]

### bank-signed-03.png

- wrong: expected `2026-09-16 114.69 expense SOBEYS #1234`, got `null 114.69 expense SOBEYS #1234` flags [missing_date, low_confidence]
- wrong: expected `2026-09-16 40.23 expense TIM HORTONS #2291`, got `null 40.23 expense TIM HORTONS #2291` flags [missing_date, low_confidence]
- wrong: expected `2026-09-11 2.73 expense UBER EATS`, got `null 2.73 expense UBER EATS` flags [missing_date, low_confidence]

### bank-signed-04.png

- wrong: expected `2026-09-15 103.93 expense ROGERS WIRELESS`, got `null 103.93 expense ROGERS WIRELESS` flags [missing_date, low_confidence]
- wrong: expected `2026-09-10 2.62 expense SHOPPERS DRUG MART`, got `null 2.62 expense SHOPPERS DRUG MART` flags [missing_date, low_confidence]
- wrong: expected `2026-09-10 15.21 expense LOCAL BAKERY`, got `null 15.21 expense LOCAL BAKERY` flags [missing_date, low_confidence]

### bank-signed-05.png

- wrong: expected `2026-09-15 89.23 expense TIM HORTONS #2291`, got `null 89.23 expense TIM HORTONS #2291` flags [missing_date, low_confidence]
- wrong: expected `2026-09-10 130.51 expense PRESTO FARE`, got `null 130.51 expense PRESTO FARE` flags [missing_date, low_confidence]

### bank-signed-06.png

- wrong: expected `2026-09-15 147.61 expense FARM BOY`, got `2026-09-16 147.61 expense FARM BOY` flags [type_guessed, low_confidence]

### bank-signed-07.png

- wrong: expected `2026-09-15 1320.09 income E-TRANSFER RECEIVED`, got `null 1320.09 income E-TRANSFER RECEIVED` flags [missing_date, low_confidence]
- wrong: expected `2026-09-15 80.68 expense NETFLIX.COM`, got `null 80.68 expense NETFLIX.COM` flags [missing_date, low_confidence]
- wrong: expected `2026-09-15 131.79 expense PRESTO FARE`, got `null 131.79 expense PRESTO FARE` flags [missing_date, low_confidence]

### bank-signed-08.png

- wrong: expected `2026-09-15 67.96 expense ROGERS WIRELESS`, got `null 67.96 expense ROGERS WIRELESS` flags [missing_date, low_confidence]
- wrong: expected `2026-09-14 77.61 expense SOBEYS #1234`, got `null 77.61 expense SOBEYS #1234` flags [missing_date, low_confidence]
- wrong: expected `2026-09-14 24.92 expense PRESTO FARE`, got `null 24.92 expense PRESTO FARE` flags [missing_date, low_confidence]
- wrong: expected `2026-09-12 146.49 income PAYROLL DEPOSIT`, got `null 146.49 income PAYROLL DEPOSIT` flags [missing_date, low_confidence]
- wrong: expected `2026-09-11 6.91 expense LOCAL BAKERY`, got `null 6.91 expense LOCAL BAKERY` flags [missing_date, low_confidence]

### receipt-02.png

- wrong: expected `2026-09-09 29.87 expense SHOPPERS DRUG MART`, got `null 29.87 expense SHOPPERS DRUG MART` flags [missing_date, low_confidence]

### receipt-04.png

- missed: `2026-09-09 42.18 expense TIM HORTONS`

### receipt-05.png

- missed: `2026-09-15 18.50 expense FARM BOY`

### receipt-06.png

- wrong: expected `2026-09-08 21.09 expense DOLLARAMA`, got `null 21.09 expense DOLLARAMA` flags [arithmetic_verified, missing_date, low_confidence]

### receipt-07.png

- missed: `2026-09-08 33.94 expense CAFE PYRENEES`

### receipt-08.png

- missed: `2026-09-09 71.18 expense TIM HORTONS`

### receipt-09.png

- missed: `2026-09-09 32.56 expense SHOPPERS DRUG MART`

### receipt-10.png

- missed: `2026-09-08 42.80 expense SHOPPERS DRUG MART`

### receipt-11.png

- wrong: expected `2026-09-11 57.61 expense SOBEYS`, got `null 57.61 expense SOBEYS` flags [missing_date, low_confidence]

### receipt-15.png

- wrong: expected `2026-09-09 21.28 expense SOBEYS`, got `null 21.28 expense ` flags [arithmetic_verified, missing_date, low_confidence]

### receipt-16.png

- missed: `2026-09-08 55.58 expense SHOPPERS DRUG MART`

### receipt-17.png

- wrong: expected `2026-09-11 46.94 expense DOLLARAMA`, got `null 46.94 expense DOLLARAMA` flags [arithmetic_verified, missing_date, low_confidence]

### receipt-18.png

- wrong: expected `2026-09-12 66.04 expense SHOPPERS DRUG MART`, got `null 66.04 expense SHOPPERS DRUG MART` flags [missing_date, low_confidence]

### receipt-19.png

- wrong: expected `2026-09-14 19.57 expense DOLLARAMA`, got `null 19.57 expense DOLLARAMA` flags [arithmetic_verified, missing_date, low_confidence]

### receipt-21.png

- missed: `2026-09-07 45.54 expense SOBEYS`

### receipt-22.png

- wrong: expected `2026-09-07 52.34 expense SOBEYS`, got `null 52.34 expense SOBEYS` flags [missing_date, low_confidence]

### receipt-23.png

- missed: `2026-09-16 45.20 expense SHOPPERS DRUG MART`

