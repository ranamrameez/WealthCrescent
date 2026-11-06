## Collection-aware financial record identity — 2026-11-06

Budget source 128d1391639ee46c6a7b807275b4332726d3a03b passed Actions 444: 170 files / 1,297 tests, broker regressions, both TypeScript projects and production build.

New source tags movement rows by native collection and keys budget allocations by module/source/collection/record ID. A trade/dividend/transfer with the same imported ID remains distinct. Existing three-part allocation keys resolve read-only only when exactly one native collection owns the identity. Ambiguous legacy references stay unapplied with review issues and their possible records remain unallocated; no arbitrary collection is selected. Allocation edits write uniquely normalized keys while preserving all values/IDs and leaving native records unchanged.

Explicit linked-transfer matching now checks the owning account/broker and only actual linkable native record kinds. It cannot hide a same-ID trade/fee/dividend or an unrelated planned row. Missing legacy source refs resolve only from one explicit record-ID candidate. Also fixed the Funds source-inclusion edge where a fund happened to have the ID cash.

Validation: 5 focused files / 44 tests passed (budget-identity-tests.log), including linked-transfer/trade-ID collision and legacy alias tests. Final production build/both TS projects passed (budget-identity-final-build.log). This new head requires its own CI. Continue provenance/classification/schedule/trade adapters, budget import validation/parity, service migration and safe pending-only payment persistence/automation; no merge/deployment or real financial write.

## Currency-owned budget implementation — 2026-11-06

Dashboard alignment 58f3017c850cbfe41d144ced93286e3339fb984f passed Actions 443 (tests/build). New budget source is ready for publication after 6 focused files / 40 tests and both TypeScript projects/production build passed (unified-budget-final-tests.log, unified-budget-build.log). Browser read-only reviewed the Planning Currency budgets section and opened/cancelled its editor; no real budget or allocation was saved. Fixture UI tests did exercise create, monthly override and partial allocation through the service.

Implemented optional definitions/allocations in plannedCash, preserving native plans, FinancePlanGroup IDs, custom categories and all legacy currency-unassigned Bank targets. Engine-owned category/project AND scopes, per-currency monthly limits and overrides, cleared-only usage, explicit refunds, partial allocation/unallocated conservation, ambiguity handling and none/surplus/balance rollover (including history before the visible window). Positive income is not silently a refund; broad budgets do not automatically absorb unclassified movement. Budget queries use all native ledgers independently of Net Worth inclusion controls, and historical selected end dates without future actual leakage. Invalid allocations are surfaced, not applied.

Planning now has a noncollapsible inner Currency budgets section, shared create/edit/limit/allocation dialogs, searchable standard dropdowns, monthly table/chart/detail, pagination and explicit App default/Custom category labels. Category merge remaps budget category IDs; a plan used by a budget cannot be deleted without reassigning its budget link. Auth, stale edits, missing categories/plans/currency and excessive allocations are guarded. Metadata exports/imports with the existing plannedCash workbook; a dedicated budget import/batch UI is still pending.

Remaining budget work: collection-aware native record identity/legacy allocation alias hardening; malformed metadata/import validation; full budget UI/batch/export parity, pending/planned reservation with occurrence deduplication, broader category/project analytical views and browser theme/mobile acceptance. This is not a remote atomic repository or auto-pay release. Continue the remaining source provenance/schedule/trade-plan adapters, service migration, safe RTDB persistence and pending-only execution/history/settlement/void. Keep PR 51 draft and main untouched.

## Unified dashboard actual-movement scope — 2026-11-06

Headline/native currency pills, Analytics insights, monthly actual widgets/table/drilldowns, category groups and Money in/out now use the same cleared native movement population. Internal transfers are excluded, exact selected dates/current-day cutoff apply, currencies stay separate, and current net-worth valuation is unchanged. Monthly Plans also reads the canonical source set, including cards and personal-loan plans, while preserving separate actual/pending/planned populations. Standalone schedules and investment sketches remain documented adapter work. Net-worth forecasts retain the original tested forecast population; investment purchases are not subtracted from projected net worth as if value disappeared. Movement labels explicitly distinguish financing/investments from earned income and valuation growth.

Validation: 4 files / 41 focused tests passed; both TypeScript projects and production build passed (canonical-dashboard-build.log) after correcting a compatible optional-field input annotation. Browser verified matching native totals across Money in/out, Insights and both monthly widgets, with no real ledger write. Published rental checkpoint 5a8de627 passed Actions 442; this new slice requires its own resulting-head CI.

