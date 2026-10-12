# Extension engineering audit ? 2026-10-12

Version reviewed: 0.1.17. Scope: popup, options page, account/configuration flows, content-script collection, worker concurrency, Firebase reads/writes, audit data, table/chart filters, and navigation.

This is a source and automated interaction review. No connected browser/profile was available to capture the actual extension or exercise the live market page and Firebase. No screenshot, full accessibility, production permission, or absence-of-all-bugs claim is made.

## Findings and fixes

| Step | Flow | Result and evidence |
| --- | --- | --- |
| 1 | Click Scrape now / Push now | Fixed premature completion. The worker awaits that operation, returns the final status, rejects conflicting actions, and reports missing tabs, zero valid rows, and write failures. Deferred-write tests exercise the actual worker message handler. |
| 2 | Observe active work | Added a shared live status banner and action lock in options and popup. Tests check disabled controls, interception of conflicting clicks, phase changes, and unlocking. Labels use a polite live region; native buttons and details retain keyboard semantics. Visual contrast, focus movement, screen-reader announcements, and narrow screens still require Chrome verification. |
| 3 | Stop during sync | Stop waits for the current operation, clears collection/retry alarms, and leaves final scrape/sync states stopped. A delayed-write regression verifies completion order. |
| 4 | Filter main and pinned charts | Pinned charts now inherit table dates and other filters by default. An explicit per-ticker timeframe overrides dates only. Combined view supports source, strategy, and accepted/rejected filters. Tests verify table/chart results and inherited filter requests. |
| 5 | Change filters while a read is pending | Earlier responses cannot replace the latest view. Status-only changes no longer force full data reloads; refresh events are coalesced. Record mutation has a local busy guard and postpones automatic data refresh. |
| 6 | Configure and authenticate | Save runs through the worker action guard. Unsaved timing edits survive background config changes. Sign-in triggers sync and clears stale errors. Authentication refresh is shared across requests, retains sign-in on temporary service failures, and checks the current account before replacing/clearing credentials. |
| 7 | Handle failures and data reads | Partial failures count once and schedule retries; a failed write does not advance the successful push timestamp. Scrape responses have a 15-second timeout; network requests have a 20-second abort timeout. Concurrent history queries share an in-flight read. Config loads clear stale persisted busy flags using actual worker state. |
| 8 | Navigate and collapse sections | Navigation opens its target section. Collapsed state is retained locally. Automated DOM checks cover all eight sections. Actual layout and scrolling remain unverified. |

## Verification

- 64 automated regression checks passed across audit-regression.test.cjs, extension.test.cjs, and data-storage.test.cjs.
- Syntax checks passed for all 19 extension JavaScript modules.
- Extension diff whitespace check passed.
- Checks use simulated Chrome APIs and jsdom, including real DOM event/mutation handling; Firebase operations use controlled responses rather than production writes.

Run:

```powershell
node --test chrome-extension/audit-regression.test.cjs chrome-extension/extension.test.cjs chrome-extension/data-storage.test.cjs
```

## Remaining live acceptance checks

1. Reload 0.1.17 in chrome://extensions and refresh the configured market tab. Confirm signed-out price changes create local audit records and show Waiting for sign-in.
2. Sign in and confirm automatic sync completes without requiring another price change. Compare a current price and its audit sync marker with Firebase.
3. Click Push now while a write is underway. Verify current phase, disabled conflicting controls, then completed/failed status. Stop during that write and confirm final state remains stopped.
4. Exercise date, ticker, source, strategy, accepted/rejected and outlier filters in local and combined views. Verify the main chart and pinned Table dates charts match; test an explicit pinned timeframe override.
5. Disconnect/reconnect the network and confirm retry status, retained sign-in, and recovery. Restart the worker while busy and reopen the page to verify status recovery.
6. Check keyboard navigation, screen-reader announcements, narrow-window layout, collapsed sections, and fullscreen charts in the actual extension.
