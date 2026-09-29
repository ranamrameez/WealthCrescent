# UI and performance audit — 2026-09-29

## Verified

- Banking, Cash, Rentals, Subscriptions, Personal Loans, EMI, Funds, QSE, PSX, Net Worth, Credit Cards, and Planning compile together.
- Theme contrast contract passes for all 28 theme cases.
- Planning, Banking, Cash, and Rentals use centralized top-bar scope/date filters. Cash and Rentals apply the same URL-backed date, direction, category, and source filters to summary figures, transactions, analytics, and category totals; their module-home analytics render each selected currency/entity in a separate section.
- Net Worth source scope changes the shared aggregation hook.
- Funds analytics now respects the homepage entity scope and renders each selected fund in its own section instead of restoring an unrelated local fund/currency selection.
- EMI's module homepage now consolidates scoped installment plans, repayment ledgers, and schedule analytics alongside its existing summary/entity views. The shared top-bar entity and transaction filters drive those homepage sections, and each loan remains in its own currency-labelled space.
- Personal Loans now applies its centralized entity/date/direction/category/source filters to homepage summary, entity cards, plans, payments, and analytics. Analytics renders every selected loan in a separate currency-labelled section rather than replacing homepage scope with a local loan dropdown.
- Net Worth now exposes standard Summary, Plans, and Analytics sections. Plans shows 30/90-day and one-year currency-separated current net worth, planned inflow/outflow, projected net worth/change, and the contributing plan ledger; projections reuse the shared engine so EMI-linked bank installments are not double-counted.

## Findings to keep visible

- Some detail pages retain local form controls intentionally for editing/importing; these are not page-wide filters and must not be promoted into summary cards.
- Shared factories plus Banking, Credit Cards, Personal Loans, Rentals, Cash, EMI, Categories, and Category Groups now coalesce persistence and serialize during idle time. Only six direct writes remain inside stores, all small preference/dismissal values rather than full financial workbooks.
- Vendor bundling separates Firebase, charts, React, and the lazy batch editor. Source features are deliberately not forced into manual chunks: Planning, Cash, Banking, Transfers, and Account have real import relationships, and feature-level manual chunks caused a production-only temporal-dead-zone crash. The application chunk is currently about 1.11 MB raw / 257 kB gzip and guarded by a documented 1.9 MB warning budget until safe route-level dynamic imports replace it.
- Hard-coded chart label colors remain in a few analytics charts; theme tokens should replace them where the color represents text rather than data.
- Every future module must pass the aggregate-homepage, entity-scope, currency-separation, centralized-filter, and lazy-heavy-section checks before release.

## Commands

- `npm run build` — passed.
- `npm run test -- --run src/themes/themes.test.ts` — 28 passed.
