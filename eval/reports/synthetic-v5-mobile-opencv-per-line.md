# Import benchmark — synthetic

Config: preset `v5-mobile`, engine `opencv`, strategy `per-line`. OCR time p50 193 ms, p95 295 ms (Node, cached runs keep their first timing).

| Layout | Images | Layout right | Rows (true / found) | Precision | Recall | Amount | Date | Type | Description | Category | **Silent amount errors** | Silent type errors | Unflagged extra rows | Parser unsure |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bank-list | 24 | 24 | 164 / 163 | 100.0% | 99.4% | 100.0% | 50.3% | 98.2% | 81.0% | 86.8% | **0 (0.0%)** | 0 (0.0%) | 0 | 0 |
| receipt | 24 | 24 | 24 / 22 | 100.0% | 91.7% | 100.0% | 77.3% | 100.0% | 100.0% | 100.0% | **0 (0.0%)** | 0 (0.0%) | 0 | 2 |

**Overall:** 185/188 rows found, amounts exact 100.0%, silent amount errors 0 (0.0%), silent type errors 0, unflagged extra rows 0.

## Rows that were wrong, missed or invented

### bank-balance-01.png

- wrong: expected `2026-09-13 43.77 expense CINEPLEX`, got `null 43.77 expense Sep13 CINEPLEX` flags [type_guessed, missing_date, arithmetic_verified, low_confidence]
- wrong: expected `2026-09-11 134.72 expense UBER EATS`, got `null 134.72 expense Sep11 UBEREATS` flags [type_guessed, missing_date, arithmetic_verified, low_confidence]
- wrong: expected `2026-09-10 101.92 expense PRESTO FARE`, got `null 101.92 expense Sep10 PRESTO FARE` flags [type_guessed, missing_date, low_confidence]

### bank-balance-02.png

- wrong: expected `2026-09-12 24.53 expense CINEPLEX`, got `null 24.53 expense Sep12 CINEPLEX` flags [type_guessed, missing_date, arithmetic_verified, low_confidence]

### bank-balance-03.png

- wrong: expected `2026-09-12 9.38 expense NETFLIX.COM`, got `null 9.38 expense Sep12 NETFLIX.COM` flags [type_guessed, missing_date, low_confidence]

### bank-pending-01.png

- wrong: expected `2026-09-14 94.96 expense PRESTO FARE`, got `null 94.96 expense PRESTO FARE` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-13 100.82 expense W STORE UWATERLOO`, got `null 100.82 expense W STORE UWATERLOO` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-11 10.51 expense AMAZON.CA`, got `null 10.51 expense AMAZON.CA` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-11 64.24 expense NETFLIX.COM`, got `null 64.24 expense NETFLIX.COM` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-09 2017.43 income PAYROLL DEPOSIT`, got `null 2017.43 income PAYROLL DEPOSIT` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-09 17.29 expense NETFLIX.COM`, got `null 17.29 expense NETFLIX.COM` flags [type_guessed, missing_date, low_confidence]

### bank-pending-02.png

- wrong: expected `2026-09-14 1353.91 income E-TRANSFER RECEIVED`, got `null 1353.91 income E-TRANSFER RECEIVED` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-13 1008.62 income INTEREST PAID`, got `null 1008.62 income INTEREST PAID` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-12 14.14 expense ROGERS WIRELESS`, got `null 14.14 expense ROGERSWIRELESS` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-10 17.53 expense SHOPPERS DRUG MART`, got `null 17.53 expense SHOPPERS DRUG MART` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-09 91.20 expense PRESTO FARE`, got `null 91.20 expense PrESTOFARE` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-09 42.43 expense LOCAL BAKERY`, got `null 42.43 expense LOCALBAKERY` flags [type_guessed, missing_date, low_confidence]

### bank-pending-03.png

- wrong: expected `2026-09-15 60.29 expense UBER EATS`, got `null 60.29 expense UBER EATS` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-14 1799.14 income INTEREST PAID`, got `null 1799.14 income INTEREST PAID` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-13 392.83 income PAYROLL DEPOSIT`, got `null 392.83 expense PAYROLLDEPOSIT` flags [type_guessed, missing_date, low_confidence]

### bank-pending-04.png

- wrong: expected `2026-09-15 1418.28 income PAYROLL DEPOSIT`, got `null 1418.28 income PAYROLL DEPOSIT` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-15 47.19 expense CINEPLEX`, got `null 47.19 expense CINEPLEX` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-15 47.20 expense TIM HORTONS #2291`, got `null 47.20 expense TIM HORTONS #2291` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-15 134.94 expense CINEPLEX`, got `null 134.94 expense CINEPLEX` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-14 626.98 income INTEREST PAID`, got `null 626.98 expense INTERESTPAID` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-14 25.90 expense TIM HORTONS #2291`, got `null 25.90 expense TIM HORTONS #2291` flags [type_guessed, missing_date, low_confidence]

### bank-pending-05.png

