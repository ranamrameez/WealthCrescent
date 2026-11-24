# Trade Journal browser acceptance

## Native exchange routes

On 2026-11-24, the QSE and PSX routes passed headless Chromium checks at 1440×900 and 390×844 with touch enabled at mobile width. The production bundle from [PR #106](https://github.com/ranamrameez/WealthCrescent/pull/106) ran offline with synthetic broker data. The checks covered pending-fill exclusion, ticker filtering of all three tables, filtered fill and daily/ticker CSV downloads in the exchange currency, the legacy link target, and horizontal overflow. [Webapp checks 678](https://github.com/ranamrameez/WealthCrescent/actions/runs/45387351551) passed on the PR head.

## Legacy Journal routes

On 2026-11-22 Agent 1 verified both Wealth Crescent Trade Journal routes in headless Chromium at 1440×900 and 390×844, with touch enabled at mobile width. The production bundle was served from local build files. Synthetic fixtures covered QSE statement CSV upload, Al Habib cash statement paste and order history CSV upload. The browser checks also covered section navigation, transaction CSV download, full JSON backup and restore, and persistence across reload of both datasets and the PSX date-basis preference. The production build passed.

Mobile menu follow-up verified on both Journal routes at 360×740 and 390×844 with touch enabled. The section menu moves below the sticky app header when the frame scrolls behind it. Desktop navigation at 1440×900 also passed.
