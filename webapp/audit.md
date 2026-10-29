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
