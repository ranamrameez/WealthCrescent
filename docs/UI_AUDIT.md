# UI and performance audit — 2026-09-29

## Verified

- Banking, Cash, Rentals, Subscriptions, Personal Loans, EMI, Funds, QSE, PSX, Net Worth, Credit Cards, and Planning compile together.
- Theme contrast contract passes for all 28 theme cases.
- Planning and Banking use centralized top-bar scope/date filters; Banking projections are separated by account and currency.
- Net Worth source scope changes the shared aggregation hook.

## Findings to keep visible

- Some detail pages retain local form controls intentionally for editing/importing; these are not page-wide filters and must not be promoted into summary cards.
- Shared factories plus Banking, Credit Cards, Personal Loans, and Rentals now coalesce persistence and serialize during idle time. Nineteen low-frequency/direct storage writes remain, mostly preferences, dismissal flags, and smaller registries.
- Hard-coded chart label colors remain in a few analytics charts; theme tokens should replace them where the color represents text rather than data.
- Every future module must pass the aggregate-homepage, entity-scope, currency-separation, centralized-filter, and lazy-heavy-section checks before release.

## Commands

- `npm run build` — passed.
- `npm run test -- --run src/themes/themes.test.ts` — 28 passed.
