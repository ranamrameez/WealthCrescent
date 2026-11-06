# Calculation Engine and Application-Service Architecture

Status: Approved direction — implementation starts incrementally on `fix/net-worth-dashboard-parity-and-accounting`.

## Non-negotiable architectural rules

1. **UI is presentation only.** Components render view models, collect input, expose loading/error/empty states, and dispatch user intent. They must not calculate financial values, derive business statuses, build projections, validate domain invariants, or mutate stores directly.
2. **All reads and writes cross an application-service/function boundary.** Components and page hooks call named services/queries/commands. They do not import Zustand stores, Firebase clients, calculation modules, or persistence helpers. A component may use a service hook as an adapter for subscription/loading state, but the service owns the data access.
3. **One financial calculation authority.** `CalculationEngine` is the public entry point for every non-stock financial calculation: cash, bank, cards, budgets, projects, planned payments, recurring occurrences, EMI, rentals, subscriptions, transfers, net worth, forecasts, reconciliation and summaries.
4. **Stock calculations remain centralized.** Existing `stockCalculationEngine.ts` and `portfolioCalculationEngine.ts` are the stock-domain engine implementation (the StockExchangeEngine concept). They are invoked behind the same CalculationEngine boundary; do not duplicate or rewrite stock accounting as part of the finance work.
5. **Services orchestrate; engines calculate.** Application services own authorization, validation, persistence, idempotency and transaction orchestration. CalculationEngine is deterministic and side-effect-free: input in, result out. No Firebase or React imports inside the engine.
6. **One source of truth per fact.** Existing native module ledgers remain authoritative for actual transactions. A planned payment is not an actual payment. Auto-pay creates one pending native-ledger record; only explicit settlement confirmation makes it cleared.
7. **No direct money movement.** No bank APIs, payment-provider APIs, external transfers or claims of real-world execution. Auto-pay is in-app scheduled ledger processing only.

## Target layers

```
UI components / pages
  -> feature query hooks + command functions (presentation adapters only)
    -> Application Services (read models, commands, validation, authorization)
      -> CalculationEngine (all deterministic financial calculations)
      -> Repositories (Firebase/local persistence, module stores)
      -> Scheduled Functions (due-payment automation)
        -> Application Services / CalculationEngine domain functions
```

### CalculationEngine

Create one stable public facade (initially under `webapp/src/lib/calc/CalculationEngine.ts`, then move behind the service boundary without changing its public contract). It owns the public calculation API and delegates to private domain modules. No UI or feature hook imports private calculators directly.

Domain capabilities:
- `stocks`: existing StockExchangeEngine implementation, including positions, cost basis, fees, cash ledger, realized P/L and reconciliation.
- `funds`: NAV-based holdings and cash valuation, delegated to the same stock engine for position lifecycle and unmatched-SELL semantics.
- `cash`, `bank`, `creditCards`: cleared/pending balances, ledgers, category and period summaries.
- `budgets`: category and project budgets, allocations, actual-vs-budget, available-to-spend, rollover rules and currency-safe aggregation.
- `plans`: recurring occurrences, planned vs pending vs settled lifecycle, due/overdue status and remaining amounts.
- `payments`: deterministic occurrence keys, pending-payment construction, partial settlement and reconciliation.
- `netWorth`, `emi`, `rentals`, `subscriptions`, `transfers`: all derived values and forecasts currently implemented in domain calculation files.

Existing calculation modules are implementation details during migration. Keep their behavior and tests; do not delete or rewrite working calculations merely to rename them.

### Application services and component contract

Use explicit query and command interfaces, grouped by domain (for example `financeQueries`, `budgetCommands`, `paymentCommands`, `stockQueries`). Service functions return typed data/view models and typed errors. Components may format primitive values for display (date/currency localization and labels), but may not calculate or infer financial meaning.

Forbidden in UI components:
- importing Zustand stores or calling `.getState()`, `.setState()`, `.addEntry()`, `.updateEntry()`, `.deleteEntry()`;
- importing `lib/calc/**`, recurrence, ledger, fee, budget or net-worth calculators;
- calculating totals, balances, status, due labels, percentages, remaining amounts, forecasts or filtered financial aggregates;
- writing directly to Firebase/localStorage or invoking persistence helpers.

Feature hooks are adapters, not alternate business layers. They subscribe to service query results and expose loading/error/data; they must not own calculations.

## Unified budget model

A budget can be category-based, project-based, or linked to both through explicit allocations. Category and project are separate dimensions, not separate competing calculation systems. A single budget allocation model feeds one CalculationEngine.

- Category budgets answer: how much may be spent in a category over a period?
- Project budgets answer: how much is allocated to a named goal/project, and how much remains?
- One actual transaction can be allocated to a category and optionally a project. The same amount must not be counted twice in global spending.
- Unallocated actuals remain visible as unallocated; never silently assign them.
- Currency is part of every budget/amount identity. No cross-currency sum without an explicit conversion policy and dated FX input.
- Internal transfers are not income or expense.
- Existing FinancePlanGroup is a grouping/goal concept; preserve it and migrate/extend only through explicit, lossless mapping. Do not discard plan groups or native planned entries.

