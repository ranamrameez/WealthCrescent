# QSE cash balance reconciliation — 15 October 2026

Compared `qse-ledger-all.csv` with the Cash worksheet in `account-statement-cash-2026-06-14_2026-10-15.xlsx`. The final transaction date in both is 14 October 2026.

## Finding

The app export closes at **QAR 1,515.689** (displayed as 1,515.69). The statement closes at **QAR 1,506**, with cash values stored as whole riyals in the XLSX itself. Four source-record corrections produce **QAR 1,505.959** (displayed as 1,505.96), consistent with the statement's whole-riyal closing figure. The spreadsheet cannot establish an exact cents-level balance.

These are proposed source-data corrections; neither the original evidence files nor live account records were changed.

## Records to correct

Worksheet row numbers below are Excel row numbers, including headers and expanded detail rows.

| Record | App export | Statement evidence | Correction | Effect on closing cash |
| --- | --- | --- | --- | --- |
| 29 September deposit | Gross 6,010; fee 0; net 6,010 | Rows 592–594: net 6,000, gross 6,010, electronic transfer fee 10 | Keep gross 6,010; set fee to 10 | −10.00 |
| 4 October IQCD sell, 45 shares | Price 9.565 | Row 790: price 9.571 | Set price to 9.571 | +0.270; commission remains 1.18 |
| QFBQ sell, 5 shares at 2.831 | Date 21 September | Row 486: 23 September | Set date to 23 September | No final balance change; fixes daily balances |
| MARK buy, 20 shares at 1.908 | Date 22 September | Row 505: 24 September | Set date to 24 September | No final balance change; fixes daily balances |

Stable source IDs for Modify / batch editing:

| Record | ID |
| --- | --- |
| Deposit | `2862b570-e471-4e14-97af-7eb60de65a3b` |
| IQCD sell | `17e6fa2c-608b-4d80-99df-727588d3fb8e` |
| QFBQ sell | `457b1278-eb54-4125-af23-2873b1c40686` |
| MARK buy | `4b6bd6b7-1c1a-467e-8513-1ea77f44ce15` |

The creation timestamps of the two misdated trades also fall on their statement dates; creation timestamps were used only as corroboration, not as transaction-date replacements.

## Coverage and checks

- The export contains 312 trades, five transfers, and 13 adjustments. Their cash totals are −10,965.231, +12,475, and +5.92 respectively, summing to the exported closing balance.
- All 312 trade cash amounts match signed shares × price less commission, using 0.275% commission rounded to cents. No discrepancy in those calculations was found.
- Grouping trades by date, action, ticker and price accounts for every statement trade after the three trade corrections above.
- The statement has 315 trade rows because the 4 October MPHC buy at 0.989 is three one-share fills combined into one three-share app record, and the 14 October QFLS buy at 11.80 is two one-share fills combined into one two-share app record. These are not missing trades. At the inferred commission rate, these particular splits have the same total commission as the combined records.
- After all four corrections, every daily closing balance differs from the statement's stored whole-riyal balance by less than QAR 1; the largest absolute difference is QAR 0.971. See `daily-reconciliation.csv` for all 40 daily comparisons.
- Statement cash amounts, commissions, rewards, and balances have already lost fractional precision in the workbook values. Do not sum its rounded transaction amounts to force an exact reconciliation or add an unexplained adjustment for the remaining fraction. In particular, the worksheet summary deposit figure (12,479) differs from the sum of its five net deposit rows (12,465); the explicit transfer breakdown is the evidence for the missing fee.

## Method

Read the XLSX XML directly, resolving shared strings. Used dated top-level worksheet rows as cash events and their outline-level child rows as supporting breakdowns, avoiding double-counting commissions and transfers. Matched stock names to the eight tickers in the app export. Compared daily cumulative signed app cash amounts before and after the proposed source corrections; daily comparisons do not depend on intraday ordering or settlement/due-balance columns.

No application calculation changes are indicated by these two snapshots. Actual account edits should use the existing Modify actions so that linked-transfer handling and derived balances refresh normally.
