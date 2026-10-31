# FinanceMaster Audit — bug finding + fixes

**Audit branch:** `chatgpt-audit-20260916-v2`

**Verified main baseline:** `064102aab1611071cd981dbf1ab2a6b393ce652b` (2026-09-16 18:02:03 UTC)

**Purpose:** Find financial/data/UI anomalies in the current application, fix confirmed defects on the audit branch, and add regression coverage where practical. No PR or merge is performed automatically.

## Fixed findings

- **HIGH — Pending trades in actual cash ledgers:** `buildCashLedger()` now excludes pending BUY/SELL orders itself, preventing cash-summary/ledger divergence.
- **HIGH — Pending PSX orders affecting filled-trade fee pairing:** `sameDayChargedSide()` now excludes pending transactions.
- **HIGH — Same-instant transaction chronology:** persisted `seq` is now authoritative when both tied transactions have sequence values; legacy untimed records retain the BUY-before-SELL fallback.
- **HIGH — Oversells creating fictitious profit:** weighted-average, FIFO, realized-P/L-series and cash-ledger paths now ignore unmatched SELL transactions because this app does not model short positions.
- **HIGH — Transfer IDs missing at insertion:** `addTransfer()` now generates UUIDs immediately.
- **MEDIUM — Trade-plan identity:** `addTradePlan()` and normalization now guarantee a plan ID and `legs` array.
- **HIGH — Pending bank activity in actual analytics:** running ledger, category totals, monthly flows and balance-derived analytics now exclude pending transactions.
- **HIGH — Pending cash activity in actual analytics:** running ledger, category totals and monthly flows now exclude pending entries.
- **HIGH — Pending rental activity in actual analytics:** category and monthly rollups now exclude pending entries, matching net-income behavior.
- **HIGH — Pending personal-loan repayments in actual history:** running repayment history and monthly repayment totals now exclude pending repayments.
- **MEDIUM — Personal-loan payoff date timezone drift:** `projectPayoff()` now uses UTC calendar arithmetic, preventing one-day shifts.
- **HIGH — Pending Cash/Bank activity in net-worth flows/drill-downs:** `flowByCurrency()` and `flowActivity()` now exclude pending records.

## Regression coverage added

`webapp/src/lib/calc/__tests__/calc.test.ts` now covers exact tick break-even behavior, persisted same-instant transaction sequencing, oversell protection, pending position exclusion, pending cash-ledger exclusion, and realized-P/L oversell protection.

Existing FIFO and PSX fee tests were also reviewed; FIFO already has focused coverage for partial sells, fee allocation, oversells, same-day round trips and specific-lot targeting.

## Reviewed without a confirmed defect

- QSE weighted-average position/P&L path after chronology and oversell fixes.
- PSX average-vs-FIFO selection and FIFO lot attribution.
- PSX fee-override precedence.
- Firebase empty-cloud protection, initial-snapshot race protection, undefined-value stripping and remote-echo protection.
- Finance migration helpers for legacy categories, deposit direction and serial numbers.
- Credit Card's separate transaction model.
- Net-worth asset/liability sign conventions.

Firebase whole-workbook writes remain effectively last-write-wins across concurrent sessions. This is a synchronization design limitation, but without a defined conflict-resolution product requirement it was not silently replaced during this audit.

## Verification limitation

Source inspection and commits were performed through the repository connector. A local `npm test`/`npm run build` could not be executed because outbound GitHub/DNS access is unavailable to the container. Regression tests were added and statically reviewed, but their runtime result is not claimed.

## Status

**Financial/data calculation audit and fix pass complete for the reviewed application surface.**

All fixes are on `chatgpt-audit-20260916-v2`. No PR was opened and no merge was performed.


## Broker-profile implementation audit — 2026-10-29 (in progress)

