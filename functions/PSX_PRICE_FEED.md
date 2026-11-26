# PSX market-price recovery

## Request and status · 2026-11-26

Restore missing PSX prices through a backend that can use multiple providers. Research the remembered free API and record important user requests as they arrive. This change is in PR #118. Production activation and verification require Firebase administrator access.

The previous app provider is [psxdata-api](https://github.com/psxdata/psxdata-api#rate-limiting). It documents 60 requests per minute per IP. The repository schedules sync every 15 minutes. The reported 15 free calls and their time window could not be confirmed. The old worker stopped the whole run on the first HTTP 429 or 503, even when that happened before the screener. The live production failure still needs confirmation against Cloud Scheduler and Firebase status.

## Providers and cache

- Primary: psxdata-api's bulk screener. The worker requests it before auxiliary reference or detail datasets.
- Secondary: [PSX Investors v1 stock quotes](https://www.psxinvestors.pk/openapi.json), a bulk feed with partial symbol coverage. Enable it with `PSX_INVESTORS_FALLBACK=true` in the Functions environment after confirming provider and [PSX redistribution rights](https://www.psx.com.pk/psx/product-and-services/data-services-vending) for the shared cache. A public endpoint alone does not establish those rights. The adapter makes at most one secondary request per scheduled run and honors `Retry-After` on HTTP 429/503.
- The worker normalizes positive quotes and records source and observation time in the existing `PSX/api` namespace, under the encoded `/prices` key. The existing screener and references retain their own schema. Partial results retain missing symbols and older records cannot replace newer ones. A failed run leaves the last successful snapshot available.
- The client reads Firebase only, supports old deployments through the screener cache, and keeps newer manual prices. The screener timestamp describes the provider response, while the fallback adapter uses each provider-supplied quote timestamp.

## Activation and verification

Follow [PSX setup](PSX_SETUP.md), including verifying the shared read rule and deployed scheduler. Deploy only `functions:fetchPsxMarketData` to `qse-app`, then trigger its schedule once. Confirm `PSX/syncStatus.prices` and the published cache, then verify Market Prices and a stock detail on a clean browser session. Review scheduler logs to establish the production failure. Run `npm test --prefix functions` locally for primary, failover, retention, and rate-limit tests.
