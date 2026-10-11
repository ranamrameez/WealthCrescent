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
