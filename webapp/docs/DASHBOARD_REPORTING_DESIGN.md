# Dashboard reporting design — 2026-11-06

## User contract
The dashboard must explain how much came in/out and where, with month/custom timeline navigation; category, module/account and plan breakdowns; a stats widget for every month; and charts beside related section stats. Main figure > supporting balances > extra stats. Only top-level sections collapse. Repair Comfortable, Compact and Console; do not add another UI mode. Themes retain distinct surfaces, radius, elevation and colors. User references are in ../../docs/ui-samples/. Alerts have accessible dismiss controls.

## Examples reviewed
- [Copilot Cash Flow](https://help.copilot.money/en/articles/9682232-cash-flow-tab-overview): income/spending/net income, time comparisons, category/transaction drilldowns. [Transaction types](https://help.copilot.money/en/articles/3971267-transaction-types) separates internal transfers from spending.
- [Actual Reports Dashboard](https://actualbudget.org/docs/reports/): cash flow, net worth, spending analysis, summary/calendar widgets and report-specific date filters. [Custom reports](https://master.www.actualbudget.org/docs/reports/custom-reports/) splits by category/group/payee/account/month.
- [YNAB Income v Expense](https://support.ynab.com/en_us/income-v-expense-Byu1BYWRq): income sources, category expenses, month columns and transaction drilldowns. Its net-income report explicitly has different scope from net worth.

These inform presentation, not a new accounting policy or copied provider implementation.

## Reporting structure and acceptance
| Section | Primary view | Local chart and detail |
| --- | --- | --- |
| Monthly overview | One static widget per month: balance, flow and date/status | Timeline; same month rows; clear actual/current/forecast distinction |
| Money in/out | Actual inflow, outflow, net movement for selected dates | Income/outflow comparison and trend; contributing records |
| Categories | Separate income and spending breakdowns; unclassified visible | Ranked bars/stacked monthly categories; category transactions |
| Modules/accounts | Where money arrived and left, grouped by native source | Signed per-source flows; account transactions; distinct current balance chart |
| Plans | Monthly planned, pending, fulfilled/remaining; named plan groups | Plan group comparisons and occurrence ledger; unallocated actuals explicit |
| Assets/debts | Holdings/balances, liabilities and change | Module/currency composition and dated net-worth trend |

All figures in a section must use its same service-filtered dataset, currency and exact date bounds. A current snapshot must say current; it must not masquerade as the selected historical closing balance. Every chart needs a table/text equivalent and hover support without point hits. Empty/missing/zero and unknown baseline must be distinct. Changes show arrows/signed deltas; percentage is withheld for missing/zero baselines. Higher debt is not favourable merely because it increased.

## Accounting constraints
- Actual native records are authoritative. Due schedules and pending records are not cleared income/spending.
- Internal transfers and credit-card payments must not double-count spending already recorded as a card charge. Preserve explicit links; never infer matches from names/amounts alone.
- Loan principal is financing movement; classify fees/interest as expense only when supported by records. Do not invent missing allocations.
- Fund purchases/sales and broker deposits/withdrawals are investment movements, not automatically income/consumption. Holdings valuation change is not cash income.
- Rental income linked to a bank record must count once. Preserve source detail for audit.
- Category/module/account/plan are dimensions of the same records, not totals to add together. Actual plan allocation requires an explicit link; unknown remains unallocated.
- Keep currencies separate unless an explicit dated FX policy applies. Missing rates exclude converted contributions with a warning.

## Implemented checkpoint and remaining work
Implemented in the working tree: corrected legacy Funds cash opt-in semantics; broker-isolated valuation across profiles; standard section cards; no nested currency/chart/table collapse; headline hierarchy; month-based Plans with exact recurrence windows, chart/table and dated rows; density padding/heading repairs; dismissible notices; semantic section icons; monthly stats widget; native-current module balance chart; change indicator arrows.

Current flow/plan activity coverage is Cash/Bank/Rentals. The full income/spending breakdown across cards, funds, loans, subscriptions and exchanges is NOT complete. Needed next: canonical movement view model with explicit link-based deduplication/classification; remaining native source adapters; actual-vs-pending-vs-planned category/module/account/plan query models; allocation coverage; dimension drilldowns; monthly comparisons; complete chart/browser acceptance and current-head CI. Upcoming still has a confirmed linked EMI/bank duplicate requiring explicit source-link handling.

A balance composition chart is not a money-in/out report. The monthly stats widget's existing combined activity fields are labelled 'incl. plans'; replace with separated actual/pending/planned fields as the canonical report expands. Do not describe these checkpoints as full release completion.
