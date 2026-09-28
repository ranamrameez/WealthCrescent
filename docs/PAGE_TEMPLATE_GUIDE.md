# WealthCrescent page template and parity guide

This is the implementation contract for every new page and every parity pass on an existing page. The Bank Account detail page is the reference implementation.

## Required page anatomy

1. **Routed detail page** – the page has a stable URL, browser back support, a clear “Back to …” link, a page title, status badge, and no primary workflow hidden inside an oversized modal.
2. **Pinned top-bar controls** – entity selectors (bank/account/card/currency), the shared centralized transaction filter menu, and only controls that apply to the whole page. Filters are URL-backed and survive refresh, navigation, and deep links.
3. **Section navigation** – top-bar chips/anchors for Summary, Statement or Overview, Plans, Transactions, History, and Analytics where applicable. Every chip scrolls to a real section id.
4. **Summary first** – use shared `SummaryGroupCard` and `SummaryMetric` components. Group related facts, show units/currency, use positive/negative tones consistently, and include tooltips for calculated values.
5. **Standard cards** – use `StandardCard` with consistent spacing, hue, summary chips, action menus, and `defaultOpen={false}` for expensive or secondary sections.
6. **Action menu on every editable section** – section actions must include add/import, modify mode, export, and batch edit where the data model supports them. Use the account pattern: `Modify` toggles row controls, `Done modifying` exits, and `Batch edit` opens a lazy editor.
7. **Ledger** – show filtered rows, pagination, row detail popup, row edit popup, delete confirmation, source/status, category, amount, and balance/effect where relevant. Add selection checkboxes and a batch-edit popup for multi-row changes.
8. **Plans** – show current/expected projection, horizon selector, planned rows, add/edit/delete controls, and batch editing. Planned data must use the same date/direction filters as the ledger.
9. **History** – distinguish calendar-month history from domain cycles (billing cycles, repayment cycles, statement periods). Never label a cycle as a month.
10. **Analytics** – derive every chart and metric from the same filtered dataset used by the visible ledger. Include useful summary cards before charts, empty states, legends/tooltips, accessible labels, and lazy mounting for heavy charts.
11. **Export and import** – export filtered data and all data separately; preserve the active filter range in filenames. Imports must identify source and preserve references.
12. **Feedback and safety** – confirm destructive actions, require sign-in for writes, show success/error toasts, disable impossible actions, and preserve unsaved form state until save/cancel.
13. **Responsive/accessibility** – keyboard-accessible controls, labels for icon buttons, visible focus states, readable table overflow, mobile-safe action menus, and no clipped card details.
14. **Performance** – memoize derived ledgers, avoid repeated filtering in child components, lazy-load batch editors and charts, paginate long lists, and keep secondary cards closed initially.

## Module homepage rule

A module homepage is an aggregate view, not the first entity's detail page. It must combine every active entity owned by that module by default: all bank accounts and cards, all cash currencies, all rental properties, all loans, all subscriptions, all funds, and all market portfolios/strategies. The homepage summary, totals, plans, history, alerts, and analytics must be calculated from that complete set.

The pinned top bar must expose entity inclusion/exclusion controls appropriate to the module. Selecting one or more entities narrows the same shared scope used by every section; clearing the selection restores the all-entities aggregate. The selected scope must be URL-backed, survive refresh, be reflected in the page title/summary chip, and never silently change the underlying detail-page accounting rules.

Required aggregate behavior:

- **Summary:** totals and counts across all included entities, grouped by currency or entity where conversion is not valid.
- **Plans:** only plans belonging to included entities and the selected date/direction range.
- **History:** aggregate history plus an entity breakdown; preserve domain cycles separately from calendar months.
- **Analytics:** every metric and chart uses the same scoped, filtered dataset as the visible ledger.
- **Ledger/activity:** show the combined activity with an entity column and pagination; entity filters include/exclude rows.
- **Empty state:** explain whether there is no data at all or the current scope excluded all entities, with a clear reset action.

## Module audit matrix

Use this matrix during every parity pass. A module is conformant only when its homepage aggregates all entities and exposes a shared entity scope.

| Module | Homepage aggregate set | Required entity scope | Detail pages | Domain-specific history |
| --- | --- | --- | --- | --- |
| Banking | banks, accounts, credit cards | bank/account/card | bank, account, card | statement and billing cycles |
| Cash | cash currencies | currency | currency | calendar months |
| Rentals | properties | property | property | lease/rent cycles |
| Loans/EMI | loans and repayment schedules | loan | loan | repayment/amortization periods |
| Subscriptions | subscriptions | subscription | subscription | renewal periods |
| Funds | funds and holdings | fund | fund/position | valuation periods |
| QSE/PSX | portfolios, positions, strategies | portfolio/strategy/position | stock/strategy | trade/holding periods |
| Net Worth | all supported asset/liability entities | source module, currency | source detail pages | monthly snapshots |

## Bank Account reference feature inventory

The Account page currently provides: bank/account switching; centralized period/date, direction, category, source, and account filters; summary cards for balance, pending activity, inflow/outflow, net change, and selected-period comparison; account details and credit usage; account edit/close/delete/favorite actions; add transaction; transfer; import; filtered export; all-data export; plans with horizon selection; plan add/edit/delete; plan batch edit; transaction modify mode; row edit/delete/detail actions; transaction batch edit; pending versus cleared separation; running balance; period opening balance; filtered analytics; planned inflow/outflow; responsive tables; lazy batch editors; confirmations/toasts; and URL-preserved state.

## Credit Card parity requirements

Credit Cards must match the Account contract while adding card-specific behavior: realistic card visual with always-visible favorite; limit/available-credit bar; locked statement and active cycle cards; separate minimum-payment and full-payment dates; payment allocation through the final due date; cycle history plus monthly history; card details popup; centralized filters; ledger modify/action popup; row selection and batch editing; filtered analytics; and lazy charts/history.

## Copy-ready implementation prompt

> Implement this page using `docs/PAGE_TEMPLATE_GUIDE.md` as the acceptance contract. Audit the Bank Account detail page first and reproduce its routed-page structure, pinned top-bar selectors, URL-backed centralized filters, section chips, SummaryGroupCard/SummaryMetric cards, StandardCard spacing and action menus, modify mode, row detail/edit/delete flows, filtered/all exports, import flow, plans and horizon controls, batch editors, pagination, confirmations, toasts, accessibility, responsive behavior, and lazy loading. Every ledger, history, projection, summary, and analytics value must derive from the same filtered dataset, except explicitly locked domain statements whose accounting rules must be documented. Add domain-specific cycles without replacing calendar-month history. Add tests for filters, date boundaries, batch edits, empty states, and calculations. Run build and targeted tests before handoff.

## Definition of done

- A user can find every major section without opening an unrelated modal.
- A single filter menu controls all page data and is reflected in the URL.
- Every editable collection supports single-row modify and multi-row batch editing.
- Calculated figures explain their period and source.
- Heavy sections do not block first paint.
- Build, targeted tests, and a visual audit pass.