- Added broker-owned transaction, transfer, adjustment, dividend, and trade-plan data with profile-specific settings. The store snapshots the active profile before each mutation and restores that profile on switch; profile histories are persisted inside the existing exchange workbook/cloud path, so this does not introduce a second cloud path.
- Legacy QSE data migrates to **The Group**; legacy PSX data migrates to **JS Zindagi**. No trade fields are intentionally recalculated by migration. Active profile settings are seeded from the legacy workbook settings to preserve existing fee/cost-basis behavior.
- Initial PSX profiles: JS Zindagi uses the existing settings calibrated against the user's historical JS statement; AL Habib Capital Markets is prefilled from its published account-opening commission schedule (PKR 0.03/share up to PKR 20, 0.15% above PKR 20.01). Other levies require contract-note reconciliation.
- Added broker management route, profile selector in top bar and side menu, and regression tests for broker switching, legacy migration, and commission defaults. PSX same-day netting is now profile-specific: JS Zindigi uses its published higher-value-side rule; AL Habib does not inherit that rule because its accessible tariff does not document it. The Add Trade FAB now closes its modal only after the existing transaction submit handler succeeds, on both exchanges.
- **Validation results (2026-10-29):** Node 24 production type-check/build passes; focused `createWorkbookStore.test.ts` and `psxFees.test.ts` pass. Full suite currently reports 7 failures across 5 untouched test files (`categoryMerge.test.ts`, `resetLocalData.test.ts`, `planControls.test.tsx`, `PriceInput.test.tsx`, `bankNavigation.test.tsx`); they are outside the feature's direct diff, but the baseline status should be confirmed. The initial Node 20 test run failed before executing tests because current jsdom dependencies require Node 22.22.2+; CI now uses Node 24.
- **Still required:** browser verification of FAB save + broker switching/CRUD, Firebase round-trip with empty profile arrays and legacy cloud documents, and contract-note reconciliation of AL Habib's remaining levies. Do not describe the full suite as green.

## 2026-10-29 — Follow-up status after CI baseline repair

PR #28 merged the existing CI regression fixes and the final PR CI passed the production build plus all 134 test files. Do not keep reporting the earlier `categoryMerge`, `resetLocalData`, `planControls`, `PriceInput`, and `bankNavigation` baseline failures as current main failures. This does not validate the separate global transaction-order proposal formerly in PR #22. That stale PR is now closed; global transactionIndex/cross-date reordering remains deferred and unverified. See `webapp/SESSION_HANDOFF.md` for the preserved source SHA and the cash-ledger order consistency concern.

## 2026-10-29 — Transaction-page cost-basis consistency slice (merged in PR #31; CI green)

The relevant transaction-page cost-basis parts of PR #22 were ported to fresh work and merged in PR #31. The remaining global transaction-order proposal was not ported and must not be merged wholesale.

- QSE/PSX transaction-row SELL P/L now uses the weighted-average per-SELL calculator when `costBasisMethod` is `average`; FIFO and lowest-cost-first use the configured lot match method.
- Open/Closed lot-attribution tables are shown only for FIFO/lowest-cost-first. Average cost shows an explanation because lot-by-lot attribution is not mathematically applicable to weighted-average accounting.
- Removed the QSE page-filter lot-matching override and the PSX page-local match-order selector so they cannot contradict configured settings.
- Added tests for weighted-average per-SELL P/L and unmatched oversells. The production build and full test suite passed in PR #31.

Still pending: audit Dashboard, Position Detail, analytics/time series, exports, charts, strategy/advisory surfaces, and the transaction-index/cash-ledger ordering design. See `webapp/SESSION_HANDOFF.md`.


## 2026-10-29 — stale PR cleanup

- PR #22 was closed and retitled as superseded after its transaction-page cost-basis slice landed in PR #31. Original head `d962a49f03b170d7a6ff7bc6c141c366809b5804` is retained for recovery; do not merge or branch new work from it.
- Global transactionIndex/cross-date reorder remains deferred until accounting order and the date-ordered cash ledger are reconciled and regression-tested. This is not complete and no claim is made that cross-date reorder is safe.
- PR #23 was already closed as superseded; its unique save-failure recovery is on main via PR #30.
- PR #32 refreshed the session handoff and corrected status records; PR #33 documented closure of the stale accounting PR and its deferred scope. Old PR branches are retained because the connected GitHub tools available here do not expose branch deletion. Retaining a recovery reference is safer than destroying potentially useful unported work; closed PRs cannot be accidentally merged through the normal open-PR workflow.

## 2026-10-30 — Persisted trade accounting order (fresh branch; pending CI)

