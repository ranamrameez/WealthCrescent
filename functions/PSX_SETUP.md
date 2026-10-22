# PSX shared market cache

The web app reads Firebase only. `fetchPsxMarketData` refreshes the provider
every 15 minutes; page loads never call the third-party API. The worker fetches
seven market-wide datasets and up to 35 requested detail datasets per run,
spaces provider calls by 1.2 seconds, and stops on HTTP 429/503. Failed fetches
retain existing cache/reference values. A seven-minute work budget leaves room
for the function to save its status before its timeout.

## Database paths

- `PSX/reference`: sectors keyed by normalized sector code, `tickerGroups`,
  `tickerSectors`, listed `symbols`, source and provider response timestamp.
- `PSX/api/{key}`: API path, fetch time and JSON payload. JSON preserves empty
  arrays and null values that Realtime Database otherwise removes.
- `PSX/requests/{key}`: validated dataset paths awaiting scheduled refresh.
- `PSX/syncStatus`: last run time, refresh count and failures.

These paths are separate from private `users/{uid}/psx` workbooks. Reference
generation requires fresh sectors, stock list and screener inputs. Sector
codes such as `0804` and `804` join correctly. Symbols without an available
membership stay Unclassified. The bundled sector/company-name seed remains
available before the first successful sync.

## Activate

1. Merge `psx.database.rules.fragment.json` into the existing database rules'
   `rules` object. This is a fragment, deliberately not a replacement rules file.
   Do not overwrite the existing user/workbook rules. Review any ancestor-level
   write grants too: child rules cannot revoke an ancestor grant.
2. Authenticate Firebase CLI for project `qse-app`, install `functions/`
   dependencies, and deploy `functions:fetchPsxMarketData`. Scheduled functions
   require the project's billing/scheduler setup.
3. Run the deployed function once from Cloud Scheduler, or run
   `node functions/runPsxSync.js` in an administrator environment with Application
   Default Credentials. This bypasses client-only read rules through the Admin SDK.
   Alternatively, bootstrap essential
   data with `node functions/seedPsxReference.mjs --write`. The bootstrap accepts
   an existing authorized Firebase ID token through `PSX_FIREBASE_ID_TOKEN`;
   never commit tokens. Use an authorized administrator environment for writes
   if client rules correctly prohibit writing shared data.
4. Verify `PSX/reference` and `PSX/syncStatus` before claiming production is active.

The bootstrap writes only the owned `PSX/reference` and three essential API-cache
paths using one PATCH, then reads the reference back to verify it. Without
`--write`, it only validates and reports provider data.

## Dataset coverage

All documented endpoint families are exposed: health; stocks (including index
filter); quote; historical daily OHLCV; fundamentals/company disclosures; index
list and constituents; sectors and sector tickers; screener; debt market; and
eligible scrips. Optional datasets are requested when their section is opened.
A missing dataset can take up to the next scheduled run to appear; the UI
automatically checks pending datasets every minute while the section is open.
Only signed-in users can enqueue a dataset. Cached market/reference data is public.

The provider's `meta.timestamp` is response generation time, not the time of the
last exchange trade. Historical records retain their supplied trading dates.
The fundamentals endpoint supplies disclosure documents, not statement ratios.

## Verification

`npm test --prefix functions` tests joins, request validation, serialization and
rate-limit retention without production writes. `node functions/checkPsxApi.mjs`
checks the actual endpoint response shapes without touching Firebase.

Session result (2026-10-22): all documented endpoint families returned HTTP 200;
38 sectors and 1,048 listed symbols were returned. The production bootstrap
received HTTP 401 at its initial read, so no production write was attempted.
Deployment and initial population still require authorized Firebase access.
