# Unified budget implementation contract

Status: implementation continuation, 2026-11-06. Builds on the approved category/project budget architecture; native actual ledgers remain authoritative. This document does not claim the feature is complete.

## Storage and identity
- Add optional budget definitions and allocations to the existing plannedCash workbook, beside FinancePlanGroup metadata. Missing arrays mean no unified budgets. Never overwrite or auto-convert legacy BankSettings.budgets.
- A budget has stable ID/name, native currency, monthly limit (including an explicit zero), start month, optional end month, optional category IDs and optional FinancePlanGroup ID. Category and project are dimensions of the same budget scope, combined with AND when both are set.
- Native movement identity includes module, source/broker/account ID and record ID. Equal labels/amounts/dates never identify a record or allocation.
- Category IDs remain authoritative; legacy planned category text resolves only to one unambiguous registry category. Unresolved categories stay visible.

## Allocation and conservation
- Native cleared actual outflow is positive budget usage. Financing/investment outflows may be deliberately budgeted; labels say allocated outflow/usage rather than claiming all movements are consumption.
- No explicit allocation: allocate an eligible outflow automatically only if exactly one active same-currency budget scope matches it. Zero matches stay unallocated; multiple matches stay visibly ambiguous and unallocated. Never pick an arbitrary overlapping budget.
- Explicit allocations override automatic matching for that record. Partial allocations leave the remaining amount unallocated. Total allocation magnitude must not exceed the native record, and allocations cannot cross currencies or refer to missing/out-of-period budgets.
- Positive native inflow is never silently a refund. A refund requires an explicit negative budget allocation against that positive record; it reduces usage. Ordinary income is not netted against spending.
- One actual record's value can be split across budgets, but global allocated plus unallocated outflow must equal the eligible native outflow once. Category/project breakdowns are dimensions, not totals to add together.
- Missing/orphan/invalid allocations are reported as issues; they never manufacture a record, balance or exchange rate.

## Calendar and rollover
- Limits belong to calendar months and native currencies. Use dated actual records only through the supplied as-of date.
- Each month shows limit, carry-in, available, cleared usage, refunds, remaining and supporting records. Zero is distinct from missing.
- Rollover is explicit per budget: none (reset), surplus (carry only positive remaining), or balance (carry positive or negative remaining). Calculate preceding months from the budget's start, even when the visible report starts later.
- Pending and remaining plans are separate populations. They do not become cleared usage or silently reduce actual balances. Reserve/forecast comparisons must use explicit occurrence linkage before combining populations.

## Services and UX
- Deterministic engine validates amounts, dates, scope and conservation. Application services authorize writes, re-read current records, reject stale edits and persist metadata. UI only collects intent and renders view models.
- Shared monthly controls, per-currency cards/charts/tables and allocation drilldowns; show ambiguous/unallocated records explicitly. Legacy currency-unassigned targets remain separately labelled until the user assigns them.
- Use existing shared components and the three existing densities. No new appearance mode or dependencies.

## Required checks
- Category/project combined scope, duplicate names/IDs, multiple overlapping budgets, multi-source identical record IDs.
- Actual versus pending/planned/future cutoff; native currency separation; missing/archived source history.
- Partial allocations, over-allocation rejection, orphan allocations, explicit refunds and ordinary positive income.
- Zero limits, negative remaining, none/surplus/balance rollover, leap/year boundaries and preceding-month carry.
- Global outflow conservation and detail/chart/table reconciliation. Auth, stale editing, lossless optional-field round trip and legacy budget preservation.


Implementation checkpoint: core/service/Planning UI and optional workbook fields now exist; 40 focused tests/build passed. Monthly limits can be overridden without changing defaults. Historical selected end dates cap actuals. Unknown movement requires a specific category/plan scope or explicit assignment; all-ledger budget balances are independent of Net Worth inclusion flags. Dedicated import/batch/export, record collection identity hardening and pending/planned reservations remain pending.

Record identity now includes native collection. The first optional three-part allocation schema is read compatibly only when its explicit record ID resolves to one collection; ambiguous references remain unapplied/unallocated for review. Native record values are not changed.