Consolidated remaining work is indexed in docs/CURRENT_DELIVERY_STATUS.md. Unified budget implementation rules are in docs/UNIFIED_BUDGET_MODEL.md (design, not a completion claim). Continue budgets, remaining source provenance/adapters, UI/service migration, safe RTDB repositories, pending-only scheduler/history/settlement/void and full UI/theme/mobile acceptance. Keep PR 51 draft.

## Rental fulfillment provenance — 2026-11-06

Source 321b18ac5db96231f4a0dded8e0c83d68fba0790 passed Actions 441: 167 files / 1,271 tests, broker regressions, TypeScript and production build. No merge/deployment.

Rental Mark as done now calls an authenticated application service with the reviewed plan snapshot. A pure engine builder validates positive amount/date and creates explicit plan provenance. Linked rent/expense keeps the planLink on both the property record and its native Cash/Bank counterpart; report deduplication retains the rental event once, including its plan-group allocation. Custom category lookup uses the shared registry. The service rejects stale/deleted/fulfilled plans, inactive properties, incompatible/inactive paying finance and an occurrence whose actual record already exists. Failures restore the touched local rental/plan/link/finance workbooks; unlinked rental plans remain supported. The old lib helper is a compatibility re-export. Native ledgers and optional schema fields remain backward-compatible.

Validation: focused rental/manual/movement tests passed 3 files / 26 tests; production build and both TypeScript projects passed (rental-plan-service-build.log). Tests use fixtures only; no real rent was recorded in browser. This is manual fulfillment/local rollback, not remote atomic execution or auto-pay.

Next: align dashboard headline/monthly actual reporting with the canonical movement scope; complete native plan adapters/classification, unified budgets/allocations/rollover, remaining UI/services and safe RTDB repositories before backend pending-only payment lifecycle. Full UI/theme/mobile/finder/chart acceptance remains open. Do not stop at this checkpoint or mark the large draft PR complete.

## Manual fulfillment and explicit actual allocation — 2026-11-06

Monthly movement source bedffd3549e305a189a1d253b2e2c0bdcebb6ac8 passed Actions 440 (build and full suite). No merge/deployment.

New slice: Cash, Bank and native card Mark as done handlers dispatch fulfillManualPlan through an authenticated service. The deterministic engine validates occurrence/date/amount, builds the existing cleared manual record semantics, preserves month-end recurrence anchors and out-of-order completion snapshots, and attaches optional planLink {module, planId, occurrenceDate, groupId}. The service rechecks the reviewed source snapshot, requires an active bank/card source, rejects duplicate occurrence IDs/provenance, and rolls back both local workbooks if a write/marker fails. Bank/Cash/card reports carry the explicit group ID into actual plan breakdowns. Historical records remain unallocated; no amount/date/name matching or backfill. Category names are resolved against the live registry at the command boundary, preserving existing custom categories. Existing data shapes remain backward-compatible.

Validation: focused engine/service/Planning/Cash UI regression run passed 4 files / 25 tests (manual-plan-final-tests.log). Production build and both TypeScript projects passed (manual-plan-build.log); later changes were test-fixture authentication and cleanup only and require new-head CI as usual. Cash component test actually exercises the explicit Mark as done workflow on local fixtures. Browser was not used to fulfill real user payments. The initial rollback fixture leaked its spy through Zustand snapshots; fixture cleanup now restores the action explicitly. This was a test isolation issue, not a passing run until corrected.

Limits: local rollback/replay protection is not a remote atomic transaction. Whole-workbook sync still needs a transaction-safe repository before backend pending-only scheduling. No scheduler is enabled and no real money moves. Rental fulfillment/provenance migration, explicit EMI/subscription actual classification, unified category/project budgets/rollover, broader UI/service migration and full chart/theme/mobile/finder acceptance remain. Continue those tasks; PR 51 stays draft.

## Shared monthly movement population — 2026-11-06

Source 6f8ed930c62885a89ef846838411a139d8a0fc09 passed Actions 439: 166 files / 1,261 tests, broker regressions, TypeScript checks and production build.