- wrong: expected `2026-09-14 116.67 expense SHOPPERS DRUG MART`, got `null 116.67 expense SHOPPERS DRUG MART` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-14 51.67 expense ROGERS WIRELESS`, got `null 51.67 expense ROGERSWIRELESS` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-14 83.60 expense PRESTO FARE`, got `null 83.60 expense PRESTO FARE` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-13 82.90 expense PRESTO FARE`, got `null 82.90 expense PrESTOFARE` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-13 2021.10 income E-TRANSFER RECEIVED`, got `null 2021.10 income E-TRANSFER RECEIVED` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-11 50.56 expense PRESTO FARE`, got `null 50.56 expense PRESTOFARE` flags [type_guessed, missing_date, low_confidence]

### bank-pending-06.png

- wrong: expected `2026-09-15 3.46 expense W STORE UWATERLOO`, got `null 3.46 expense W STORE UWATERLOO` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-15 1269.63 income PAYROLL DEPOSIT`, got `null 1269.63 income PAYROLL DEPOSIT` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-15 84.76 expense PRESTO FARE`, got `null 84.76 expense PRESTO FARE` flags [type_guessed, missing_date, low_confidence]

### bank-pending-07.png

- wrong: expected `2026-09-14 9.24 expense W STORE UWATERLOO`, got `null 9.24 expense W STORE UWATERLOO` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-14 32.73 expense CINEPLEX`, got `null 32.73 expense CINEPLEX` flags [type_guessed, missing_date, low_confidence]

### bank-pending-08.png

- wrong: expected `2026-09-15 336.50 income INTEREST PAID`, got `null 336.50 expense INTERESTPAID` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-15 117.69 expense FARM BOY`, got `null 117.69 expense FARM BOY` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-14 1694.74 income INTEREST PAID`, got `null 1694.74 income INTEREST PAID` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-14 76.96 expense FARM BOY`, got `null 76.96 expense FARM BOY` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-14 144.84 expense AMAZON.CA`, got `null 144.84 expense AMAZON.CA` flags [type_guessed, missing_date, low_confidence]
- wrong: expected `2026-09-12 1999.83 income PAYROLL DEPOSIT`, got `null 1999.83 income PAYROLL DEPOSIT` flags [type_guessed, missing_date, low_confidence]

### bank-signed-01.png

- wrong: expected `2026-09-15 61.16 expense TIM HORTONS #2291`, got `null 61.16 expense TIM HORTONS #2291` flags [missing_date, low_confidence]
- wrong: expected `2026-09-15 215.06 income INTEREST PAID`, got `null 215.06 income INTERESTPAID` flags [missing_date, low_confidence]
- wrong: expected `2026-09-15 29.44 expense NETFLIX.COM`, got `null 29.44 expense NETFLIX.COM` flags [missing_date, low_confidence]
- wrong: expected `2026-09-15 120.00 expense ROGERS WIRELESS`, got `null 120.00 expense ROGERS WIRELESS` flags [missing_date, low_confidence]
- wrong: expected `2026-09-15 82.37 expense ROGERS WIRELESS`, got `null 82.37 expense ROGERS WIRELESS` flags [missing_date, low_confidence]
- wrong: expected `2026-09-14 115.79 expense SHOPPERS DRUG MART`, got `null 115.79 expense SHOPPERS DRUG MART` flags [missing_date, low_confidence]

### bank-signed-02.png

- wrong: expected `2026-09-15 17.99 expense LOCAL BAKERY`, got `null 17.99 expense LOCALBAKERY` flags [missing_date, low_confidence]
- wrong: expected `2026-09-14 87.62 expense FARM BOY`, got `null 87.62 expense FARM BOY` flags [missing_date, low_confidence]
- wrong: expected `2026-09-14 145.77 expense AMAZON.CA`, got `null 145.77 expense AMAZOn.CA` flags [missing_date, low_confidence]
- wrong: expected `2026-09-14 20.08 expense SOBEYS #1234`, got `null 20.08 expense SOBEYS #1234` flags [missing_date, low_confidence]
- wrong: expected `2026-09-14 1157.58 income E-TRANSFER RECEIVED`, got `null 1157.58 income E-TRANSFER RECEIVED` flags [missing_date, low_confidence]

### bank-signed-03.png

- wrong: expected `2026-09-13 43.73 expense W STORE UWATERLOO`, got `null 43.73 expense W STORE UWATERLOO` flags [missing_date, low_confidence]
- wrong: expected `2026-09-10 63.67 expense LOCAL BAKERY`, got `null 63.67 expense LOCALBAKERY` flags [missing_date, low_confidence]
- wrong: expected `2026-09-09 1.21 expense W STORE UWATERLOO`, got `null 1.21 expense W STOREUWATERLOO` flags [missing_date, low_confidence]
- wrong: expected `2026-09-09 90.84 expense FARM BOY`, got `null 90.84 expense FARMBOY` flags [missing_date, low_confidence]
- missed: `2026-09-11 2.73 expense UBER EATS`

### bank-signed-04.png