Reviewed the stale PR #22 source against current main and ported the transaction-order slice to a fresh branch from main rather than merging the diverged branch. The implementation adds a global persisted `transactionIndex`, preserves existing indexes, backfills legacy records deterministically, assigns indexes to new transactions, and makes shared transaction calculations consume that order. QSE and PSX transaction lists default to accounting order and expose cross-date reorder controls. Per-ticker `seq` remains separate and is swapped when moving between two trades of the same ticker.

Regression coverage now asserts that an explicitly indexed SELL can be processed after a BUY even when its recorded date is earlier. The mixed cash ledger remains date-ordered because it combines trades with transfers and adjustments that do not yet share a single global event index. Same-instant trade events use `transactionIndex` as their tie-breaker, but **cross-date trade reordering is not yet reflected as a unified mixed-event cash-ledger order**. That remaining design gap must be resolved before claiming the full ordering requirement is complete. No test/build success is claimed until CI runs.

## 2026-10-30 — Canonical synchronized transaction indexes (PR #36 open)

Clarification from the user: `globalTransactionIndex` and `perTickerIndex` are the only canonical transaction-order fields and must remain synchronized. Global order is the total accounting sequence across the workbook. Per-ticker order is derived from that same total sequence for each ticker. Every reorder changes the global ordering, then a shared `syncTransactionIndexes()` helper recalculates all per-ticker indexes. The old `transactionIndex` and transaction `seq` fields are compatibility mirrors only, not independent sources of truth.

The store normalizes legacy records, assigns both indexes for newly added transactions and executed trade-plan legs, and re-synchronizes indexes after add/edit/delete. QSE and PSX cross-date reorder controls use the same helper. Regression coverage checks that global and per-ticker indexes plus their compatibility aliases remain aligned after a cross-ticker reorder. CI/build is still required before merge.

Known separate issue: the mixed cash ledger includes transfers and adjustments, which do not have these transaction indexes, and continues to display by effective date. This PR synchronizes transaction indexes but does not define a global order shared by all mixed cash-ledger event types.

### QSE batch editor regression repair (2026-10-30)

The previous PR #36 CI run passed the production build but failed full tests. Investigation found two actual batch-editor defects: QSE validation treated the derived `perTickerIndex` as a required editable numeric input (breaking CSV/ledger imports and new batch rows), and `BatchEditGrid` did not count/apply hidden canonical `globalTransactionIndex` drafts created by reorder buttons (leaving Save disabled). The QSE validator now skips the derived per-ticker index, and BatchEditGrid applies hidden `orderKey` drafts as changes. The live-price input test now waits for the effect that syncs the input after a scraped price arrives. Regression rerun is pending; do not mark CI green until a fresh PR run completes.

### QSE duplicate-import signature correction (2026-10-30)

The fresh CI run confirmed the previous batch-editor fixes: the remaining QSE failures were duplicate detection still including derived `perTickerIndex` in the import signature, plus the live-price input test's feed update timing. Import signatures now ignore both legacy `seq` and derived `perTickerIndex`, so an otherwise identical trade is not re-imported merely because its sequence differs. The live-price test now applies the feed update after mount inside React `act()`. Fresh CI remains pending.

### QSE local-date/live-price comparison correction (2026-10-30)

The remaining live-price input failure exposed a timezone edge case, not just an async test issue: Qatar's local calendar day can already be the next date while the UTC timestamp is still on the previous day. Comparing a date-only manual point via `Date.parse(date)` incorrectly treats it as midnight UTC and can make it appear newer than a live quote from the same local day. `applyLiveQse` now compares calendar dates first and timestamps only within the same date; timestamped points sort after date-only points on that same date. Added regression coverage for the Qatar local-day/previous-UTC-day boundary and for preserving a manual point from a later calendar day. Fresh CI is pending.

## 2026-10-30 — Mutual Funds effective-date and amount-edit fix

A fresh main-based branch ports the scoped Mutual Funds corrections after PR #36 merged:

- Balance-history rows display the canonical effective `date`; history order uses `date`, then `time` only for same-day ties.
- Editing a historical NAV point now re-synchronizes `marketPrices` by effective date rather than allowing its retained audit timestamp to override the user's date correction.
- Invest/Withdraw edit mode accepts Amount and derives units using the transaction NAV (`unitsFromAmount`).
- Regression tests cover amount-to-units conversion, effective-date ordering with a stale timestamp, and latest market-price synchronization.