Next slice adds monthly movement widgets, a shared line chart and accessible monthly table inside Money in/out, using exactly the same engine selector as its category/module/account/plan report. Actual/pending/planned and movement-kind filters control both. Empty months remain present, currencies stay separate, exact first/last partial-month dates apply, and no missing net-worth snapshot is invented for movement-only cards. Shared MonthlyStatsWidget retains its existing snapshot-first behavior in historical Analytics, with movement-first presentation for this report. Existing narrower legacy flow views remain explicitly scoped pending their migration.

Focused tests: 3 files / 35 passed; production build/both TS projects passed (monthly-native-movement-build.log). Browser verified matching monthly/section totals, native-currency widgets, line canvases and same-data tables. No private proof data or real record mutation. New published-head full CI remains required.

Continue with plan-to-actual allocation linkage, unified currency-owned budgets and broader UI/services, then transaction-safe repositories and pending-only payment lifecycle. Auto-pay is not implemented/enabled; PR 51 stays draft and main untouched. Historical checkpoint entries below describe earlier states and do not override this status.

## Native movement adapters — 2026-11-06

Baseline c1cd12e9 passed Actions 438 on its exact head: 165 files / 1,251 tests, broker/PSX-fee regressions, both TypeScript projects and production build. No merge or deployment. This supersedes older pending-CI statements below.

Current continuation adds a deterministic CalculationEngine.movements read model and cached dashboard service/subscription for Cash, Bank, Rentals, native credit cards, recorded personal-loan/EMI repayments, Funds and every exchange broker. Cards distinguish charge/fee/markup from repayment transfer and cash-advance financing. Loan contracts/schedules are not fabricated cash receipts; EMI fines are explicit separate expenses with no guessed interest allocation. Funds trades are investment movement; exchange trades reuse broker-local fee calculators and split fees from gross consideration. NAV remains net of fund fees. Funding transfers are separate from spending. Dividends and native adjustments remain distinct. Active broker arrays override stale snapshots, archived profiles remain included unless excluded, and currencies never sum together.

Explicit Rental/loan-to-Cash/Bank links choose the domain record once; internal account/card/investment transfer legs are excluded from the combined view and available separately. Same names/dates/amounts never imply a link. Generated subscription plans appear under their paying source; renewals are not actual payments. Card and personal-loan plans are included without rewriting native records. Unknown Cash/Bank movement remains Unclassified rather than pretending it is earned income. Existing historical Analytics/Plans/headline flows still have their documented Cash/Bank/Rentals scope; broader movement totals must not be presented as identical to those narrower views until migration.

Validation: 4 focused files / 37 tests passed, including 10 new accounting/adapter tests. Browser verified kind filter, empty financing view, native-currency charts and matching tables. No real records were written/imported/deleted; no private screenshot or backup published. Production build and both TypeScript projects passed (native-movement-build.log). The initial build caught incomplete test fixtures; those fields and the recurrence fixture were corrected before this passing build. New resulting-head full CI remains required.

Next work: migrate monthly comparisons/widgets to the canonical movement population with shared controls; preserve explicit allocation links into actual native records; currency-owned unified budgets/remaining/rollover; remaining UI service migration and transaction-safe multi-workbook repositories before opt-in pending-only backend auto-pay/history/settlement/void. Full theme/mobile/chart/finder acceptance remains required. Keep existing PR 51 draft.

# Delivery checklist — 2026-11-05

This checklist preserves the full user-requested scope. Calculation correctness is the first priority; dashboard and app UI delivery remain required. Implemented does not mean browser-accepted or ready to merge.

| Workstream | Implemented checkpoint | Remaining acceptance/work |
| --- | --- | --- |
| CalculationEngine | Dashboard, valuation, recent activity, Planning queries and Banking read models | Remaining module services/commands, legacy Banking analytics, unified category/project budgets, final regression |
| Main dashboard | Shared summaries, Summary/Plans/Analytics sections, period controls, engine-backed figures and drilldowns | Review information hierarchy and density against PAGE_TEMPLATE_GUIDE; verify multi-currency, partial-month, empty and missing-data views; desktop/mobile review. Dashboard redesign is not signed off. |
| All charts | Shared Chart.js wrappers, soft styling, nearest-position hover and pointer guideline | Audit every chart for shared usage, tooltip anywhere near a point, truthful units/scales, accessible equivalent, mobile size and reduced motion; browser acceptance |
| App shell | Mobile menu at start of shared topbar, drawer behavior | Verify no overlap across routes/mobile; shared topbar and month/filter widgets must have consistent placement and semantics across pages |
| Entity dropdown | StandardDropdown sections, left icon/text/favorite, isTypeable; shared finder/adapters | Verify fund/bank/account/EMI and other entity navigation, keyboard/favorite behavior and coverage; remaining cash/exchange finder coverage |
| Themes | Nine theme surface and chart profiles | Visually verify meaningful theme variation, light/dark contrast and isolation across dashboard, navigation, tables, forms and charts |
| Categories | General defaults alongside preserved custom labels | Existing personal defaults become custom with IDs retained; no transaction reassignment or name-based merging. General labels do not define ledger accounting. |
| Payment lifecycle | Architecture documented | Transaction-safe persistence, deterministic occurrences, opt-in pending-only auto-pay, history, settlement and void |
| Delivery | Local implementation checkpoints and handoff | Final tests/build/browser review, publish existing draft PR 51, exact published-head CI |

