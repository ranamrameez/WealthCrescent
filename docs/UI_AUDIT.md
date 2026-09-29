# UI and performance audit — 2026-09-29

## Verified

- Banking, Cash, Rentals, Subscriptions, Personal Loans, EMI, Funds, QSE, PSX, Net Worth, Credit Cards, and Planning compile together.
- Theme contrast contract passes for all 28 theme cases.
- Planning, Banking, Cash, and Rentals use centralized top-bar scope/date filters. Cash and Rentals apply the same URL-backed date, direction, category, and source filters to summary figures, transactions, analytics, and category totals; their module-home analytics render each selected currency/entity in a separate section.
- Net Worth source scope changes the shared aggregation hook.

## Findings to keep visible

- Some detail pages retain local form controls intentionally for editing/importing; these are not page-wide filters and must not be promoted into summary cards.
- Shared factories plus Banking, Credit Cards, Personal Loans, Rentals, Cash, EMI, Categories, and Category Groups now coalesce persistence and serialize during idle time. Only six direct writes remain inside stores, all small preference/dismissal values rather than full financial workbooks.
- Production bundling now separates feature modules and large Firebase/chart/React vendors. The previous 1.77 MB entry bundle is replaced by smaller feature/vendor chunks, and the production build no longer emits the oversized-chunk warning.
- Hard-coded chart label colors remain in a few analytics charts; theme tokens should replace them where the color represents text rather than data.
- Every future module must pass the aggregate-homepage, entity-scope, currency-separation, centralized-filter, and lazy-heavy-section checks before release.

## Commands

- `npm run build` — passed.
- `npm run test -- --run src/themes/themes.test.ts` — 28 passed.
