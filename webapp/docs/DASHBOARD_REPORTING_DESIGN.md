## Native movement adapters — 2026-11-06

Baseline c1cd12e9 passed Actions 438 on its exact head: 165 files / 1,251 tests, broker/PSX-fee regressions, both TypeScript projects and production build. No merge or deployment. This supersedes older pending-CI statements below.

Current continuation adds a deterministic CalculationEngine.movements read model and cached dashboard service/subscription for Cash, Bank, Rentals, native credit cards, recorded personal-loan/EMI repayments, Funds and every exchange broker. Cards distinguish charge/fee/markup from repayment transfer and cash-advance financing. Loan contracts/schedules are not fabricated cash receipts; EMI fines are explicit separate expenses with no guessed interest allocation. Funds trades are investment movement; exchange trades reuse broker-local fee calculators and split fees from gross consideration. NAV remains net of fund fees. Funding transfers are separate from spending. Dividends and native adjustments remain distinct. Active broker arrays override stale snapshots, archived profiles remain included unless excluded, and currencies never sum together.

Explicit Rental/loan-to-Cash/Bank links choose the domain record once; internal account/card/investment transfer legs are excluded from the combined view and available separately. Same names/dates/amounts never imply a link. Generated subscription plans appear under their paying source; renewals are not actual payments. Card and personal-loan plans are included without rewriting native records. Unknown Cash/Bank movement remains Unclassified rather than pretending it is earned income. Existing historical Analytics/Plans/headline flows still have their documented Cash/Bank/Rentals scope; broader movement totals must not be presented as identical to those narrower views until migration.

Validation: 4 focused files / 37 tests passed, including 10 new accounting/adapter tests. Browser verified kind filter, empty financing view, native-currency charts and matching tables. No real records were written/imported/deleted; no private screenshot or backup published. Production build and both TypeScript projects passed (native-movement-build.log). The initial build caught incomplete test fixtures; those fields and the recurrence fixture were corrected before this passing build. New resulting-head full CI remains required.

Next work: migrate monthly comparisons/widgets to the canonical movement population with shared controls; preserve explicit allocation links into actual native records; currency-owned unified budgets/remaining/rollover; remaining UI service migration and transaction-safe multi-workbook repositories before opt-in pending-only backend auto-pay/history/settlement/void. Full theme/mobile/chart/finder acceptance remains required. Keep existing PR 51 draft.

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

A balance composition chart is not a money-in/out report. The monthly Analytics widget/table now use cleared actuals only; pending/planned values remain separate in Plans and the movement selector. Complete native-domain adapters are still required. Do not describe these checkpoints as full release completion.

## Movement breakdown implementation checkpoint

Money in/out is now implemented for Cash/Bank/Rentals with actual/pending/planned selection, category/module/account-source/plan-group grouping, per-currency totals and shared-data charts/tables with record details. Same-name accounts preserve source IDs. Plans carry explicit group identity; actual records without a link remain unallocated. This is native account movement, not a completed earned-income/spending classifier. Other native adapters, credit-card/payment semantics and complete plan allocation remain pending.