Contracts: [page anatomy](../../docs/PAGE_TEMPLATE_GUIDE.md), [dashboard](net-worth-dashboard.md), [shared UI](SHARED_UI_COMPONENTS.md), [engine architecture](CALCULATION_ENGINE_ARCHITECTURE.md). Historical audit entries are dated evidence, not a current completion checklist.

## Detailed completed implementation inventory

These are implementation checkpoints, not a statement that the entire app is accepted.

### Financial engine and services
- Shared explicit-date current/historical valuation; historical dividends included; future transactions excluded at cutoff.
- Gross personal-loan receivables and liabilities shown separately; breakdown reconciles to net.
- Pending BUY prices excluded from fallback valuation; historical prices ordered by date/time.
- Invalid/non-finite FX rejected; unavailable conversion and missing historical opening evidence withhold misleading period changes.
- Month-end recurrence clamps short months while preserving original billing day; leap-year anniversaries recover; old daily schedules jump to query window.
- Explicit recurrence windows support selected Planning periods and 90/365-day forecasts; exact horizon cutoff, new currencies and future-start loans handled.
- Dashboard services own data subscriptions, quote overlays, caching, day rollover, inclusion changes and local FX interfaces.
- Dashboard current headline remains live; historical capital split uses selected end date. Insights/category/monthly detail populations share cleared totals.
- Recent activity uses service/engine models; withdrawal fees reconcile with native cash ledgers, archived brokers remain, active currency overrides stale profile data, migrated card duplicates excluded, EMI fines included.
- Planning queries and authenticated save/relink/delete commands migrated; reject invalid/stale/deleted/inactive inputs. Embedded forms still require the broader consumer audit.
- Banking account/directory/scope/chart read models migrated. Future rows remain visible but excluded from current actuals; card cutoff, per-card available credit, issuer scope/cache keys and closed balances covered.
- Banking chart closing balances retain full native balance population when flow filters hide rows; signed comparison bars preserve negative amounts.

### Categories
- General defaults coexist with user categories. Existing general/system IDs retained.
- Personal labels formerly bundled (Inevitable, Accomodation, Extra, Reserve, Misk, Touring, Saving, Pakistan, Ignore, IgnoreCount, PSX, Rent: Car Wash) are custom when present in existing registries; no longer seeded into fresh registries.
- Legacy name-only imports retain original personal category ID mappings through compatibility data separate from new-user defaults.
- No automatic semantic merges (Health/Medical, Food/Grocery, Savings/Saving); no existing transaction IDs rewritten.
- Normalization backfills missing general defaults, respects removed-default tombstones, preserves workbook metadata and is idempotent.
- Remaining review: imported registry completeness, cloud-first sign-in/reload, custom category editing, name collisions and category UI service migration.

## Detailed pending and planned implementation

### Engine migration by domain
Use CALCULATION_ENGINE_MIGRATION_INVENTORY.md for individual files; its import counts are a review aid, not completion proof.
- Banking: legacy AnalyticsTab budget/ledger derivation; authenticated bank/account/transaction editors and batch commands.
- Cards: balances, statement/cycle history, minimum/full due dates and payment allocation behind services; preserve locked statement accounting.
- Cash: currency scopes, filtered summaries/ledger/analytics and authenticated commands.
- Funds: derived holdings/NAV/cash queries, fund/broker scope and trade/transfer commands.
- EMI: schedule/paid/fine/remaining calculations, plans and repayment commands.
- Personal Loans: gross receivable/debt views, repayment history and commands.
- Rentals: property/lease/rent-cycle queries, plan editor and actual entry commands.
- Subscriptions: renewals, alerts, scoped projections and editor commands.
- QSE/PSX: portfolio, stock, dashboard, analytics, transaction, strategy, chart, alert and dividend consumers; preserve official accounting and broker isolation.
- Transfers: linked-side consistency, cash fees and cross-module commands.
- Shared components: category selectors, record/edit/batch controls, investment plans, trading advice/alerts, position summaries, topbar/sidebar data access.
- Infrastructure review: account/app-data import/export paths, backward-compatible readers, auth boundaries and cloud-first sync guards.