**Originally deferred, now implemented in draft [PR #46](https://github.com/ranamrameez/WealthCrescent/pull/46) on `feat/funds-cash-reconciliation` (issue #42):** one portfolio-level Funds cash account per currency. This matches the existing linked-transfer model, where the Funds side is portfolio-level and has no fund/broker reference; per-fund cash would make linked deposits ambiguous. A valid BUY reduces that currency's cash and adds NAV-valued units; a valid SELL returns proceeds to cash. Cash and holdings are combined once for Net Worth, including historical as-of calculations.

PR #36 is merged and passed run #94. Broker-profile isolation is being re-targeted through PR #39; the Funds date/amount patch is being re-targeted through PR #40. Only merge each after its own latest-head full test suite and production build pass.


## Broker-profile isolation — PR #41 current checkpoint (2026-10-30)

The broker-profile implementation is on clean branch `feat/broker-profile-isolation-main` and main-targeted PR #41. It scopes QSE/PSX transactions, transfers, adjustments, dividends, trade plans, settings and calculations by broker ID while keeping market prices, price history and watchlists exchange-wide. Linked transfer add/edit/delete resolves inactive profile records by broker ID. Legacy PSX migration assigns unscoped records to the JS Zindigi/JS Zindagi default profile and preserves financial fields. Archived profiles are view-only; deactivated profiles cannot be selected as active.

The original stacked implementation passed run #99. Clean PR #41 passed run #105 (full tests + production build) before incorporating the merged PR #40 NAV-ordering regression and latest documentation. Re-run Actions on the latest head before merge. Manual backup/export migration review and browser verification remain required; automated tests alone do not certify the user's real legacy data.


## 2026-10-30 — PR #43 latest CI result

Clean main-based broker-profile PR #43 passed GitHub Actions run #107 on exact head `b31bbd264d105c0445abc655abe2f083017e9407`: full tests and type-check/production build succeeded. Remaining pre-merge validation is manual: inspect a real legacy PSX backup/export after migration and verify broker switching, linked transfer add/edit/delete (including inactive profiles), and Archived/Deactivated UI behavior. The connected browser session was unavailable, so this manual verification remains outstanding.


## PR #43 latest-head CI (2026-10-30)

Latest head `dcf3181a0a8955417c4049089f4735685c25a8ec` passed Actions run #112 (full tests + production build). Manual migration validation against a real backup/export and browser verification are still outstanding; no merge until completed.


## 2026-10-31 — Funds cash reconciliation (issue #42; implementation branch)

Design decision: a separate **portfolio-level cash account per currency**, not per fund or broker. Existing Funds linked transfers are portfolio-level and do not identify a fund or broker; adding a per-fund account would make the current link picker ambiguous. Fund BUY/SELL transactions are attributed to their fund's currency.

- Added optional `Transfer.currencyCode` for Funds transfers. New plain and linked transfers persist the selected currency; edit flows preserve it.
- Added a versioned, metadata-only migration (`cashLedgerMigrationVersion`) that snapshots the legacy Funds default currency once. Existing transfer records are not rewritten. Legacy rows remain readable under that frozen currency and the Cash ledger warns users to review/assign an explicit currency where needed.
- Added `fundsCashLedgerByCurrency` / `fundsCashBalanceByCurrency`. These reuse the shared cash-ledger matching rules: pending trades and unmatched SELLs do not move cash; transfer fees are applied once; currencies never net against each other.
- Funds Summary now separates invested cost basis, holdings value, cash on hand and total Funds value. The Transfers table's balance is currency-specific and includes intervening BUY/SELL activity; the new Cash ledger shows all events.
- Current and historical Net Worth include Funds cash plus holdings exactly once. Funds cash has its own inclusion toggle; individual fund toggles do not alter the portfolio cash ledger.
- Regression tests cover deposit/BUY/SELL/withdrawal arithmetic, fees, multi-currency separation, unmatched SELL exclusion, legacy currency fallback and historical Net Worth.

**CI validation passed:** Actions run [#280](https://github.com/ranamrameez/WealthCrescent/actions/runs/41204911191) passed 138 test files / 1,093 tests, type-check and production build on application-code head `28028459c82aa12c976fd4410588e8d24d24d7a3`. Later commits are documentation-only. **Manual validation remains:** inspect a real pre-migration backup/export and perform interactive browser smoke tests. The browser connection was unavailable in this session; PR #46 remains draft.