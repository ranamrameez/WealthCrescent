# Net Worth dashboard — reporting and calculation contract

The canonical app home dashboard is `/dashboard`; `/net-worth` remains a compatibility route. Its reporting range is a page-level filter shared by the summary movement figures and historical analytics.

## Date-range controls

The URL query parameters are:

- `period`: `since-month`, `3`, `6`, `12`, `ytd`, `all`, or `custom`. Legacy `7d`/`30d`/`90d`/`6m`/`1y` links are normalized.
- `from` and `to`: ISO dates used when `period=custom`.

The default is This month (`since-month`). Invalid dates are rejected; future dates are clamped to today; reversed custom ranges are normalized. Upcoming plans are not clipped to this historical range; they retain a forward-looking 30-day window. All-history starts at the earliest available date among the currently selected data sources and recorded dashboard activities.

## Figure semantics

- **Estimated net worth** and **current balances by currency** remain live current balances. A historical reporting filter must not make a current-position headline look historical.
- **Net worth change in period** compares the central `netWorthAsOfDate` result at the selected end date with the result at the end of the day before the selected start date. It is withheld when a real pre-period baseline, dated opening evidence or complete FX coverage is missing.
- **Period net flow** is cleared Cash, Bank and Rental activity, excluding linked inter-account transfers and pending entries. The headline, Insights and itemized details share the same engine-selected population.
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

- Dashboard sections use the same shared StandardPageSections card headers and collapse/fullscreen controls as other modules (2026-11-06 user-requested parity correction). The filter does not edit transactions, balances, broker profiles, or source records.
- It does not merge QSE and PSX broker profiles or combine their cash ledgers.
- It does not invent an opening balance when no verified baseline exists.
- Do not add a second dashboard-only accounting engine. Reuse the central net-worth/as-of and cash-flow calculations.
- When adding a new dashboard metric, state whether it is a current snapshot, period movement, planned projection, or historical month-end value, and make its drill-down date bounds match its displayed value.

## Verification

Dashboard regression coverage lives in `src/features/netWorth/pages/__tests__/dashboard.test.tsx`. Before merging a dashboard change, run the full Vitest suite, both TypeScript projects, and the production Vite build on the exact PR head. Also review the rendered page with representative multi-currency data and custom partial-month ranges; automated tests do not validate a user's imported financial records.

## Central calculation boundary (2026-11-05)

NetWorthPage obtains native data and inclusion commands from dashboard/net-worth services. CalculationEngine owns valuation, reporting ranges, headline and per-currency summaries, Insights, category totals/details, monthly drilldowns and exact-day planning forecasts. Historical capital split uses the selected end date. Recent transactions also use an engine/service read model. The wider app migration and dashboard visual acceptance remain pending; see [calculation audit](CALCULATION_ENGINE_AUDIT.md) and [current handoff](../SESSION_HANDOFF.md).

## Outstanding dashboard and UI delivery

The calculation migration does not complete the planned dashboard redesign. Follow [the delivery checklist](DELIVERY_CHECKLIST.md) for visual hierarchy, responsive review, shared charts/topbar/filters, dropdown navigation and theme acceptance.

## Funds and broker compatibility correction (2026-11-06)

Legacy missing Funds cash inclusion means holdings-only; explicit true/false remains authoritative. New workbook defaults remain explicit. Independent broker valuation uses each included profile and its own settings, rather than only the selected trading broker. Historical and current valuation share this path.

## Month-based Plans (2026-11-06)

Plans now has URL-backed plan-month (YYYY-MM) and plan-months (1/3/6/12). The window uses full calendar boundaries, including leap February; the selected start defaults to the page reporting range's first month. The independent plan month can be historical or future. Recurrence expands over the exact requested window, rather than clipping at today's default horizon.

Charts, monthly tables and dated remaining-plan rows share the service's scoped activity dataset. Cleared actuals stop at today; pending native rows and unexecuted plans remain separate. Values stay per currency; empty months remain represented. This is an activity report, not a claimed future net-worth balance. Current coverage is Cash/Bank/Rentals; integration of other native domains remains pending. The complete Planning editor is linked for writes.

Only top-level dashboard sections collapse. Currency summaries, chart cards and monthly tables inside remain open. Main figures use larger highlighted values, supporting balances are smaller and additional stats compact. Modern/Compact stat presentation is independent of theme; references live in ../../docs/ui-samples/. Alerts can be dismissed with an accessible cross button.

Research informing the design: [YNAB monthly income/expense comparison](https://support.ynab.com/en_us/income-v-expense-Byu1BYWRq) and [Actual date-filtered report cards](https://master.www.actualbudget.org/docs/reports/custom-reports/). These inform presentation only; native ledger semantics and CalculationEngine remain authoritative.

User correction: retain only the existing Comfortable, Compact and Console modes. The supplied Modern/Compact screenshots are reference examples for repairing these modes, not additional preferences. Symbol use means the existing semantic icons with visible labels, not decorative icons replacing financial meaning.