### Budget/project and payment implementation order
1. Define currency-owned category/project allocations without duplicating actuals across dimensions.
2. Preserve FinancePlanGroup identity and existing native plans; keep legacy currency-agnostic BankSettings.budgets unscoped until explicit user assignment.
3. Add actual-vs-budget, remaining, rollover and unallocated views through the engine; cover refunds, zero budgets, negative values and currency isolation.
4. Replace unsafe whole-workbook concurrent-write assumptions with transaction-safe repository orchestration before backend execution.
5. Add deterministic occurrence keys, execution history and atomic pending-ledger/link/history updates.
6. Add opt-in eligible-outflow execution; skip excluded, fulfilled, cancelled, archived or inactive/deleted-source occurrences.
7. Add explicit settlement, partial settlement and void with reconciliation; pending never silently becomes cleared.
8. Verify duplicate invocation, concurrent edits, interrupted retry, month boundaries and cancellation. Scheduler moves no real money.

### Dashboard acceptance checklist
- Review the main dashboard against PAGE_TEMPLATE_GUIDE; retain discoverable Summary, Plans, Analytics and activity sections with compact hierarchy and consistent spacing.
- Clearly distinguish current position, period movement, historical snapshot and forecast in labels and drilldowns.
- Shared month/period/entity controls must preserve URL state and exact partial-month bounds.
- Keep multi-currency views readable; missing FX and unknown openings must not look like zero or investment growth.
- Verify source inclusion, all-excluded/reset, no-data, liability-only, negative-balance and activity-only currency cases.
- Verify summaries reconcile with drilldown rows and actual/planned populations remain distinct.
- Review lazy charts/tables, mobile wrapping, keyboard access, empty/loading/error states and action discoverability.
- Final appearance remains subject to browser inspection; passing calculation tests does not sign off the dashboard design.

### App-wide UI acceptance checklist
- Audit each module home and detail against the Bank Account reference: shared scope, summaries, plans, history, analytics and ledger.
- Topbar: mobile menu first, no overlap, drawer focus/escape/backdrop/route behavior, consistent filter and month navigation placement.
- Dropdown: section title; icon/text/favorite rows; isTypeable modes; typing and keyboard navigation; disabled/no-result states; independent favorite action; viewport/fullscreen popup placement.
- Finder: funds/brokers/banks/accounts/cards/EMI/personal loans/properties/subscriptions; finish cash/exchange coverage and preserve filters on selection.
- Charts: shared renderer audit; soft curves/fills; full-plot nearest-position tooltips; vertical guideline; horizontal/radial exceptions; dataset callbacks preserved.
- Chart truthfulness: units/currencies/date labels, actual versus forecast, zero versus missing, negative values, empty datasets, accessible text/table equivalents and reduced motion.
- Themes: nine visually differentiated profiles, light/dark contrast, surfaces/corners/elevation/navigation/chart tokens, density/font preferences and isolation.
- Tables/forms: responsive readability, focus labels, modify mode, single/batch edits, confirmation/toast behavior, filtered/all exports and import parity.

## Verification ledger and release gates

| Checkpoint | Completed evidence | Limits |
| --- | --- | --- |
| Dashboard/recent activity/UI source through ede55d7b | 158 files / 1,210 tests; production build and both TS projects passed | Predates Banking and category changes |
| Banking source e2647a7b | 4 files / 47 tests; production build and both TS projects passed | New full-suite run did not complete |
| Banking full retries | Default-fork worker termination failure; thread retry worker-response timeout | Neither is a passing full suite |
| Final category compatibility revision | 3 files / 23 tests passed | Production build and both TypeScript projects passed; category-defaults-build.log |