## Auto-pay: app-only pending-ledger automation

Auto-pay is an opt-in policy on an eligible planned outflow. It never calls a bank or payment API.

At the scheduled due date, a scheduled backend function:
1. Loads eligible due plan occurrences for the account.
2. Uses a deterministic occurrence identity: `userId + module + planId + occurrenceDate`.
3. Checks execution history and existing ledger linkage before creating anything.
4. Creates exactly one **pending** record in the corresponding native module ledger, linked to the plan occurrence.
5. Records the execution result and advances that occurrence's processing state atomically/idempotently.
6. Leaves the record pending until the user explicitly confirms settlement. A failed/cancelled pending record can be voided; it must not be silently treated as cleared.
7. Retries safely after partial failure. Reprocessing the same occurrence must never create a duplicate pending record.

The existing recurrence engine remains the source of occurrence dates. The scheduled function must use the same CalculationEngine domain function as interactive preview; it must not implement a second recurrence or amount calculator.

Eligible payment directions are outflows only in the first release. Income forecasts and rental income are not auto-paid. Credit-card planned charges need explicit lifecycle mapping before inclusion. Never auto-execute a plan that is already fulfilled, excluded, cancelled, archived, or linked to a deleted/inactive finance source.

The existing planned workbooks are stored separately at `users/{uid}/plannedCash`, `plannedBank`, `plannedCreditCard`, and `plannedRentals`; native ledgers are separate workbook paths. Because the current client sync writes whole workbook documents, backend execution must use a transaction-safe repository strategy and deterministic IDs. Do not implement the scheduler by naively appending to an array or using a client-side timer.

## Migration and compatibility strategy

1. Add the CalculationEngine facade and service contracts without changing existing financial behavior.
2. Add contract tests that compare facade results with the existing tested calculators.
3. Migrate one vertical slice at a time: planned payment read/write -> pending execution -> settlement -> unified budget read models.
4. Move UI consumers to services. Remove direct store/calculator imports only after each consumer is migrated and verified.
5. Migrate Cash, Bank, Cards, Rentals, EMI, Subscriptions, Net Worth and Planning in focused slices. Keep StockExchangeEngine behavior and tests intact while routing its public consumers through the central facade.
6. Preserve persisted workbook shapes and existing user data. Any schema change needs a backward-compatible reader, explicit migration, and tests.
7. Add scheduled auto-pay only after the repository supports safe idempotent multi-workbook updates. Test duplicate invocation, concurrent edits, retry after partial failure, recurrence boundaries, inactive sources, partial settlement and cancellation.

## Required verification

For each slice: relevant unit tests, component/service tests, TypeScript check, production build, and regression tests for existing module behavior. Inspect the complete diff against the latest `main` and ensure no user changes were dropped. Commit small focused changes on the existing working branch; never push directly to `main`. Update this document and `webapp/SESSION_HANDOFF.md` at each meaningful checkpoint.


## 2026-11-04 implementation checkpoint — Upcoming query boundary

- Added `src/services/finance/upcomingService.ts` as the application-owned read boundary for the Upcoming list. It owns source-store subscriptions, gathers the module inputs, and calls `CalculationEngine.upcoming.collectUpcomingItems`.
- Reduced `useUpcomingItems` to a `useSyncExternalStore` adapter. It no longer imports stores or calculation modules.
- Moved the human-readable due-timing label into the calculation result; `UpcomingList` now renders the supplied label rather than calculating date differences.
- Added a service subscription/cache invalidation test and an engine regression assertion for the due label.
- This is one migrated vertical slice only. PlanningPage, FinancePlansHierarchy, other UI consumers, plan write commands, and scheduled app-only auto-pay are still pending. Do not describe the architecture or auto-pay feature as complete.
- Validation is pending on the exact final PR head. CI must run the complete webapp test suite and both TypeScript checks/production build. A passing CI run does not replace the required interactive UI review.


## 2026-11-04 follow-up — Funds engine delegation

- Added the `funds` namespace to the public `CalculationEngine` facade; FundsScope now calls the facade rather than importing the private Funds calculator directly.
- Funds valuation, category allocation, and matched SELL quantities for the Funds cash ledger now use `calculateStockPortfolio` rather than a separate `computePositions` or hand-written oversell-matching pass.
- Added a regression test for a partial oversell, a later re-entry, and a pending BUY; only the five actually held units contribute to current value.
- This does not complete the UI service migration: FundsScope and other existing pages still need application query services before they are presentation-only.


## 2026-11-04 CI result

GitHub Actions run #424 passed on PR #51 head `aacb7c60bab1ca4d1df1597e59d388091bcd5621`: 144 test files / 1,143 tests, broker-profile and PSX-fee regression tests, TypeScript checks, and production build. This validates the code and documentation at that head. Manual browser review is still outstanding, and the application-service migration plus scheduled app-only auto-pay remain incomplete.


## 2026-11-04 continuation — Planning queries and commands

