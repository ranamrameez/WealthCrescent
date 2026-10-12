# QSE price sources and transition

The shared market feed is user-independent: QSE/tickers/{ticker} at the Firebase
Realtime Database root. allPrices contains complete observations, dayToDayBounds
contains Qatar-date extrema, allTimeBounds contains historical extrema, and latest
contains the latest shared observation. Authentication authorizes access, but the
account UID never scopes market data. Personal extension configuration remains at
users/{uid}/extensionConfigs.

The extension copies the previous stockData/QSE tree once to root QSE with an
ETag-protected write. Existing root values win conflicts; historical keys are
merged. The original node is preserved as a backup and receives no future extension
writes. Existing authenticated read access to the old node is required to migrate;
root QSE needs authenticated read/write permission. Migration conflicts are reported
and retried on the next request. Root migrationVersion=2 prevents repeat copying.

## Webapp audit

- store/createWorkbookStore.ts setMarketPrice appends a timestamped manual point
  to workbook.priceHistory and updates workbook.marketPrices. Editing/deleting
  manual history recalculates the latest manual price.
- lib/firebase/useFirebaseSync.ts uses useWorkbookCloudSync('workbook', ...) and
  uploads the entire QSE workbook to users/{uid}/workbook. Manual marketPrices
  and priceHistory are therefore private workbook data. Local persistence uses
  WealthCrescent_qse_workbook_v1.
- PSX uses the same store factory but syncs to users/{uid}/psx. This change does
  not redirect PSX observations into QSE.
- Current valuation resolves workbook marketPrices first, then transaction prices
  through lib/calc/priceHistory.ts. The app does not scrape or automatically write
  extension market prices. A manual update is not a competing shared-feed writer.
- lib/stockData/reader.ts now reads names and fundamentals from root QSE leaf
  nodes, with legacy leaf fallback during migration. Seeding uses update rather
  than set, so metadata seeding cannot wipe shared prices/history/bounds.

## App integration

The QSE stock page has a Market prices section combining root shared observations
with the signed-in user's manual workbook history. Date filters use Qatar days,
source labels distinguish scraped points, shared corrections, and private manual
entries; matching prices from different sources remain independent observations.
The table is paginated; charts use all matching observations, and known all-time
bounds combine the shared summary with manual prices. Shared reads query only the
selected ticker/time range and require an index on allPrices/time. Access errors
keep the manual history visible. Shared observations are never copied into the
private workbook or written back by this view.

Manual prices remain enabled, and portfolio valuation still uses the existing
manual price resolver. Disablement or a valuation-source cutover requires live
reliability evidence: current timestamps, coverage across trading windows, correct
reported daily ranges, complete syncs, and reviewed outliers. No such reliability
claim is made by the offline regression tests. A subsequent cutover should select
a shared price using its observation time/freshness while retaining labelled manual
history as a fallback and audit source, rather than deleting private history.

## Reactive frontend (feature/qse-live-frontend-updates)

The app subscribes to the latest 1,000 shared observations for tickers in trades,
watchlists, plans, or manual history. The QSE calculation and strategic hooks and
watchlist use an effective workbook that combines these live observations with
private manual history. Newer timestamps win; equal timestamps favour manual
prices. Missing/deleted/denied shared feeds fall back to private data. Live data
never mutates the workbook store, local storage, or user cloud workbook. Charts
through the calculation hooks show the retained live window alongside manual
history; the Market prices section remains available for querying earlier dates.

Inputs refresh from effective prices while resting and retain focused drafts.
Calculator buy/sell overrides remain in place until selecting another ticker.
Shared points in price history are labelled and cannot be edited through private
workbook edit/delete controls. Account changes unsubscribe and clear live data.

## Standalone market page and favourites

The QSE Market Prices page at `/market-prices` has compact ticker cards, a
searchable switcher grouped by opened, favourite, closed, and other tickers,
and page filters for dates, Manual/App/All sources, and flagged price changes.
Today and lifetime charts use every matching observation independently of table
pagination; large series retain observed extrema in a chart overview. Lifetime
low/high guides combine the selected sources, while the median describes the
visible observations. Timeframe buttons update the shared date filters.

QSE favourites are managed with each ticker card's star and stored separately for
each account at `users/{uid}/extensionConfigs/chartFavourites`, shared with the
extension. Guest favourites stay local. Failed saves retain a local pending copy
for retry. Both app and extension update only changed config fields, preserving
unrelated settings. PSX favourites are unchanged.

Standard cards use a shared 16px bottom spacing token. Containers that already
own section spacing suppress card margins to avoid doubling the gap.