Required before release: focused regressions for subsequent edits; complete full suite; both TypeScript projects and production build; desktop/mobile browser acceptance with demo fixtures; inspect diff; publish existing branch; CI on exact published head; update PR description. Keep PR 51 draft until acceptance is met.

## Continuation and delivery state

- Branch: fix/net-worth-dashboard-parity-and-accounting. Latest recorded committed checkpoint before this revision: 610e7eea (docs), e2647a7b (Banking source).
- Category source is committed as 348bd812; later Banking analytics and documentation updates must be checked with git status. Inspect git status rather than assuming delivery.
- Last verified remote head was ce3e4be8; publication remains unverified after transport/DNS failures. Recheck remote before pushing, preserve others' work, and do not create a duplicate PR.
- No main merge is claimed. No scheduler is enabled. Automated fixtures do not reconcile all private user records against statements.
- Next implementation slice: finish category compatibility verification, then Banking analytics/commands and remaining module migration. Maintain this checklist and SESSION_HANDOFF at every tested checkpoint.

### Banking analytics continuation

The legacy tab now uses the existing account query for ledger, cleared/pending populations, plans, opening and closing balances. Eighteen focused engine/navigation tests pass. Remaining: aggregate scope still selects a first account, and legacy budget ownership/commands require migration. Production build and both TypeScript projects passed; evidence: bank-analytics-boundary-build.log.

## App Data removal and Banking continuation — 2026-11-06

App Data now includes a visible Remove all app data action. It requires sign-in, the exact DELETE ALL DATA phrase and explicit confirmation. The service checks the confirmed UID, atomically replaces all 18 financial workbook paths with defaults under that user, awaits cloud acknowledgement, then resets local workbooks only if the same user is still active. It preserves the login account, appearance preferences and shared market data. Custom categories are removed; general defaults remain. No real user deletion has been executed during development.

Workbook maintenance invalidates queued local cloud pushes across the reset; normal writes resume afterward. Existing remote snapshot/rollback handling remains active. This is not a cross-device edit lock: users should finish edits on other devices before resetting. Tests use mocked cloud writes only. Current focused service/engine checks: 4 files / 24 tests passed; isolated App Data component and sync-queue checks passed 2 files / 3 tests. The combined navigation run stalled and was interrupted without a result; production build and both TypeScript projects passed (app-data-removal-build.log).

Banking continuation: aggregate analytics now renders all native accounts in scope, currencies separated, with missing selection staying empty. Legacy budget targets are explicitly unassigned instead of falsely converted to each account currency; actual spending follows the filtered cleared ledger, and no remaining comparison is fabricated. Legacy target writes use an authenticated service with finite-positive amount validation and collision/stale-name checks. Unified currency-owned budgets and wider command migration remain pending.

Publication correction: source through 44018f7b is pushed to existing draft PR 51; GitHub Actions run 432 passed on that exact head. Later App Data and Banking changes described here are local until committed/pushed and revalidated. Browser acceptance remains outstanding after connection/CDP and Windows URL-verification failures. No merge/deployment.

Publication checkpoint: Banking changes de314785 and App Data removal 46f039c5 are committed and pushed to draft PR 51. Local 27 focused tests and build/both TS checks passed. Actions 433 has passed build and broker regressions; full suite pending at documentation time. No production deployment or real deletion.

## 2026-11-06 visible verification and category boundary