- Added CalculationEngine.planning read models for activity filtering, monthly budgets and plan hierarchy/occurrences/status/analytics. Pure plan types and presentation primitives live in calc/financePlanModel.ts; the engine does not import store implementations.
- Added planningService.ts and thin useSyncExternalStore adapters. Queries cache stable snapshots by source revision, filters, selected plan and UTC calendar date; subscribers refresh open-page day-dependent statuses each minute. Category/module aggregates now include currency in their identity.
- PlanningPage and FinancePlansHierarchy no longer import stores or private calculators. The shared payment, group and finance-link editors read sources through the service and dispatch save/relink/delete commands. Authorization and existing stale-edit, active-source, recurrence and fulfilled-history checks run in the command boundary.
- Legacy module summary children and embedded module planning tools still need their own query/command migration. Editor input initialization/preview helpers also remain incremental; this is not an app-wide render-only completion claim.
- Cloud repository safety remains the next prerequisite for auto-pay: useWorkbookCloudSync currently replaces whole workbooks with set(). No scheduler or pending execution has been enabled against that unsafe persistence strategy.
- Local browser review covered Planning overview, category/module budget switching, recurring plan navigation and opening/cancelling an occurrence editor; no financial records were saved during that review. This does not complete dashboard/mobile/write-flow acceptance. Validation results are recorded in SESSION_HANDOFF.md.

## 2026-11-04 — Correctness-first valuation and calendar migration

See [CALCULATION_ENGINE_AUDIT.md](CALCULATION_ENGINE_AUDIT.md) for corrected paths, fixture examples and explicit remaining work. Net-worth live queries now use a service-owned native/feed snapshot and the same deterministic engine assembly as historical queries. Dashboard headline/flow/calendar calculations are engine-owned. This extends the earlier facade and Planning migration; it does not complete all UI or scheduled auto-pay work.


## Manual fulfillment and explicit actual allocation — 2026-11-06

Monthly movement source bedffd3549e305a189a1d253b2e2c0bdcebb6ac8 passed Actions 440 (build and full suite). No merge/deployment.

New slice: Cash, Bank and native card Mark as done handlers dispatch fulfillManualPlan through an authenticated service. The deterministic engine validates occurrence/date/amount, builds the existing cleared manual record semantics, preserves month-end recurrence anchors and out-of-order completion snapshots, and attaches optional planLink {module, planId, occurrenceDate, groupId}. The service rechecks the reviewed source snapshot, requires an active bank/card source, rejects duplicate occurrence IDs/provenance, and rolls back both local workbooks if a write/marker fails. Bank/Cash/card reports carry the explicit group ID into actual plan breakdowns. Historical records remain unallocated; no amount/date/name matching or backfill. Category names are resolved against the live registry at the command boundary, preserving existing custom categories. Existing data shapes remain backward-compatible.

Validation: focused engine/service/Planning/Cash UI regression run passed 4 files / 25 tests (manual-plan-final-tests.log). Production build and both TypeScript projects passed (manual-plan-build.log); later changes were test-fixture authentication and cleanup only and require new-head CI as usual. Cash component test actually exercises the explicit Mark as done workflow on local fixtures. Browser was not used to fulfill real user payments. The initial rollback fixture leaked its spy through Zustand snapshots; fixture cleanup now restores the action explicitly. This was a test isolation issue, not a passing run until corrected.

Limits: local rollback/replay protection is not a remote atomic transaction. Whole-workbook sync still needs a transaction-safe repository before backend pending-only scheduling. No scheduler is enabled and no real money moves. Rental fulfillment/provenance migration, explicit EMI/subscription actual classification, unified category/project budgets/rollover, broader UI/service migration and full chart/theme/mobile/finder acceptance remain. Continue those tasks; PR 51 stays draft.



## Rental fulfillment provenance — 2026-11-06

Source 321b18ac5db96231f4a0dded8e0c83d68fba0790 passed Actions 441: 167 files / 1,271 tests, broker regressions, TypeScript and production build. No merge/deployment.

Rental Mark as done now calls an authenticated application service with the reviewed plan snapshot. A pure engine builder validates positive amount/date and creates explicit plan provenance. Linked rent/expense keeps the planLink on both the property record and its native Cash/Bank counterpart; report deduplication retains the rental event once, including its plan-group allocation. Custom category lookup uses the shared registry. The service rejects stale/deleted/fulfilled plans, inactive properties, incompatible/inactive paying finance and an occurrence whose actual record already exists. Failures restore the touched local rental/plan/link/finance workbooks; unlinked rental plans remain supported. The old lib helper is a compatibility re-export. Native ledgers and optional schema fields remain backward-compatible.

Validation: focused rental/manual/movement tests passed 3 files / 26 tests; production build and both TypeScript projects passed (rental-plan-service-build.log). Tests use fixtures only; no real rent was recorded in browser. This is manual fulfillment/local rollback, not remote atomic execution or auto-pay.

Next: align dashboard headline/monthly actual reporting with the canonical movement scope; complete native plan adapters/classification, unified budgets/allocations/rollover, remaining UI/services and safe RTDB repositories before backend pending-only payment lifecycle. Full UI/theme/mobile/finder/chart acceptance remains open. Do not stop at this checkpoint or mark the large draft PR complete.