- wrong: expected `2026-09-15 103.93 expense ROGERS WIRELESS`, got `null 103.93 expense ROGERS WIRELESS` flags [missing_date, low_confidence]
- wrong: expected `2026-09-10 2.62 expense SHOPPERS DRUG MART`, got `null 2.62 expense SHOPPERS DRUG MART` flags [missing_date, low_confidence]
- wrong: expected `2026-09-10 15.21 expense LOCAL BAKERY`, got `null 15.21 expense LOCALBAKERY` flags [missing_date, low_confidence]
- wrong: expected `2026-09-09 10.02 expense UBER EATS`, got `null 10.02 expense UBER EATS` flags [missing_date, low_confidence]
- wrong: expected `2026-09-08 143.09 expense TIM HORTONS #2291`, got `null 143.09 expense TIM HORTONS #2291` flags [missing_date, low_confidence]

### bank-signed-05.png

- wrong: expected `2026-09-15 89.23 expense TIM HORTONS #2291`, got `null 89.23 expense TIM HORTONS #2291` flags [missing_date, low_confidence]
- wrong: expected `2026-09-14 117.20 expense PRESTO FARE`, got `null 117.20 expense PRESTO FARE` flags [missing_date, low_confidence]
- wrong: expected `2026-09-12 786.11 income INTEREST PAID`, got `null 786.11 income INTEREST PAID` flags [missing_date, low_confidence]
- wrong: expected `2026-09-11 38.78 expense W STORE UWATERLOO`, got `null 38.78 expense W STORE UWATERLOO` flags [missing_date, low_confidence]
- wrong: expected `2026-09-11 41.62 expense PRESTO FARE`, got `null 41.62 expense PRESTOFARE` flags [missing_date, low_confidence]
- wrong: expected `2026-09-11 37.58 expense CINEPLEX`, got `null 37.58 expense CINEPLEX` flags [missing_date, low_confidence]
- wrong: expected `2026-09-11 61.73 expense NETFLIX.COM`, got `null 61.73 expense NETFLIX.COM` flags [missing_date, low_confidence]
- wrong: expected `2026-09-10 130.51 expense PRESTO FARE`, got `null 130.51 expense PRESTO FARE` flags [missing_date, low_confidence]

### bank-signed-06.png

- wrong: expected `2026-09-15 147.61 expense FARM BOY`, got `null 147.61 expense FARMBOY` flags [missing_date, low_confidence]
- wrong: expected `2026-09-13 33.52 expense CINEPLEX`, got `null 33.52 expense CINEPLEX` flags [missing_date, low_confidence]

### bank-signed-07.png

- wrong: expected `2026-09-15 1320.09 income E-TRANSFER RECEIVED`, got `null 1320.09 income E-TRANSFER RECEIVED` flags [missing_date, low_confidence]
- wrong: expected `2026-09-15 80.68 expense NETFLIX.COM`, got `null 80.68 expense NETFLIX.COM` flags [missing_date, low_confidence]
- wrong: expected `2026-09-15 131.79 expense PRESTO FARE`, got `null 131.79 expense PRESTO FARE` flags [missing_date, low_confidence]

### bank-signed-08.png

- wrong: expected `2026-09-15 67.96 expense ROGERS WIRELESS`, got `null 67.96 expense ROGERS WIRELESS` flags [missing_date, low_confidence]
- wrong: expected `2026-09-14 77.61 expense SOBEYS #1234`, got `null 77.61 expense SOBEYS #1234` flags [missing_date, low_confidence]
- wrong: expected `2026-09-14 24.92 expense PRESTO FARE`, got `null 24.92 expense PRESTO FARE` flags [missing_date, low_confidence]
- wrong: expected `2026-09-12 146.49 income PAYROLL DEPOSIT`, got `null 146.49 income PAYROLL DEPOSIT` flags [missing_date, low_confidence]
- wrong: expected `2026-09-11 6.91 expense LOCAL BAKERY`, got `null 6.91 expense LOCALBAKERY` flags [missing_date, low_confidence]

### receipt-07.png

- missed: `2026-09-08 33.94 expense CAFE PYRENEES`

### receipt-09.png

- missed: `2026-09-09 32.56 expense SHOPPERS DRUG MART`

### receipt-10.png

- wrong: expected `2026-09-08 42.80 expense SHOPPERS DRUG MART`, got `null 42.80 expense SHOPPERS DRUG MART` flags [missing_date, low_confidence]

### receipt-11.png

- wrong: expected `2026-09-11 57.61 expense SOBEYS`, got `null 57.61 expense SOBEYS` flags [arithmetic_verified, missing_date, low_confidence]

### receipt-17.png

- wrong: expected `2026-09-11 46.94 expense DOLLARAMA`, got `null 46.94 expense DOLLARAMA` flags [arithmetic_verified, missing_date, low_confidence]

### receipt-18.png

- wrong: expected `2026-09-12 66.04 expense SHOPPERS DRUG MART`, got `null 66.04 expense SHOPPERS DRUG MART` flags [arithmetic_verified, missing_date, low_confidence]

### receipt-21.png

- wrong: expected `2026-09-07 45.54 expense SOBEYS`, got `null 45.54 expense SOBEYS` flags [arithmetic_verified, missing_date, low_confidence]