App Data removal section was verified visually in the local in-app browser, including section navigation and disabled confirmation button. No real deletion. Full CI passed for 46f039c5 (#433) and 9bee76b2 (#434). Wider dashboard/charts/theme review remains pending. CategorySelect now reads/creates through categoryService with auth, blank-name and duplicate-name guards; 10 focused tests passed, build pending.

## Dashboard Funds reconciliation and UI parity — 2026-11-06

User reported incorrect PKR Funds and inconsistent dashboard UI. Read the supplied external backup locally without importing it, changing records or adding private data to source control. Confirmed cause: legacy Funds settings omitted includeCashInNetWorth, but the service treated omission as true. An incomplete funding-transfer history therefore generated negative cash that silently cancelled holdings. Missing legacy setting now means holdings-only; explicit true retains native cash including negative balances, and explicit false remains excluded. Fresh workbooks keep their documented explicit default. Dashboard inclusion checkbox uses the same effective policy and explains the funding requirement; no balancing deposits are invented.

Separately confirmed dashboard exchange valuation read only the active broker arrays. It now values profile ledgers independently with each profile's own fees/cost basis/currency, uses current active arrays over stale profile data, retains archived/deactivated history unless excluded, and then aggregates currency totals. Historical dates/scope use the same profile inputs. The exchange-wide inclusion command updates every profile to match its dashboard label.

Dashboard now uses the same StandardPageSections card headers/containers as the other modules, replacing its unframed Show/Hide controls. Existing report bounds, data and drilldowns remain intact. Browser verified native PKR Funds contribution against the supplied backup's holdings calculation and visually reviewed shared section controls. This does not reconcile external bank statements or endorse all dashboard figures. Remaining finding: Upcoming can display an EMI obligation alongside its linked bank plan; inspect explicit linkage before deduplicating. Other chart/theme/mobile acceptance and broader migration/payment work remain open.

Current verification is in dashboard-funds-focused.log; inspect completion before reporting a count. Production build must be rerun after correcting Testing Library role options in the test. Category service changes also remain in this working-tree continuation; its earlier 10 focused tests/build passed. No production deployment or merge.

2026-11-06 user UI contract: see ../../docs/ui-samples/README.md. The existing Comfortable/Compact/Console modes control density; only outer sections collapse; headline/support/extra hierarchy is required; alerts have dismiss controls. Month-based Plans uses exact calendar windows and per-currency local charts/tables. Coverage currently Cash/Bank/Rentals; other native-domain monthly coverage and linked-obligation deduplication remain pending.

## Latest UI correction — existing modes only (2026-11-06)

User explicitly rejected extra modes. Removed the proposed statLayout field/control/root attribute entirely. Preserve Comfortable, Compact and Console. Approved screenshots remain in docs/ui-samples as reference material. Repaired the existing spacing tokens: Comfortable 16px vertical card padding, Compact 12px, Console 8px; visible heading/content gaps scale with the same modes. Theme surfaces, radius and elevation remain token-driven. Added existing semantic SVG icons to dashboard section headings without replacing accessible text labels. Informational notices have dismiss buttons. Only outer sections collapse; inner currency summaries/charts/tables stay open. Headline/support/extra hierarchy remains.

Monthly Plans is implemented with per-currency charts, same-dataset accessible summary tables and dated plan rows, URL-backed calendar selection and exact-window recurrence. Source coverage remains Cash/Bank/Rentals; other native domains and linked EMI duplicate obligations remain pending. Tests passed 65 UI/theme/period checks plus 22 final month checks before this spacing/icon correction. Final combined focused checks passed 8 files / 79 tests (final-dashboard-repair-tests.log). Final production build is running in final-dashboard-repair-build.log. The earlier monthly build passed. Earlier entries describing Modern/Compact as a new preference are superseded by this correction.


MonthlyStatsWidget, local native module-balance chart and ValueChange arrows added; models/dashboard follow-up passed 18 tests. Full cash-flow design and remaining scope are in DASHBOARD_REPORTING_DESIGN.md. Latest source build pending in final-dashboard-release-build.log.

Validated dashboard checkpoint: 79 focused tests before widget additions, 18 follow-up tests, production build/both TS checks passed. Browser verified monthly widgets, chart rendering and corrected Funds. Broader canonical cash-flow/plan allocation and native-domain adapters remain pending per DASHBOARD_REPORTING_DESIGN.md.

Money in/out continuation: 36 focused tests, production build/both TS checks passed; browser verified the new section. Supported group dimensions and rows reconcile per currency. Coverage remains Cash/Bank/Rentals; full cards/investment/loan movement classification remains pending.

Actions 436 had one stale section-order assertion failure; the expected order is corrected. Linked EMI/bank Upcoming display deduplication now uses explicit loan/date/currency/full-amount identity without altering ledger state or stale installment metadata. Focused 24 tests passed; build and new-head full CI pending at this checkpoint.

Linked EMI/UI-order correction: 24 focused tests and production build/both TS checks passed; browser confirmed a single linked reminder. Current source must be pushed and full CI verified separately.

Actions 437 passed on 1427d3c5: 165 files / 1,250 tests and full build/TS. New Analytics consistency slice uses cleared actuals only for monthly widget/table/drilldowns; pending/plans remain separate in their own views. Focused 22 tests passed; resulting-source build/full CI pending at documentation time.

Actual-only monthly Analytics: 22 focused tests, production build/both TS checks passed; browser verified matching native-currency actual totals. Resulting-head full CI remains required.
