# Net Worth dashboard — reporting and calculation contract

The app home dashboard is `/net-worth`. Its reporting range is a page-level filter shared by the summary movement figures and historical analytics.

## Date-range controls

The URL query parameters are:

- `period`: `7d`, `30d`, `90d`, `6m`, `1y`, `ytd`, `all`, or `custom`.
- `from` and `to`: ISO dates used when `period=custom`.

The default is the last 30 days. Invalid dates are rejected; future dates are clamped to today; reversed custom ranges are normalized. Upcoming plans are not clipped to this historical range; they retain a forward-looking 30-day window. All-history starts at the earliest available date among the currently selected data sources and recorded dashboard activities.

## Figure semantics

- **Estimated net worth** and **current balances by currency** remain live current balances. A historical reporting filter must not make a current-position headline look historical.
- **Net worth change in period** compares the central `netWorthAsOfDate` result at the selected end date with the result at the end of the day before the selected start date. It is withheld when there is no real pre-period baseline.
- **Period net flow** is cleared Cash and Bank movement only, using the existing `flowByCurrency` calculation. Linked inter-account transfers and pending activity retain the semantics of that shared helper.
- **Upcoming planned activity (30 days)** is a separate forward-looking figure, independent of the historical reporting range. The Plans section retains its own projection-horizon controls.
- **Category-group totals**, **rental net income**, and **monthly income/expense totals** are clipped to the exact selected dates, including partial first/last months.
- Monthly net-worth trend points are month-end snapshots for completed months and today's live balance for the current month. They are not falsely presented as exact daily snapshots; the UI labels this distinction.
- Monthly table drill-downs use the intersection of the selected date range and the month being opened.

## Coverage and insights

- Currency coverage is the union of current, period-start, period-end, and activity currencies. Activity-only currencies remain available in the per-currency summary and monthly income/expense tables even when they have no tracked net-worth position.
- Historical currencies are retained for monthly net-worth analytics; missing current values are represented as zero only where the account is genuinely absent from the current position set.
- Insights are per currency, never comparing unlike currency amounts: largest positive asset contributor, largest liability contributor, cleared net activity in the selected range, and missing-FX conversion warnings.
- A missing FX rate is not guessed. Such currencies remain visible in their own currency views and are called out as excluded from converted totals/charts.

## Non-goals and safeguards

- The dashboard sections use plain collapsible headers and sibling content cards; there is no redundant outer section-card shell. The filter does not edit transactions, balances, broker profiles, or source records.
- It does not merge QSE and PSX broker profiles or combine their cash ledgers.
- It does not invent an opening balance when no verified baseline exists.
- Do not add a second dashboard-only accounting engine. Reuse the central net-worth/as-of and cash-flow calculations.
- When adding a new dashboard metric, state whether it is a current snapshot, period movement, planned projection, or historical month-end value, and make its drill-down date bounds match its displayed value.

## Verification

Dashboard regression coverage lives in `src/features/netWorth/pages/__tests__/dashboard.test.tsx`. Before merging a dashboard change, run the full Vitest suite, both TypeScript projects, and the production Vite build on the exact PR head. Also review the rendered page with representative multi-currency data and custom partial-month ranges; automated tests do not validate a user's imported financial records.
