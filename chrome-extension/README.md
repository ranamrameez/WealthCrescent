> Current schema: shared market data is at database root `QSE`, independent of the signed-in user. Only personal extension configs belong under `users/{uid}`. Version 0.1.13 copies the previous `stockData/QSE` tree on the first shared-data read/sync, preserving existing root values. The old tree is retained as a migration backup and receives no new writes.

# TheGroup → WealthCrescent Price Sync (Chrome extension)

Scrapes live QSE prices — and company names — off [The Group](https://webd.thegroup.com.qa/en/markets/qatar)'s
market-watch page (while it's open in one of your own logged-in tabs) and pushes them into
the **shared** `QSE` node in WealthCrescent's Firebase Realtime Database — the
same node the web app already reads ticker names/fundamentals from — so the data is useful
to every WealthCrescent user, not just whoever runs this extension.

WealthCrescent's bundled ticker list (`webapp/src/lib/stockData/qseSeed.ts`) only ever
hard-coded a partial set of QSE's real listed companies and was never meant to be kept
up to date by hand. Since this extension already scrapes every row of the market-watch
table for a price, it captures that same row's company-name cell too and pushes it to
`QSE/tickerNames/{ticker}` — so running this for a while against the real page
is what actually fills in the app's ticker coverage, not a one-off manual edit.

## How it works

- **`content.js`** runs on the market-watch page and reads whatever's already rendered
  there. It never logs in, never fetches anything itself, and never sends the page's HTML
  anywhere — it only replies to the extension's own background script with parsed
  `{ticker, price, changePct, name}` rows. `name` (the company name) is best-effort: the
  heuristic fallback guesses it from whichever cell sits right after the ticker cell, but a
  real `nameSelector` set in Options (same "Test scrape" workflow as the other selectors)
  is far more reliable once you've seen the real page's layout.
- **`background.js`** (the MV3 service worker) does everything else:
  - **Collects** on the configured scrape interval (default zero, price-change only) and on rendered price changes while enabled, within the configured Qatar-time windows when enabled, and with the market page open. This is free/local ?—
    no network request beyond talking to the tab.
  - **Pushes** the latest scrape to Firebase only once at least the configured minimum
    number of minutes has passed since the last push, **plus a random extra delay on top**
    (so the real gap between pushes is randomized between 1x and 2x the floor — never a
    predictable period). Default floor is 2 minutes, adjustable in the popup. This keeps
    writes well under Firebase RTDB's rate limits and avoids a bot-like, perfectly periodic
    request pattern against both Firebase and the brokerage's own page.
  - Every ticker the scraper finds gets pushed — there's no per-ticker allow-list. A
    ticker's company name is pushed alongside its price whenever one was captured for that
    row (a missing/unreliable name never blocks the price push for the same ticker).
  - Talks to Firebase with plain `fetch()` calls (Identity Toolkit REST for auth, RTDB REST
    for reads/writes) — no Firebase SDK is bundled, since an MV3 service worker doesn't need
    it for this.
- **`popup.html`/`popup.js`**: sign in/out, the "minimum minutes between pushes" control,
  and live status (last scrape, last push, next push ETA).
- **`options.html`/`options.js`**: target URL + CSS selector overrides for the scraper, plus
  a "Test scrape" tool that runs against whatever's currently in the fields (even unsaved)
  so you can iterate against the real page without needing anyone else to see it.

## ⚠️ Required one-time setup: a Firebase Realtime Database rule change

This extension writes to `QSE/...`. That path's current security rules (set up
for WealthCrescent itself) most likely don't allow writes from just any authenticated
user — only the project owner can check/change this, since it needs Firebase console
access this repo's own AI sessions don't have. Open **Firebase Console → Realtime
Database → Rules** for the `qse-app` project and make sure `stockData` allows a write from
any signed-in user, e.g.:

```json
{
  "rules": {
    "QSE": {
      ".read": "auth != null",
      ".write": "auth != null"
    },
    "...": { "...": "leave every other existing rule (users/**, etc.) exactly as it is" }
  }
}
```

Don't replace your whole rules tree with just this snippet — merge it into whatever rules
already exist for `users/{uid}/...` etc. If you're not sure how those are currently
structured, export the current rules first (Rules tab → the JSON is right there) before
editing.

**Note:** the web app itself does not yet read `QSE/prices` or
`.../priceHistory` to resolve a stock's "current price" — today it only reads
`tickerNames`/`fundamentals` from this node. Wiring the app's own price resolution to
prefer this shared feed is a separate, follow-up change to the live app (real blast
radius: every QSE holding's displayed price, break-even, and P/L) and hasn't been made
here — ask for that as its own next step once you've confirmed real data is landing in
Firebase correctly. **`tickerNames` IS already read and merged in** (`webapp/src/lib/stockData/reader.ts`)
— any ticker/name you push here shows up in the app immediately, merged with (and
overriding on overlap) the bundled seed, with no extra wiring needed.

## Load the extension

1. `chrome://extensions` → enable **Developer mode** (top right).
2. **Load unpacked** → select this `chrome-extension/` folder.
3. Open the market-watch page in a tab and stay signed in there as you normally would.
4. Click the extension icon → sign in (see below) → open **Options** and use **Test
   scrape** to check whether the auto-detect heuristic finds real rows, or fill in real CSS
   selectors and save.

## Signing in

Firebase RTDB rules need *some* authenticated user, but — since prices land in the shared
`QSE` node, not any one person's own workbook — it does **not** need to be your
main WealthCrescent login. The popup's sign-in form has a **"Create a new account
instead"** checkbox that registers a brand-new, dedicated email/password account for this
purpose alone via Firebase's `accounts:signUp` endpoint, so your main password never has to
sit in this extension's local storage. Either works.

**Security note:** the popup stores a Firebase refresh token in `chrome.storage.local`
(this machine/profile only, never synced or sent anywhere but Firebase) so it doesn't ask
you to sign in every hour. That token can keep acting as whichever account you used
indefinitely until you click **Sign out**. Treat this browser profile as trusted, and
prefer the dedicated-account option above if you'd rather not put your main account's
credential material there at all.

## Tuning the scraper

The bundled heuristic (`content.js`) tries, in order:

1. **AG Grid** — a very common JS data-grid library, and what The Group's own market-watch
   page (webd.thegroup.com.qa) actually turns out to be built on, confirmed by inspecting its
   real HTML. AG Grid renders each row as `<div role="row" row-id="TICKER">` with per-column
   `<div role="gridcell" col-id="...">` children — real, stable identifiers the library itself
   guarantees. This tier reads the ticker straight from the row's own `row-id` attribute (not
   a text-cell guess) and looks up the price/name/change cells BY NAME (`col-id="lastPrice"`,
   `"name"`, `"changePercent"`, with a couple of common alternate names tried too) rather than
   by position. **This matters because column order is not reliable**: on the real page, the
   confirmed column order puts `col-id="askVolume"` and `col-id="askPrice"` BEFORE
   `col-id="lastPrice"` — a positional "first numeric cell after the ticker" heuristic (which
   is exactly what tiers 2-4 below use) silently grabbed Ask Volume as if it were the price.
   Naturally finds nothing (and falls through to the tiers below) on a page that isn't AG Grid.
2. every real `<table>`'s rows;
3. any `<tr>`/`[role="row"]` elements (for ARIA-grid widgets that skip `<table>` but still mark
   rows semantically) — note AG Grid rows also carry `role="row"`, so if tier 1 somehow finds
   nothing on an AG Grid page (e.g. a version with different attribute names), this tier will
   still see the same rows, just via the same weaker positional heuristic tier 1 exists to
   avoid;
4. only if all of those find nothing, a **div-grid fallback** — it looks for the single
   most-repeated `tag+class` element on the page (grouping every element by its own tag name
   and sorted classlist) and tries each candidate group, most-repeated first, treating each
   element's direct children as its "cells." This covers market-watch widgets built as a plain
   CSS grid/flexbox of `<div>`s with no semantic row markup at all.

For tiers 2-4, a "row" is scanned left-to-right for one ticker-like cell
(`[A-Z][A-Z0-9]{1,5}`) followed by a plain numeric cell, taken as the price; the company name
is guessed from whichever cell sits immediately after the ticker cell, if that text isn't
itself ticker-like or numeric. It's a reasonable starting guess for a page whose real column
order happens to put price right after the ticker, but a real page's actual markup can always
be captured explicitly instead (more reliable than any heuristic, and immune to a future
layout change breaking the guess):

1. Open the market-watch page, right-click the price table → **Inspect**.
2. Find a CSS selector that matches every stock row (e.g. `table.market-watch tbody tr`)
   and, within a row, one each for the ticker cell, the price cell, and (if the table has
   one) the company-name cell.
3. Paste those into the Options page, click **Test scrape**, and check the JSON output —
   each row should show the right `ticker`/`price`/`name`.
4. Save once it looks right.

## A note on scraping etiquette

This only reads what's already rendered in a tab you're personally logged into — it
doesn't automate logging in, bypass any auth, or scrape at a rate designed to look like
anything other than a slow, occasional refresh. Even so, check The Group's own terms of
use for their market-data page before leaving this running long-term, and keep the push
floor at a sane value (2+ minutes) rather than cranking it down — this protects both
Firebase's write limits and the brokerage's own servers.

## Configurations, controls and audit history

The extension page contains a Configurations card with the market URL,
all selectors, Firebase push interval and editable start/end time pairs in compact inline sections.
The popup contains Scrape, Push, Start and Stop actions, with a link to the full page
for account management, configurations and audit history. Defaults are
09:30?13:00 and 13:10?13:15 in Asia/Qatar. End times are exclusive; overnight
windows are supported. Start/Stop controls persist across browser restarts. A scrape
already in progress may finish when stopped. Manual scrape, push and test actions
work outside scheduled windows.

Open the extension page from the popup to inspect paginated local audit history.
Filter by Qatar date range, ticker, strategy, accepted/rejected result and scrape source.
Expand a record to inspect original column key/value text and selected source fields
before parsing. Invalid, nonpositive prices and invalid ticker symbols are excluded
from Firebase writes while remaining in the audit. History starts after this update;
it is stored in extension-local IndexedDB and is removed when the extension is uninstalled.
Audit data is not pushed to Firebase. No automatic history pruning is performed.

Run extension regression checks with:

```sh
node --test chrome-extension/extension.test.cjs
```

The data table defaults to Pushed data (Firebase), reading existing shared price history,
current prices and ticker names through the authenticated background worker. Date/ticker
filters and pagination apply to that history without requiring a market tab or a new scrape.
Use Refresh data to fetch a new snapshot. Local raw audit is a separate view; older
Firebase points do not contain original DOM key/value pairs. Identical consecutive prices
were not appended by the existing writer, so Firebase history is not a complete push log.

## Price provenance and corrections

Market selectors are no longer configurable; automatic detection selects the named
price grid column. New local audit records and Firebase history points retain the
selected priceKey and raw cell pairs. Existing records without provenance display
Unavailable rather than inferring a key. Outliers are classified against a nearby same-ticker price cluster rather than the previous chronological price. An outlier-only filter is available. Records without enough nearby consensus remain unflagged. See Nearby consensus outliers below.

The ticker dropdown is populated from all records in the selected view. Select rows
individually or select the current page; selections can span pages up to 100 records.
Apply price sets the same positive price on all selected rows after a preview
confirmation; Delete removes selected records from the chosen data source. Firebase
updates require sign-in and write access, use conditional writes to reject concurrent
changes, and report per-record failures. Corrections retain originalPrice and raw
source values. Editing/deleting the latest history point updates the current price
only when it still matches the original value. Local corrections affect local audit
history only. No historical raw values can be recovered from old price-only records.

A price-history chart below the table shows all matching records across pagination.
Choose a chart ticker to inspect its prices, with Qatar timestamps in point tooltips
and red markers for flagged outliers. Outliers are selected automatically by default
(up to 100 matching records for batch operations); unchecked rows remain unchecked
when refreshing. Toggle Auto-select outliers off to manage selection manually.

## Activity statistics

The popup and extension page both show live time since the last successful sync and
last scrape, next sync due, and daily scrape/sync counts with ticker-row totals.
Counters are persisted locally and reset at midnight in Asia/Qatar. Test scrapes
are included in scrape totals and also listed separately. A sync counts when at
least one price write succeeds; unsuccessful or partial attempts are listed too.
Wholly failed syncs do not change the last-successful-sync timestamp. Counters begin
with this update; historical activity is not retroactively counted.

Activity statistics also summarize retained local scrape batches and today's shared
Firebase history points. These include records saved before activity-counter tracking
started. Missing counters show Unavailable rather than zero, and a newer legacy
status timestamp prompts reloading the background worker. Statistics cover all
tickers regardless of the table filter. Stored history points are not sync counts:
unchanged prices are deduplicated, and shared points can come from other browsers.

The table and chart open on today in Qatar time, with All (synced and pending) as
the default data view. All view combines shared Firebase records with local audit
records and distinguishes confirmed syncs, older stored-price matches and pending
or unverified records. Firebase history and local audit remain separate options.
New successful pushes mark their local audit records as synced; local price edits
clear that confirmation. Combined-view batch operations target each record's source.

The chart defaults to All tickers, displaying one chart per matching ticker, with
1d, 7d, 1M, 3M, 6M, 1Y and All time buttons. These presets update the shared table
and chart date filters. Month/year presets use calendar boundaries; manual dates
remain available. All matching records are charted across pagination.

Activity cards now use local activity and audit records only; they do not fetch
Firebase history to display stats. Confirmed synced audit rows replace the cloud
history counter. Sync errors persist independently of scrape errors and remain
visible until a successful sync. Failed attempts observe the configured retry
minimum. Successful current-price writes count as synced even if a subsequent
history write fails, with the history failure shown as a partial-sync warning.

## Push timing and favourite charts

Configurations offer Random (1?2 times the interval) and Constant push timing.
Intervals may be zero: every successful automatic scrape then syncs immediately,
without an additional Firebase push delay. Collection uses the configured scrape interval and price-change trigger,
and follows Qatar-time windows when enabled. Constant timing aligns the next
collection alarm with the push due time where possible; browser alarm delays and
time windows still apply. Configuration changes recalculate the next push time.

The extension page includes Scrape now (local collection only) and Push now
(scrape then force a push), alongside Start and Stop. Every ticker chart has
Favourite and Full screen controls. Favourites persist in browser storage and
appear above the table, using the current date range and data view even when
the table is filtered to another ticker. Fullscreen charts stay open during
background refreshes; exit fullscreen to refresh the view.

Daily price ranges: the AG Grid highLow cell is read as High then Low from its
two spans. dayHigh/dayLow and highLowKey/highLowRaw are retained in local audit
and Firebase history. Invalid pairs retain raw values and rangeError. History
adds points for changed bounds or a new Qatar day even at an unchanged price.
The table shows both bounds; green chart ranges show reported daily extrema at
scrape time, without assigning an occurrence time to the extrema. Older records
without these fields show no range. Reload the extension and market tab to use
the updated content script.

## Ticker storage and account configurations (v0.1.12)

Fast app reads use `QSE/tickers/{ticker}`:

- `allPrices/{pointKey}`: full price points, including `dayHigh`, `dayLow`, raw
  provenance, date and timestamp. Unchanged consecutive values are deduplicated;
  a new day or changed daily bound retains a new point.
- `dayToDayBounds/{YYYY-MM-DD}`: `{ low, high, updatedAt }`, keyed by Qatar day.
- `allTimeBounds`: `{ low, high, updatedAt }` across retained price history.
- `latest`: the most recently synced complete price point.

Bounds include observed prices and valid reported daily High/Low pairs, so an
intraday extremum survives even if no scrape sampled that price. Occurrence times
for reported extrema remain unknown. The first sync for each ticker copies existing
legacy history and computes historical bounds. Following syncs read only small
latest/day/all-time nodes, use conditional writes to merge extrema, and atomically
append full points to canonical and compatible legacy history paths. Summary write
conflicts retry; partial failures remain visible in activity. History edits/deletes
rebuild summaries from retained history. Existing `prices`, `priceHistory` and
`tickerNames` readers remain compatible. Migration occurs on the next sync for
each scraped ticker, rather than at extension installation.

`users/{uid}/extensionConfigs` stores scrape and sync settings, favourites, each
favourite timeframe, and data-view/page-size/outlier-selection preferences. These
are restored on sign-in or opening the extension, with a local working copy for
offline operation. Failed writes retain a per-account pending snapshot and retry
on later changes or syncs. Authentication tokens and audit/activity records are
excluded. Another account does not inherit a previous account's settings.

Activity is the first page card with Local scrape and DB sync panels. Pinned charts
have independent 1d, 7d, 1M, 3M, 6M, 1Y and All time selections; these do not
change table dates.

Merge the following permissions/indexes into your existing Firebase rules if not
already covered by parent rules (do not replace the existing rules tree):

```json
{
  "users": { "$uid": { "extensionConfigs": { ".read": "auth != null && auth.uid === $uid", ".write": "auth != null && auth.uid === $uid" } } },
  "QSE": { ".read": "auth != null", ".write": "auth != null", "tickers": { "$ticker": { "allPrices": { ".indexOn": ["time", "date"] } } } }
}
```

The existing authenticated QSE write permission must also cover `tickers`. Rules
are documented here, not deployed by the extension.

### Live collection controls

Configure **Scrape interval (seconds)** independently of Firebase push timing. Zero disables periodic collection. Enable **Scrape on every price change** to observe rendered ticker prices (updates are coalesced within the current event loop); set the Firebase push interval to zero to sync each collected update. **Follow Qatar time windows** can be disabled for collection throughout the day. Start/Stop applies to both triggers. Short intervals use the open market tab timer; Chrome can throttle background tabs, so timing is best effort. Longer intervals use Chrome alarms. Reload the extension and refresh the market tab after installing this update.

Sign-in and account creation clear stale authentication errors and immediately request a sync cycle. Signed-out scraping records local audit data without attempting authenticated Firebase writes. Defaults enable price-change collection with zero collection and push delays, throughout the day; existing saved timing and Start/Stop preferences are retained. Retry alarms allow failed syncs to retry even without a new price change (Chrome may delay alarms). Activity displays live scrape and sync phases. The top navigation opens collapsible sections; collapsed state is retained locally.

## Action completion and filter audit (v0.1.17)

Options and popup show a shared live action banner. Conflicting actions are disabled and rejected by the worker; manual scrape/push replies arrive after completion and surface failures. Stop waits for ongoing work before reporting Stopped. Pinned charts default to Table dates and inherit all table filters; explicit per-ticker timeframes override dates only. Combined view supports local source, strategy and accepted/rejected filtering. Source-level findings, automated evidence and remaining live checks are in [AUDIT.md](AUDIT.md).

## Nearby consensus outliers (v0.1.18)

Price movement from a single previous quote is no longer classified as an outlier. For each ticker, observations within five minutes before or after a record are compared (up to 60 nearby positive samples). At least three peers must cluster within 10% of their median and represent at least two thirds of the comparison samples. A record is flagged only when it differs by more than 10% from that cluster median. Zero and negative observations can be flagged; they cannot act as reference prices. Sparse, undated or conflicting evidence produces no flag. Identical timestamp/price observations are deduplicated across sources. Classification runs before filters, so filtering does not redefine the baseline.

The table and chart tooltips show the reference median and supporting sample count. Remove flagged outliers selects only flagged records under the current filters, confirms the deletion, and removes at most 100 per batch from their respective local or Firebase stores. It does not delete normal manually selected records. Prices remain stored until that removal action is used. Previously automatically selected records are deselected when new evidence clears their flag.

Run the outlier regressions along with the other extension checks:

```powershell
node --test chrome-extension/outliers.test.cjs chrome-extension/audit-regression.test.cjs chrome-extension/extension.test.cjs chrome-extension/data-storage.test.cjs
```

## Historical starting-batch checks (v0.1.19)

Outlier details now include forward, backward, combined, and repeatable pseudo-random sampled comparison evidence. Near-time detection retains the 10% threshold. The wider historical fallback applies only to initial legacy records without price-column provenance, before the first positive observation with recorded column provenance. It uses at least six provenance-bearing records per usable comparison, requires an 80% stable cluster, and requires at least two historical comparisons to agree on reference price and direction with no usable historical comparison contradicting them. Historical discrepancies must exceed 1.5 times the reference price or fall below two thirds of it. This stricter cross-date threshold avoids classifying ordinary drift solely from later prices; it does not establish an authoritative historical market price.

Use All time in the extension page to review the initial records. Raw details include outlierMethod and outlierEvidence; the removal action uses the resulting flags and retains its deletion confirmation. Flags are recomputed from loaded data; no production records are deleted merely by loading or classifying them.

## Focused page and rendering performance (v0.1.20)

The page mounts local controls without waiting for cloud settings. Activity, controls and records open by default; charts, account, settings, tests and outlier review have visible collapsible sections and navigation links. Existing collapse preferences are retained. Advanced record actions and help use labelled disclosures. Show all columns restores the additional record columns. Test scrape preserves the current data view and filters.

Detected outliers has its own preview table with reference prices, deviation, source and expandable comparison evidence. Nothing is selected for deletion by default; select individual records or Select all flagged. The preview shows at most 100 records and reports the full flagged count. Review all time exposes historical records. Deletion still requires confirmation. Failed loads keep the last results visible, mark the preview outdated and prevent deletion until a successful refresh.

Local audit reads/classification share a versioned short-lived snapshot, combined data reuses classification across requests, matching local/Firebase prices uses an index, and date filtering caches computed Qatar dates. Pinned Table dates charts reuse the main query. Closed chart sections skip rendering. Large plots render at most 500 representative points (including bucket extrema and available flagged points), with a visible sample count; underlying records remain complete. All-ticker plots initially render six charts and offer Show more ticker charts. Raw record JSON and outlier evidence are built when opened. Auto-refresh is coalesced over 750 ms; activity evidence refreshes on completion or after its five-second cache expires.

Regression checks include performance.test.cjs. UI interaction checks run in jsdom; actual Chrome visual layout and production timing are not verified in this session.

## Material Teal appearance (v0.1.21)

Options and popup use the webapp Material Teal light palette. themes/base.css and themes/material-teal.css are local copies of the webapp theme sources, keeping the unpacked extension self-contained. themes/extension.css maps extension controls, sections, navigation, tables, preview and charts to those tokens, using the webapp typography stacks, rounded controls and surface styles. Destructive actions and outliers retain semantic warning/error colors. Refresh the copied source files when updating the shared webapp palette.

## Shared filters, feedback and manual controls (v0.1.22)

Filters for records and charts is the only source of date, ticker, data-view and outlier filters. The date presets use explicit labels such as Today and Past 7 days, an accessible pressed state, and a visible Selected indicator. Saved ticker charts replaces Favourite price charts; Load saved charts renders the saved subset of the already-filtered dataset, and Unload charts retains saved tickers. Legacy per-ticker timeframe settings remain stored for compatibility but are not read or applied.

About activity statistics uses the same information-wrap styles as the other explanations and preserves its open state across updates. Prior scrape errors are identified as history inside that wrap; current schedule pauses do not surface an old scrape error as a current failure. Action feedback is a dismissible toast with progress, success, warning, error, stopped or information type. It reflects the completed manual action even when automatic collection subsequently returns to a gated state, and background cycles do not repeatedly produce completion toasts.

Manual Scrape now, Push now and Test bypass Qatar-time windows. Start enables automatic collection and also takes an immediate manual sample. Subsequent automatic collection follows the displayed saved Qatar-time schedule when enabled; disable Follow Qatar time windows for continuous automatic collection. The market tab must be open and reachable, and syncing requires sign-in. This change does not establish why a previous live session stopped early; its saved schedule and page connection were not inspected.

Shared ui-controls.js and shared-ui.css apply consistent Material Teal button, chip, card and info-wrap classes to both static and generated controls. Controls, navigation, summaries and table headings have descriptive native tooltips. ui-regression.test.cjs covers manual schedule bypass, saved-chart filters, persistent information wraps, tooltip coverage and non-repeating typed toasts.

## Narrow-popup spacing (v0.1.23)

All extension components use border-box sizing. Toasts fit between the viewport edges instead of adding padding outside a viewport-based width; long messages wrap and can scroll while Dismiss remains visible. The popup uses a bounded width, flexible paired actions, and a single-column activity layout. Activity subcards use the shared inset-card class, explicit inner padding, heading spacing and panel gaps on both surfaces. Progress messages use plain ASCII ellipses.

### 0.1.24
- Top-bar Filters opens shared page filters and a searchable favourite-ticker checklist in a responsive modal. Favourite saves disable the checklist until completion and report failures.
- Charts use header icons, a visual legend, larger labels and one latest reported range per day. Account and activity panels are flatter, settings are more compact, and record actions are grouped by purpose.
