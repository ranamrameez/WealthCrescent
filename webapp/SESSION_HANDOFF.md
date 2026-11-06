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

## Green source CI and actual-only monthly Analytics — 2026-11-06

Published source 1427d3c5 passed Actions 437: 165 files / 1,250 tests, broker-profile/PSX-fee regressions, both TypeScript projects and production build. This supersedes the stale-order assertion failure in 436. No merge/deployment. The verified source remains the existing draft PR 51.

One further read-model consistency correction is now in the working tree: Analytics monthly inputs, monthly widget and monthly table/drilldowns use engine-filtered cleared actual records only, through today and within exact selected dates. They no longer combine old plans into historical inflow/outflow. Plans and Money in/out retain explicitly separate actual/pending/planned populations. Monthly widget labels are Actual inflow/outflow and Net actual movement; snapshot labels do not call today's current-month value a completed month-end. This does not alter native ledgers or the shared legacy projected budget calculator used elsewhere.

Focused analytics/model checks passed 2 files / 22 tests (actual-monthly-analytics-tests.log). Production build and both TypeScript projects passed (actual-monthly-analytics-build.log). Browser verified monthly actual inflow/outflow/net now match the actual movement report in each currency. Commit/push this slice and verify resulting-head full CI before any merge. Larger native-domain reporting, budget/allocations, service migration, safe payment lifecycle and full UI/theme/mobile matrix remain pending per the reporting design/checklist.

## CI section-order correction and linked EMI reminder — 2026-11-06

Published Money in/out head: 0941cbc1. Actions 436 build and broker regressions passed, but full suite had one failed UI assertion (1,248 tests passed / 1 failed): moving Money in/out immediately after Summary changed the expected section order. The assertion now checks Summary -> Money in/out -> Per currency summary; this is a test expectation correction, not a financial calculation failure. Do not call Actions 436 green.

New source slice: Upcoming suppresses a separate EMI reminder when an active bank plan explicitly references the same loan, exact due date, native currency and full amount. It retains partial, differently dated/currency, unlinked and stale-source cases. The external backup exposed stale sourceEmiMonth metadata; that index is not rewritten and does not override explicit loan/date occurrence identity for display deduplication. No record is settled or mutated. Domain/service/UI checks passed 3 files / 24 tests (dashboard-order-upcoming-tests.log). Production build and both TypeScript projects passed (upcoming-order-build.log). Browser verified one linked bank reminder and no duplicate EMI reminder, without changing any records. Current full CI must pass on the resulting published head.

The larger all-app reporting, budget, repository/payment and browser matrix tasks remain per DASHBOARD_REPORTING_DESIGN.md and DELIVERY_CHECKLIST.md. The current movement report covers Cash/Bank/Rentals only; actual plan allocation remains explicit/unallocated. Keep draft PR 51; no main merge/deployment.

## Money-in/out breakdown continuation — 2026-11-06

Dashboard/Funds/calendar/UI source checkpoint is committed and published as fe418990 (preceded by category service a31d6eb); Actions 435 completed successfully on fe418990. Private backup was not published. Existing three density modes only; sample images saved. No main merge or production deployment.

New working-tree implementation: Money in/out top-level section with actual/pending/planned selector and category/module/account-source/plan-group dimensions. Engine owns totals and grouping, preserving currency separation, current-date actual cutoff and record populations. Explicit native source IDs prevent same-name accounts being merged. Planned groupId metadata is passed through from native planned sources; unlinked actual records remain Unallocated, with no inferred plan matching. Chart/table share group totals, and group details expose contributing records. Coverage is Cash/Bank/Rentals; linked-transfer exclusions use the existing collector. This reports account movement, not a complete earned-income/consumption classification. Other native modules and broader accounting classification remain pending.

Focused checks passed 3 files / 36 tests (movement-report-final-tests.log). Production build and both TypeScript projects passed (movement-report-build.log). Browser verified Money in/out rendering, per-currency totals, category chart and accessible table; it is placed directly after Summary. After the build, only section ordering and a chart-heading gap were adjusted; exact pushed-head CI must validate the final source. Initial run failed only the old section-count assertion after adding a new section; test updated to check the new section. The prior fe418990 remains CI green; do not apply that result to uncommitted movement code.

## Validated dashboard checkpoint to publish — 2026-11-06

Final source validation: 8 files / 79 tests passed before monthly widget additions; 2 files / 18 widget/model/dashboard follow-up tests passed. Production build and both TypeScript projects passed (final-dashboard-release-build.log); afterward only the widget's 'Month-end net worth' label was corrected to 'Net worth snapshot' so the current month is not falsely labelled a completed month. Full CI on the published head must validate that final text too. Browser verified Analytics charts, monthly widget, earlier calendar Plans chart/table, corrected PKR Funds, native module contribution chart and section-only collapse. No private backup imported or private proof data added to repository. Samples in docs/ui-samples are the user-supplied stock UI references only.

Existing Comfortable/Compact/Console modes retained; no extra mode. Spacing/heading gaps repaired, semantic icons and change arrows added, Notice dismiss controls present. Important remaining reporting work: full native-domain movement coverage and category/module/account/plan income/outflow drilldowns; explicit-link EMI deduplication; unified budgets and payment persistence/lifecycle; full theme/mobile/hover acceptance. See docs/DASHBOARD_REPORTING_DESIGN.md for the concrete desired report layout and accounting safeguards. Do not mark all remaining work complete or merge the large PR prematurely.

## Monthly widget / cash-flow research continuation — 2026-11-06

User requests added: widget for each month's stats; charts beside related section metrics; income/outflow breakdowns by category, module/account and plan; Bank Account-style arrows and charts. Research/spec saved to docs/DASHBOARD_REPORTING_DESIGN.md with official Copilot, Actual and YNAB sources. Preserve that design as remaining app-wide reporting scope, not a claim it is already implemented.

Added MonthlyStatsWidget to Analytics using engine-provided monthly values, explicit missing historical balances and labels for activity including plans. Added current balance-by-module chart to each native currency summary; this is balance composition, not cash flow. ValueChange presents supplied deltas using up/down arrows and percentage only if supplied. The existing three modes remain Comfortable/Compact/Console. No statLayout preference remains. Reference images are retained under docs/ui-samples.

Final combined focused checkpoint before widget additions: 8 files / 79 tests passed. Widget/model/dashboard follow-up: 2 files / 18 tests passed (final-monthly-widget-tests.log). Production build running in final-dashboard-release-build.log; check result. Earlier monthly/spacing builds passed. All these source edits since 9bee76b2 are uncommitted until the next focused commits; do not lose them or private-proof artifacts. Private backup was never copied into tracked files. Browser has verified Funds correction, section-only collapse, hierarchy, monthly Plans chart/table and dates. New widget/change indicator review remains pending.

Next: save/publish tested checkpoint, inspect full CI on resulting head, then complete canonical movement read models/adapters, complete monthly native-domain coverage and category/module/account/plan drilldowns, linked EMI deduplication, budget allocations and safe pending-only payment lifecycle. Original dashboard/app UI acceptance remains required. Do not merge just because one checkpoint is green.

## Latest UI correction — existing modes only (2026-11-06)

User explicitly rejected extra modes. Removed the proposed statLayout field/control/root attribute entirely. Preserve Comfortable, Compact and Console. Approved screenshots remain in docs/ui-samples as reference material. Repaired the existing spacing tokens: Comfortable 16px vertical card padding, Compact 12px, Console 8px; visible heading/content gaps scale with the same modes. Theme surfaces, radius and elevation remain token-driven. Added existing semantic SVG icons to dashboard section headings without replacing accessible text labels. Informational notices have dismiss buttons. Only outer sections collapse; inner currency summaries/charts/tables stay open. Headline/support/extra hierarchy remains.

Monthly Plans is implemented with per-currency charts, same-dataset accessible summary tables and dated plan rows, URL-backed calendar selection and exact-window recurrence. Source coverage remains Cash/Bank/Rentals; other native domains and linked EMI duplicate obligations remain pending. Tests passed 65 UI/theme/period checks plus 22 final month checks before this spacing/icon correction. Final combined focused checks passed 8 files / 79 tests (final-dashboard-repair-tests.log). Final production build is running in final-dashboard-repair-build.log. The earlier monthly build passed. Earlier entries describing Modern/Compact as a new preference are superseded by this correction.

## Month-based Plans and approved UI samples — 2026-11-06

User steering: Plans must be month-based with dated historical analysis/local charts; only top-level sections collapse; headline values bigger/highlighted than supporting and extra stats. User supplied Modern/Compact references now saved at docs/ui-samples/modern-reference.png and compact-reference.png with README guidance. These are presentation references, not financial source data. The earlier private backup was read locally only and is not committed.

Implemented working-tree continuation: Plans replaces rolling day-horizon controls with URL-backed plan-month and plan-months (1/3/6/12). Service expands recurring source plans over the requested exact window, including past/future months. Engine supplies per-currency monthly cleared actual, pending and unexecuted planned totals, with separate same-dataset chart/table and dated paginated plan rows. Coverage is currently Cash/Bank/Rentals native activities; broader native EMI/subscription/card sources require explicit integration and duplicate-link handling. Monthly plans are not represented as net-worth forecasts. Existing full Planning editor remains linked.

Modern/Compact stat-layout preference is independent of theme and density, available in Appearance. Shared Notice now offers accessible dismissal, with dismissible=false available for required content. New notices reset dismissal. New UI/period tests are in dashboard-monthly-ui-focused.log; inspect footer. Final build and full CI on final published head are still required. Earlier Funds correction and profile valuation passed 78 focused tests; user then requested more UI/monthly work, so validate the new source before publishing.

Remaining findings include explicitly linked EMI duplicates in Upcoming, wider service migration, full native-domain monthly coverage, unified currency-owned budgets and safe auto-pay lifecycle. Browser previously verified corrected native PKR Funds holdings and the headline/support hierarchy; current monthly selector and appearance changes still need visual review. Do not claim the whole app or release complete.

## Dashboard Funds reconciliation and UI parity — 2026-11-06

User reported incorrect PKR Funds and inconsistent dashboard UI. Read the supplied external backup locally without importing it, changing records or adding private data to source control. Confirmed cause: legacy Funds settings omitted includeCashInNetWorth, but the service treated omission as true. An incomplete funding-transfer history therefore generated negative cash that silently cancelled holdings. Missing legacy setting now means holdings-only; explicit true retains native cash including negative balances, and explicit false remains excluded. Fresh workbooks keep their documented explicit default. Dashboard inclusion checkbox uses the same effective policy and explains the funding requirement; no balancing deposits are invented.

Separately confirmed dashboard exchange valuation read only the active broker arrays. It now values profile ledgers independently with each profile's own fees/cost basis/currency, uses current active arrays over stale profile data, retains archived/deactivated history unless excluded, and then aggregates currency totals. Historical dates/scope use the same profile inputs. The exchange-wide inclusion command updates every profile to match its dashboard label.

Dashboard now uses the same StandardPageSections card headers/containers as the other modules, replacing its unframed Show/Hide controls. Existing report bounds, data and drilldowns remain intact. Browser verified native PKR Funds contribution against the supplied backup's holdings calculation and visually reviewed shared section controls. This does not reconcile external bank statements or endorse all dashboard figures. Remaining finding: Upcoming can display an EMI obligation alongside its linked bank plan; inspect explicit linkage before deduplicating. Other chart/theme/mobile acceptance and broader migration/payment work remain open.

Current verification is in dashboard-funds-focused.log; inspect completion before reporting a count. Production build must be rerun after correcting Testing Library role options in the test. Category service changes also remain in this working-tree continuation; its earlier 10 focused tests/build passed. No production deployment or merge.

## Verified visible removal control / category service — 2026-11-06

Browser verification now succeeded for App Data: current server on port 5173 serves this workspace; review tab displays the Remove all app data topbar section and its full warning, phrase field and disabled-until-confirmed button. Selecting the section brings the form into view. The review tab was left open as a deliverable. No phrase was entered, no confirmation accepted and no real data deleted. This is narrow App Data acceptance, not completion of dashboard/chart/theme/browser review.

Actions 433 passed on 46f039c5 and Actions 434 passed on 9bee76b2. Source and docs through 9bee76b2 are published. New work: CategorySelect reads via categoryService and dispatches authenticated category creation; blank/duplicate normalized names rejected without modifying history. Focused tests passed 2 files / 10 tests. Production build running in category-service-build.log. This next source slice is uncommitted until saved below.

## Published App Data checkpoint — 2026-11-06

Source committed and pushed: de314785 (Banking scope/budget correctness), 46f039c5 (App Data removal). PR 51 remains draft. Local validation: 27 focused tests across 6 files passed; both TypeScript projects and production build passed. GitHub Actions 433 on source head 46f039c5 has passed build and broker/PSX regression steps; full suite is running at this checkpoint. Verify its final result before claiming a full pass. Any subsequent documentation commit changes PR HEAD; report source-head and current-head evidence accurately.

App Data removal is available in the working branch/local preview. It has not been deployed to production and has not been used on real user data. Browser acceptance and the larger remaining engine/UI/payment scope remain open. Earlier references to these changes being uncommitted/local-only are historical; both source commits are now published.

## App Data removal and Banking continuation — 2026-11-06

App Data now includes a visible Remove all app data action. It requires sign-in, the exact DELETE ALL DATA phrase and explicit confirmation. The service checks the confirmed UID, atomically replaces all 18 financial workbook paths with defaults under that user, awaits cloud acknowledgement, then resets local workbooks only if the same user is still active. It preserves the login account, appearance preferences and shared market data. Custom categories are removed; general defaults remain. No real user deletion has been executed during development.

Workbook maintenance invalidates queued local cloud pushes across the reset; normal writes resume afterward. Existing remote snapshot/rollback handling remains active. This is not a cross-device edit lock: users should finish edits on other devices before resetting. Tests use mocked cloud writes only. Current focused service/engine checks: 4 files / 24 tests passed; isolated App Data component and sync-queue checks passed 2 files / 3 tests. The combined navigation run stalled and was interrupted without a result; production build and both TypeScript projects passed (app-data-removal-build.log).

Banking continuation: aggregate analytics now renders all native accounts in scope, currencies separated, with missing selection staying empty. Legacy budget targets are explicitly unassigned instead of falsely converted to each account currency; actual spending follows the filtered cleared ledger, and no remaining comparison is fabricated. Legacy target writes use an authenticated service with finite-positive amount validation and collision/stale-name checks. Unified currency-owned budgets and wider command migration remain pending.

Publication correction: source through 44018f7b is pushed to existing draft PR 51; GitHub Actions run 432 passed on that exact head. Later App Data and Banking changes described here are local until committed/pushed and revalidated. Browser acceptance remains outstanding after connection/CDP and Windows URL-verification failures. No merge/deployment.

## Banking analytics continuation — 2026-11-05

Legacy AnalyticsTab now delegates ledger/date/pending/plan reads to useBankAccount -> bankService -> CalculationEngine.bank, including full native balance history and closing balance for chart reconciliation. Its former inline ledger/filter/recurrence path is removed. Focused engine/navigation checks passed 2 files / 18 tests. Production build and both TypeScript projects passed (bank-analytics-boundary-build.log), after removing the unused filter import.

Remaining in this tab: first-account fallback for aggregate scope, unscoped legacy budget comparison/editor, direct source metadata/budget subscriptions and commands. These are not fixed by this narrow read-path migration. Do not infer a currency for legacy targets. Category compatibility checks passed 23 tests and its production build/both TS projects passed. Category compatibility source is committed as 348bd812. Banking analytics and documentation updates remain working-tree changes until committed.

## Current evidence correction — 2026-11-05

The Banking thread-pool retry has ended with a worker-response timeout; it is not still running and is not a passing full suite. See bank-query-full-suite-threads.log. Earlier running-status entries below are historical. Category general-default/custom migration and legacy name mapping follow-up are currently uncommitted. Final category compatibility checks passed 3 files / 23 tests. Production build and both TypeScript projects passed (category-defaults-build.log). The detailed [delivery checklist](docs/DELIVERY_CHECKLIST.md) is the current complete scope index, including small UI acceptance tasks and dependencies.

## Scope clarification — 2026-11-05

See [current delivery checklist](docs/DELIVERY_CHECKLIST.md) for dashboard redesign, all-app charts, shared topbar/filters, dropdown navigation, themes, categories and engine/payment work. Dashboard and UI acceptance are still outstanding. Category defaults are being corrected to general-purpose labels; existing personal labels retain their IDs as custom categories.

## Latest Banking checkpoint — source committed; full regression retry running

Banking source is committed locally as e2647a7b: calc/bankReadModel.ts, services/finance/bankService.ts, hooks/useBankQueries.ts, model/service tests, CalculationEngine.ts, BankPage.tsx and its navigation test. Account detail, bank/account directory, scope summaries and account-chart calculations now use engine/service models. Corrections: historical card-debt cutoff; per-card available credit; closed balances retained; future records stay visible/labeled but do not become current actuals; native chart closing balance survives flow filters; signed comparison bars; issuer-specific card scope and cache keys, including card-only banks; non-mutating bank sorting and archive-safe directory totals.

Latest focused validation **passed 4 files / 47 tests** (bank-query-verified-focused.log). Latest production build and both TypeScript projects **passed** (bank-query-verified-build.log). The repeated three-cycle lazy-editor test now has a localized 15-second total budget, while each DOM finder remains bounded at five seconds; cold Windows load previously exceeded the old five-second total budget. No global test timeout was raised.

**Full-suite retry is running on final Banking code**: webapp/bank-query-full-suite-threads.log, execution session 14563 at launch, --pool=threads --maxWorkers=1. The prior default-fork run (bank-query-full-suite.log / session 29212) failed to terminate the PriceInputLive test worker and was interrupted without a completion footer; do not call it passing. No assertion failure was recorded before the runner shutdown problem. Inspect the new retry footer before claiming a completed full result. No concurrent compiler. Vitest runs safely in the sandbox when TEMP and TMP point at webapp/node_modules/.cache/wealthcrescent-vitest-tmp (create first); the default AppContainer temp directory triggers EPERM renames. Record final output and update documentation; the Banking source commit is already saved. No source edits since starting this full run; docs/inventory updates only.

Remaining Banking work: legacy AnalyticsTab budget reads/private ledger filters and editor/transaction/other form commands still need migration. BankSettings.budgets is explicitly currency-agnostic legacy data; do not silently infer currency during the approved unified category/project budget migration. Preserve unscoped targets until explicitly assigned. Current UTC date semantics match datetime.todayISODate() without a specified zone; market-fee calendars remain market-specific. The new migration inventory is docs/CALCULATION_ENGINE_MIGRATION_INVENTORY.md; it is a static review map, not a proof of correctness or completion.

The completed 158-file / 1,210-test checkpoint below precedes this Banking source. GitHub connector fallback failed with an HTTP transport error; no API publication occurred. Git pushes remain failed/unverified. Earlier source is committed through ede55d7b plus docs 9f07b719; Banking adds e2647a7b. A fresh GitHub connector read now succeeds and verifies existing draft PR #51 still at remote ce3e4be8. Git fetch succeeds too. Retry publication without forcing or creating a duplicate PR. No main push/merge.

---

## 2026-11-05 — Latest validated source checkpoint (read this first)

Financial correctness / completing CalculationEngine remains the priority. All source from this continuation is now saved in focused local commits on fix/net-worth-dashboard-parity-and-accounting. Latest application head: ede55d7b (theme profiles); financial query/read-model head: 9dc4f20e. Earlier entries below are historical checkpoints and may mention work that is now committed or defects that are now fixed.

### Completed and verified

- Final full suite: **158 files / 1,210 tests passed**, 296.77 seconds, webapp/recent-engine-full-suite.log.
- Final production build and both TypeScript projects: **passed**, webapp/recent-engine-build.log.
- Recent Activity migration: 5 files / 23 focused tests passed, webapp/recent-activity-validation.log. The later full suite includes the final active-broker currency assertion too.
- NetWorthRecentTransactions is now render-only through useRecentTransactions -> recentActivityService -> CalculationEngine.recentActivity. Funds/QSE/PSX withdrawal fees reconcile with native cash ledgers through shared transferCashAmount; migrated legacy card records are not repeated; archived/deactivated broker history is retained; active native data/currency overrides stale profile snapshots; EMI paid outflow includes its additional fine. Trade values are explicitly labeled before trading fees and are not presented as combined cash flow.
- NetWorthPage now uses engine/service report, headline, per-currency, Insights, category, monthly, forecast, inclusion and local FX interfaces. No runtime private calculator or financial-store imports remain in that page; appearance state is presentation-only.
- Shared charts, dropdown/finder/mobile topbar/reporting controls and theme changes are committed too, preserving the user's earlier requests. See SHARED_UI_COMPONENTS.md for their contract. Required final browser acceptance remains outstanding.

### Local commits in order after user skills head ce3e4be8

1. da797287 — recurrence calendar anchoring / old daily schedules.
2. 35b8a80c — executed-only fallback prices and shared chronology.
3. bf9524b2 — explicit recurring activity windows / exact forecast cutoffs.
4. 24dfdeb7 — durable audit and continuation checkpoint.
5. c75d4449 — shared chart renderers and pointer interaction.
6. 72a14c24 — shared entity dropdown/finder, mobile topbar and reporting controls.
7. 53042101 — Planning engine queries / authenticated commands.
8. 9dc4f20e — central valuation, dashboard and recent-activity models/services/tests.
9. ede55d7b — distinct theme surfaces and chart treatment.

### Delivery state / next work

- Existing draft PR #51 remains the target. No duplicate PR, merge or main push.
- Git fetch succeeds. Three Git push attempts (including per-command HTTP/1.1) failed with RPC/curl 52 Empty reply from server. A verified fetch still showed remote ce3e4be8, so **do not claim these local commits are pushed**. No approval review rejected the actions; this is a transport failure.
- The GitHub connector provides create_tree/create_commit/update_ref and can be used as a safe publication fallback if Git transport remains unavailable. Preserve the remote parent/history, use an expected-head lease and a fast-forward update only. Connector-created commit IDs may differ; compare final trees before reconciling local refs, and retain a backup of local commits. Never force over someone else's work.
- This documentation update is the only remaining working-tree work at this checkpoint; commit it after verifying git status. Do not stage unrelated user changes.
- Next implementation slice: continue app-wide financial query/command migration (Bank/Cash/Cards/Funds/EMI/Personal Loans/Rentals/Subscriptions/exchange consumers). Their tested pure calculators already exist behind CalculationEngine; remaining UI-local financial derivation and direct persistence must move to services. Do not label the full architecture complete just because the dashboard and current suite pass.
- Unified category/project allocation and payment lifecycle remain pending. Transaction-safe multi-workbook persistence is still a prerequisite for scheduled app-only auto-pay; no scheduler is implemented/enabled.
- Start a fresh Vite server for final browser checks; the prior process ended with the environment restart. Preserve the user's tab and inspect a separate review tab. Complete chart hover/cursor, mobile topbar, theme light/dark and finder navigation checks. Remote CI must validate the exact final published head before any merge.

---

## 2026-11-05 — Authoritative continuation checkpoint

**Priority:** complete financial correctness / CalculationEngine before resuming appearance work. The user's shared charts, standard dropdown, mobile topbar, dashboard and theme requests remain authorized and are preserved in the working tree. The user explicitly asks that this handoff remain current for another chat.

### Repository and delivery state

- Workspace: D:/Coding/WealthCrescent. Working branch: fix/net-worth-dashboard-parity-and-accounting.
- Last focused calculation commit: bf9524b27cfeb9ef91b4fa13af0ae15758bc9186. Documentation checkpoint commit: 24dfdeb7.
- Three focused calculation commits are now local: da797287 (month-end/leap-year recurrence and old daily schedules); 35b8a80c (executed-only, chronologically ordered fallback prices); bf9524b2 (explicit recurring activity windows and exact forecast cutoffs/new currencies/future loans).
- Existing draft PR #51 remains the target. A fresh fetch verified remote head ce3e4be8 (user-added skills), and local HEAD was four commits ahead / zero behind before the push attempt. Push the existing branch only; inspect its actual completion before claiming success. No merge and no main push.
- There are 96 modified/untracked tracked-workspace paths at this checkpoint, covering prior UI work plus financial query migration/tests/docs. Do not reset them. Some new files are untracked and must be included in appropriate commits. Preserve user-provided AGENTS.md / .agents skills; do not sweep them into implementation commits.

### Financial work now in the working tree

- lib/calc/netWorthValuation.ts is the shared current/historical native-ledger valuation assembly. netWorthAsOf.ts delegates to it. It takes an explicit date; handles native inclusion and currencies; includes historical dividends; preserves stock accounting/cost-basis settings; splits personal-loan receivables/debts; and reports unverified undated openings.
- services/finance/netWorthService.ts owns native store/feed access, live quote overlays, scoped input snapshots, caching and midnight invalidation. features/netWorth/hooks/useNetWorthSummary.ts is now a thin subscription adapter and also exposes useNetWorthInputs.
- lib/calc/dashboardReadModel.ts now owns headline and per-currency summaries, historical report assembly, exact reporting ranges, cleared Insights, category totals/details, monthly drilldowns and planning reality. Capital split uses the selected period-end valuation; the current headline remains live. Drilldowns and totals exclude the same pending rows. Missing opening evidence / missing FX withhold period deltas.
- services/finance/dashboardService.ts and hooks/useDashboard.ts own dashboard sources, recurring activity queries, inclusion option view models and authenticated narrow inclusion commands. Native credit cards now have inclusion controls. Commands read the latest workbook to retain unrelated edits and reject deleted sources. The original local FX cache/manual-rate behavior is behind this service too.
- NetWorthPage.tsx no longer imports financial stores or runtime private calculators. Appearance state remains presentation-only. Its recent-transactions child still needs inspection/migration before describing the whole dashboard subtree as render-only.
- CalculationEngine.ts adds valuation, dashboard, currency, personalLoans, transfers, rentalActuals and categoryGroups; it also exposes the earlier new Planning model. Do not commit the facade without its referenced new modules.
- lib/calc/currencyConversion.ts holds pure conversion math; lib/fx.ts re-exports compatibility functions and rejects invalid cross-rates. Historical prices sort by date before time. Existing persisted actual transactions/fulfilled snapshots have not been rewritten.
- budgetPlanner now accepts an optional explicit occurrence window. Dashboard queries expand recurring plans through 365 days (rather than silently truncating 90/365-day forecasts at 30 days). Planning queries expand the requested report window. Future projections use exact end dates, retain new currencies and do not amortize a future-start loan as if it already existed today.

### Exact validation evidence

- Earlier UI-only checkpoint: 153 files / 1,168 tests passed (final-ui-validation.log).
- Financial domain checkpoint: 46 files / 635 tests passed (engine-domain-tests.log); before later dashboard extraction.
- Calendar regression checkpoint: 8 files / 126 tests passed (engine-calendar-tests.log).
- A full-suite run concurrent with a build reported timeouts in Bank navigation, QSE transactions, BatchEditGrid and FinancePlanGroups, then its process disappeared without a completion footer. **Do not report that run as passing.** All four files passed in isolation afterward: 37 tests (engine-failed-review.log).
- Most recent focused engine/dashboard/service checkpoint: **8 files / 61 tests passed** (engine-complete-dashboard-tests.log). Covers native inclusion authorization, stale/deleted-source preservation, historical capital split, pending-safe monthly/category/Insight details, exact forecast horizons and recurring source expansion.
- **Most recent production build passed**, including both TypeScript projects (engine-dashboard-final-build.log). This includes the final dashboard service/FX extraction.
- **Final full suite PASSED: 156 test files / 1,205 tests**, output webapp/engine-verified-full-suite.log, duration 503.53 seconds. Command from webapp/: node node_modules/vitest/vitest.mjs run --maxWorkers=1. This validates the current working-tree source through the dashboard service/FX extraction. Later source changes require new relevant verification and the required final checks.
- No new exact-head remote CI result or final browser acceptance is claimed. Tests use fixtures, not reconciliation of every private user ledger against statements.

### Prior UI work to preserve and finish after the financial priority

- Shared AppCharts wrappers and appChartStyle/chartInteraction/chartThemeVisuals, nearest-x non-intersecting hover, cursor guideline, reduced motion, StockCharts adapters; feature renderer imports migrated. Theme profiles now vary surfaces, corners, elevation and chart treatment across all nine themes; final visual QA remains outstanding.
- StandardDropdown supports section titles, icon + text + independent favorite action, isTypeable, keyboard navigation and a portalled accessible grid. Market ticker controls and entity switches use it. AppEntityFinder/navigationService supplies cross-module search and favorite navigation; Funds/EMI/Personal Loans/Subscriptions use URL-backed selection.
- Mobile menu moved to the beginning of TopBar; sidebar drawer behavior, shared reporting/date/filter controls and QSE/PSX analytics URL ranges are implemented. Shared summary components compact the main dashboard, and CategoryNav recognizes /dashboard correctly.
- Prior browser review covered Planning/navigation/editor open-cancel, ticker picker appearance and compact dashboard layout. No private financial records were saved during browser review. Required final browser checks still include charts/cursor interaction, mobile topbar, theme variants and cross-module finder navigation.
- The old Vite process is no longer running after the environment update. Start a fresh dev server when needed, using the existing /WealthCrescent/ base. Preserve the user's open tab; use a separate review tab. CUA documentation must be refreshed on resumed computer-use work.

### Next actions, in order

1. Preserve the successful checkpoint above. The next source change is the Recent Transactions migration below; run its focused tests, then required final suite/build on the resulting code.
2. Migrate NetWorthRecentTransactions to a pure engine model and service subscription. **Confirmed pending defect:** its Funds and QSE/PSX withdrawal rows use -(gross - fee), while native ledgers use -(gross + fee). It also assembles financial signs in the component and omits archived/deactivated broker history from a view labeled lifetime. Add native-ledger reconciliation tests, preserve broker isolation, and inspect active-profile data freshness before fixing. Then inspect any remaining dashboard financial derivation. Continue the wider engine/service migration from the explicit pending list in CALCULATION_ENGINE_AUDIT.md; do not call the whole architecture complete.
3. Commit the coherent tested query/model work and retained UI work in focused groups. Some files mix financial and visual changes, especially NetWorthPage.tsx and main.css; inspect hunks. Do not lose untracked dependencies.
4. Update validation/docs with final results; push the existing branch (never main), refresh PR #51 and verify CI on the exact pushed head. Keep it draft until acceptance is met.
5. Complete browser review and then resume outstanding charts/dropdown/topbar/theme refinements. Scheduled app-only auto-pay still requires transaction-safe multi-workbook persistence before implementation; it is not implemented or enabled.

---

## 2026-11-04 — Financial correctness is the active priority

The user's latest instruction prioritizes correct figures and completing CalculationEngine over further visual work. Continue the existing branch and draft PR #51; do not merge or create a duplicate PR. The current working tree also contains the earlier shared charts/dropdown/topbar/dashboard/theme work. Preserve it; resume the authorized visual work after the financial priority is handled.

The new central valuation/query path and concrete accounting corrections are documented in [CALCULATION_ENGINE_AUDIT.md](docs/CALCULATION_ENGINE_AUDIT.md). Current and historical valuation now share one engine path; recorded dividends, gross personal-loan assets/debts, executed-only fallback prices, validated FX, opening-evidence coverage and month-end recurrence have explicit regression coverage. Dashboard headline calculations now come from the engine through service functions. Remaining secondary analytics/UI/service and auto-pay work is listed explicitly in that audit; do not claim engine architecture completion.

Validation in this working session: earlier shared UI checkpoint passed 153 files / 1,168 tests; subsequent financial domain checkpoint passed 46 files / 635 tests; calendar-focused checkpoint passed 8 files / 126 tests. Later financial edits require the final full suite and production build now in progress. These are local results, not new exact-head CI evidence. No merge has occurred.

## 2026-11-04 — Centralized CalculationEngine and app-only auto-pay (user-approved direction)

### User's confirmed requirements

- **Auto-pay means application-only ledger processing.** No bank APIs, payment-provider APIs, external money movement, or claim that money was transferred. On the due date, the app automatically creates a pending record in its own ledger; the user explicitly confirms settlement afterward.
- **One centralized `CalculationEngine`.** Every financial calculation must go through this engine. Existing stock accounting (`stockCalculationEngine.ts` and `portfolioCalculationEngine.ts`) is the reference pattern and must remain correct; route it through the central public boundary rather than duplicating its logic.
- **UI is render-only.** Every UI component/page obtains required read data and dispatches writes through application-service/function boundaries. No component-local calculations, business rules, direct store mutations, Firebase/localStorage persistence or direct imports of calculation modules. Formatting values for display is allowed; calculating financial meaning is not.
- These requirements apply to every component, including cards, tables, forms, dialogs, dashboard widgets, charts and page-level hooks. Hooks may adapt service subscriptions/loading/error state but must not become alternate calculation/business layers.

### Architecture document and implementation started

- Added `webapp/docs/CALCULATION_ENGINE_ARCHITECTURE.md` with target layers, engine/service responsibilities, unified category + project budget direction, app-only auto-pay lifecycle, migration rules and required verification.
- Updated root `CLAUDE.md` to make these user-approved constraints mandatory for future sessions.
- Added `webapp/src/lib/calc/CalculationEngine.ts` as the first public calculation facade. It groups and delegates to the existing stock, portfolio, cash, bank, card, budget, planning, recurrence, upcoming, net-worth, EMI, rental and subscription calculation modules. It deliberately reuses the existing implementations rather than cloning or changing financial logic.
- Exported the facade from `webapp/src/lib/calc/index.ts`.
- Added `webapp/src/lib/calc/__tests__/CalculationEngine.test.ts` to assert that the facade delegates to the exact existing stock, portfolio, budget-activity and upcoming implementations.
- Commits on this branch: `7ff4c6e6df9ec04e830b22e8fdae926eef4a79ad` (architecture document), `661aff729e51fe54bbef608cbaa067fd7881b8c7` (agent rules), `310a00008439271c4c61e0e190bf48004901a076` (CalculationEngine facade), `bcef2aa210ca842c6f6b23f4d2fb9fe2eada15c3` (public export), `29dfb7af5943433dabedf445b1f2bacc42a40230` (facade contract test), and `1fea6abf45354c3a43da395fd490098245298976` (checkpoint docs).
- **Important: this is only the foundation, not completion of the architecture.** Existing components and feature hooks still import calculators and stores directly. The next implementation step is to establish application query/command services, then migrate all UI consumers incrementally. Auto-pay backend processing has not been implemented.
- At latest verification, branch head was `1fea6abf45354c3a43da395fd490098245298976`; branch was 49 commits ahead / 0 behind `main`, with 23 changed files. Re-fetch before further work.
- No local type-check, test suite or production build has been run in this environment; the facade contract test is added but unverified. Do not treat this code slice as validated. No main-branch push or merge.

### Code review findings that shape implementation

- The repo already has a strong stock calculation foundation: `stockCalculationEngine.ts` performs the consolidated stock accounting pass and `portfolioCalculationEngine.ts` assembles the portfolio calculation result. QSE/PSX derived hooks currently call `calculatePortfolio` directly; legacy wrappers such as `positions.ts`, `realizedPL.ts` and `closedTrades.ts` also call the stock engine directly. The central facade must become the only public entry point, then these consumers must migrate without changing accounting behavior.
- Financial calculations are distributed across `lib/calc/**` (including `budgetPlanner.ts`, `plannedBalance.ts`, `upcoming.ts`, `bankModule.ts`, `cashModule.ts`, `creditCardModule.ts`, `netWorth.ts`, `netWorthTrend.ts`, `emiModule.ts`, `rentalPlanning.ts` and `subscriptionsModule.ts`). For example, `PlanningPage.tsx` and `NetWorthPage.tsx` currently call calculation helpers directly, and `BankPage.tsx` calls bank calculation helpers directly. These must be migrated behind CalculationEngine/application queries.
- Components currently access Zustand stores and mutate them directly in several flows. `financePlans.ts` is a useful existing cross-module read/write helper but itself directly accesses the four planned-workbook stores; it needs to become a repository/service implementation, not remain a UI-facing shortcut.
- Planned workbooks are separate Firebase paths: `users/{uid}/plannedCash`, `plannedBank`, `plannedCreditCard`, `plannedRentals`; actual module workbooks are stored separately. Existing `useWorkbookCloudSync` writes whole workbook documents after a debounce. Do not implement scheduled auto-pay by appending to arrays or by a browser timer. The backend repository needs a concurrency-safe, idempotent transaction strategy across plan occurrence/execution and the target native ledger.
- Existing pending-ledger semantics are not identical across modules: Cash and Bank explicitly exclude `isPending` from cleared balances; credit-card planned records currently have no equivalent unified pending lifecycle. Auto-pay eligibility and native-ledger mapping must be defined per module before enabling it. First release should process eligible planned outflows only; rental income and forecast income are not auto-pay.
- Existing recurrence identity and completion behavior in `planOccurrences.ts` must be reused; do not create a second recurrence implementation.

### Approved implementation sequence

1. Introduce a single public CalculationEngine facade and service/query/command boundaries. Add parity tests against existing calculators before migrating callers.
2. Migrate calculation consumers and UI reads/writes incrementally, beginning with planning/payment flows. Keep all existing stores and persisted data compatible while services take ownership of access.
3. Finalize the unified category + project budget model through CalculationEngine; preserve FinancePlanGroup and all existing native planned records with lossless mapping.
4. Add payment execution identity/history and pending native-ledger mapping, then a scheduled Firebase Function only after transaction-safe idempotency and retry behavior are covered by tests.
5. Migrate remaining modules (Cash, Bank, Cards, Rentals, EMI, Subscriptions, Net Worth, QSE and PSX) behind the same boundary. Preserve StockExchangeEngine results and broker-profile isolation.
6. For every slice, run targeted tests, full tests as appropriate, TypeScript checks, production build and diff review against latest main. Never mark a slice complete without the checks for its exact head. Continue small focused commits on this branch; never push directly to main.

# WealthCrescent — Session Handoff (refreshed 2026-11-04, continuation checkpoint)

## 2026-11-04 — Budget planning, dashboard, upcoming and accounting continuation

### Exact repository state at handoff

- **Working branch:** `fix/net-worth-dashboard-parity-and-accounting`
- **Latest application-code head:** `1cf181cdba2a4f61936c0842be2f573dc78093ec` — `refactor(upcoming): keep renewal dates separate from alert reminders`. Later commits on this branch are handoff-documentation-only; re-fetch the live branch tip before starting work.
- **Base / current `main`:** `e545273018b08eebd9f95328b766c7cb2764c5af` (PR #50 documentation follow-up, after PR #49's Net Worth dashboard rebuild).
- **Application diff:** 35 application commits ahead, 0 behind `main`; merge base is exactly the current `main` SHA above. The application comparison contains 17 changed files. Additional commits/files on the branch update the two handoff documents; re-fetch the live total ahead count and exact branch HEAD at session start.
- **PR status:** no open PR exists for this branch at the last live check. Do not assume PR #48/#49/#50 is the active PR: #49 and #50 are closed/merged; this branch still needs its own review/PR after validation.
- **CI status:** no pull-request workflow runs were returned for application head `1cf181cdba2a4f61936c0842be2f573dc78093ec`. Subsequent commits only update handoff documentation; no fresh type-check, production build, full test suite, or interactive browser smoke test has been run for the application changes. Do not describe this branch as validated.
- **No merge or direct-main push has occurred.** Continue on this feature branch, preserve its commits, and never push directly to `main`.

### What is already on this branch — inspect before changing

The branch contains 35 focused commits. The notable work includes:

1. **Upcoming / reminders**
   - Future-only active obligations are collected across module plan stores, with stable row identity and routing to the correct module dashboard.
   - Upcoming and subscription reminders are consolidated into dated items to reduce duplicate presentation.
   - Reminder lead-time alerts fire on their own scheduled calendar day (not all 1/2/3-day reminders together).
   - Latest commit separates renewal dates from alert-reminder dates; preserve that distinction.
   - Relevant files: `lib/calc/upcoming.ts`, `lib/calc/subscriptionsModule.ts`, `hooks/useUpcomingItems.ts`, `components/UpcomingList.tsx`, and their tests.

2. **Dashboard / date navigation**
   - `/dashboard` is the canonical app homepage; `/` and `/net-worth` redirect to it, while the Net Worth dashboard is reused at the canonical route.
   - Shared date-range navigation was extracted to `components/DateRangeWidget.tsx` and integrated into the pinned top bar.
   - Net Worth uses account-style presets and URL-backed date navigation; manual Snapshot controls and duplicate renewal alerts were removed.
   - Lifetime recent transactions were added across modules; inspect broker-profile aggregation carefully before extending it.
   - Relevant files: `App.tsx`, `DateRangeWidget.tsx`, `TopBarControls.tsx`, `NetWorthPage.tsx`, `NetWorthRecentTransactions.tsx`.

3. **Planning / finance summaries**
   - Planning can render embedded editable plan ledgers in the standard section-card pattern.
   - Plan status/category/finance allocation charts were added.
   - Dashboard work includes editable multi-finance budget presentation and lifetime activity.
   - These are useful incremental improvements, **not yet a complete unified budget engine**. Do not infer that category targets, rollover, project budgets, goals/sinking funds, partial-payment reconciliation, or all forecasting scenarios are already implemented.

4. **Funds and financial integrity**
   - Fund summaries were aligned to central stock position totals and historical units now use the central stock accounting engine.
   - Same-day execution price handling and stable legacy execution identities were addressed; regression tests cover oversells and lifecycle-safe valuations.
   - Keep the merged stock calculation engine and broker-profile isolation intact. Never move broker-owned trades/transfers/settings/P&L to an exchange-wide shared scope.
   - Preserve the rule that unmatched SELL quantities and their fees are flagged/reconciled, never assigned invented BUY cost basis or fictitious realized profit.

### User's latest product direction: WealthCrescent is a finance + budget-planning system

The user explicitly clarified that budget planning is a core product capability and should support practical real-world planning scenarios, not just a list of payment reminders. The previous session researched common patterns in YNAB, Actual Budget, Monarch Money and PocketSmith. Useful concepts to consider (research context, not yet approved implementation requirements):

- Category/envelope budgets with allocated amounts, available/remaining balances, rollover and weekly/monthly/yearly/custom target periods.
- Project/goal budgets that group multiple planned payments across dates, categories, modules and financial accounts.
- Recurring schedules with flexible frequency, expected amount/range, end date, skip/complete actions and optional matching to actual ledger entries.
- Split transactions and partial payments with allocations that reconcile exactly to the parent transaction amount.
- Savings goals/sinking funds, cash-flow projections, actual-vs-planned reporting and what-if scenarios.
- Rules/automation for categorization and recurring transaction handling, while preserving explicit user confirmation where financial records are uncertain.

A possible direction discussed was one unified budget domain supporting multiple budget modes (category/envelope, project/goal, recurring/periodic, savings/sinking fund, cash-flow). This remains a **proposal**, not an approved schema. The previous assistant asked whether the user approves supporting both category-based and project-based budgets in one unified engine; the user had not answered before this handoff request. Ask this one design approval question before committing to that architecture, unless the user explicitly says to proceed.

### Proposed architecture to evaluate after approval — do not blindly implement

- A parent Budget with one or more child budget items/allocations. Budget items may point to a module/entity, account/finance, category, currency, expected amount/range, due date and recurrence.
- Link allocations to actual existing ledger transactions; do not duplicate/copy financial transactions into the budget store.
- Derive Planned / Pending / Partially paid / Paid / Overdue / Skipped / Cancelled from actual linked records and remaining amount. Keep labels such as “Due Today” or “Happening in X days” separate from lifecycle status.
- Normalize activity from Cash, Banking, Cards, Rentals, EMI/Loans, Subscriptions, Funds, QSE and PSX for reporting without losing source module IDs or broker profile ownership.
- Keep currency totals separate unless the user explicitly enables a sourced FX conversion. Do not double-count internal transfers or credit-card repayments; distinguish investment contributions from consumption.
- Use the central calculation engine as the single source of financial calculations; UI components must not independently recompute balances, budgets, P/L or forecasts.
- Rental income and expenses should both participate in period flow; do not reduce Rentals to a special net-only treatment.
- Forecasts must be based on real historical balances/transactions and clearly label estimates; never invent historical snapshots or settlement dates.

### Previously specified dashboard / planning UX contract

Keep these requirements in scope when reviewing the branch and planning future work:

1. Overall section: per-currency grouped stat cards and chart.
2. Per Currency section: assets, liabilities, net worth, module contributors/changes, Planned vs Reality and chart.
3. Monthly navigator.
4. Plans table with all relevant actions, including Modify.
5. Recent Transactions across all modules, lifetime, newest first, 25 per page by default.
6. Insights, followed by Upcoming.
7. Monthly summaries should use a timeline-style widget rather than an excessively wide table.
8. Use the reusable date-range widget consistently across pages, with backward/forward navigation and URL-backed state where appropriate.
9. Clicking a module should open its module dashboard; exchanges should have their own dashboards.
10. Upcoming should contain future unresolved items only; completed/deleted/stale items must not reappear. Alerts are separate, date-accurate and deduplicated.
11. Use the standard app section-card patterns; avoid cards nested inside cards. Do not reintroduce a manual Snapshot button.

### Next-session execution order

1. Re-read root `CLAUDE.md`, this handoff, `webapp/MODULES_PLAN.md`, `webapp/README.md` (if its contents can be retrieved), `webapp/USER_MANUAL.md`, `webapp/audit.md`, and the relevant dashboard/planning guides before editing.
2. Refresh live `main`, this branch head, PR list and Actions. Confirm the branch remains 35 ahead / 0 behind (or record the new state); never rely on the SHA in this handoff if the remote moved.
3. Review the full 35-commit history and all 17 changed files against current `main`. Preserve the already-merged PR #48 stock engine, PR #41/#43 broker-profile isolation, PR #46 Funds cash ledger, and PR #49 Net Worth dashboard work. Do not restore older branch versions over newer main code.
4. Audit the existing implementation and tests before designing a unified budget schema. Explicitly distinguish working features from proposals and gaps. Resolve the category-budget + project-budget design approval first.
5. Fix any correctness regressions in Upcoming, reminder timing, funds valuation, date navigation, and cross-broker recent activity. Keep stable IDs, chronology and profile ownership.
6. Run the complete webapp test suite, both TypeScript checks/type-check, and production build on the exact final branch head. If application code changes after validation, rerun all required checks. Add regression tests for every financial or date calculation fix.
7. Perform interactive browser smoke tests with representative multi-currency, multi-broker and partial-month data when an interactive preview is available. If unavailable, record that as not done; do not claim visual verification.
8. Update `webapp/README.md` Done/Pending and `webapp/USER_MANUAL.md` only for behavior that actually ships and is verified. The GitHub file reader returned an empty content body for `webapp/README.md` at this checkpoint (blob SHA `e5fd4b52dbb9b3cba23c4f174c555bfff8e5c305`); do not overwrite it with an empty replacement. Retry a safe retrieval method before editing it.
9. Once review and checks are complete, create/update a PR from this branch to `main`; keep the PR focused and do not merge until the exact PR head passes all required checks.

# WealthCrescent — Session Handoff (refreshed 2026-11-04)

## 2026-11-04 — Net Worth dashboard rebuild, PR #49 merged

- **PR #49:** [Rebuild Net Worth dashboard layout, date filters, and insights](https://github.com/ranamrameez/WealthCrescent/pull/49).
- **Branch:** `fix/net-worth-dashboard-rebuild`, based on `main` at `c9aa3ed1f2da7858165dbbe67e27d5c209360f54`. No changes were made directly to `main`; the branch preserves the merged stock-calculation engine and broker-profile isolation.
- **Merged main head:** `efaa8b2e4a6da1cd9b6ffdc2728afcf94fedc690`; **validated PR head:** `811ce91d765a6aa283b28a013994120bc154d9d4`; **dashboard-test head:** `e493ce59fc8c63b84d9644b72f8d650602bfef37`.
- **Scope:** `webapp/src/features/netWorth/pages/NetWorthPage.tsx`, the optional `unframedHeader` behavior in `webapp/src/components/StandardPageSections.tsx` (only enabled for these dashboard sections), and the dashboard tests. The dashboard now has URL-backed 7d/30d/90d/6m/12m/YTD/all/custom date ranges; period-based cleared Cash/Bank flow, forward-looking 30-day upcoming plans, net-worth change, exact-range category/rental/monthly flow; complete selected-range monthly history; historical/activity currency coverage; per-currency asset/liability/activity insights; and FX conversion warnings.
- **UI:** the four dashboard sections render with plain collapsible headers and no outer card shell, so their actual summary/chart/insight cards are siblings rather than nested inside another section card. Activity-only currencies appear in the per-currency summary and monthly tables. The current net-worth headline remains a live balance; period movement is clearly labeled and calculated at exact period endpoints. Monthly net-worth chart points remain month-end/current-day snapshots, while flow totals and drilldowns are clipped to the exact selected dates.
- **Calculation safeguards:** reuse `netWorthAsOfDate`, `flowByCurrency`, and existing budget activity collection. Pending Cash/Bank movements and linked transfers retain the existing helper semantics. No source transactions, balances, broker profiles, or financial records are rewritten. Missing FX is surfaced, not guessed. A period change is withheld without a real pre-period net-worth baseline.
- **New guide:** `webapp/docs/net-worth-dashboard.md` records the date-filter, calculation, coverage, and verification contract.
-  **Tests:** four dashboard regression tests cover custom date filtering/period flow, exclusion of out-of-range transactions while retaining live balances, preset-to-custom date preservation, insights, and collapsible flat sections. Earlier CI runs caught actual defects; those were corrected and are not used as validation. Actions run #399 passed **142 test files / 1,132 tests**, both TypeScript checks, and the production build on PR head `811ce91d765a6aa283b28a013994120bc154d9d4`. The squash-merge commit contains the same validated source tree.
- **Still required:** interactive UI smoke test with representative multi-currency data and partial-month custom ranges when a preview/live page is available. Actions run #394 verified the latest application-code head, but this session did not visually inspect the rendered page or reconcile imported financial records against broker statements. PR #49 is merged. Verify the deployed page when available; the manual browser smoke test remains outstanding.
- **Potential follow-up:** the dashboard reports per-currency contributors and recorded Cash/Bank/Rental activity. It does not yet provide a user-data import completeness audit or cross-check every QSE/PSX broker statement; do not claim that it does.

---


## 2026-10-31 — Funds cash reconciliation / issue #42 (merged)

- [PR #46](https://github.com/ranamrameez/WealthCrescent/pull/46) is closed and merged into `main`; merge commit: `b0986efa5f3610cf8031b02748f4233ffdfbd4ad`. [Issue #42](https://github.com/ranamrameez/WealthCrescent/issues/42) is closed.
- **No recent main changes were discarded:** PR #46 targeted current `main` and the final PR head `66f2a28fe0b09384999062ce22f3a82ba5fa73bd` compared as 106 commits ahead / 0 behind main before merge. The stale `feat/broker-profile-isolation-rebased` branch was not used; merged PR #43 remains the source of truth for broker isolation.
- Architecture: a separate portfolio-level Funds cash account per currency. Funds linked transfers are portfolio-level and have no fund/broker reference, so a per-fund account would not match the existing transfer model.
- New/edited Funds transfers store `currencyCode`. A versioned metadata-only migration snapshots the existing Funds default currency for legacy transfers without rewriting the original transfer records. The Cash ledger warns about those rows and lets users assign a currency by editing.
- BUY reduces cash in the fund's currency; valid SELL adds proceeds; transfer fees are applied once; unmatched SELL quantities and pending trades do not create cash movement; matched portions of partial SELLs return proceeds. Each currency has an independent ledger.
- Funds Summary separates invested cost basis, holdings value, cash on hand and total Funds value. Current and historical Net Worth add cash to holdings once, with a separate Funds cash inclusion toggle.
- QSE/PSX broker transfers remain profile-owned through `brokerId` and the selected profile's `data.transfers`; the selected broker's own currency and deposit-fee settings drive linked transfer resolution. Funds cash does not replace or share exchange broker cash.
- **Validation:** Actions [run #314](https://github.com/ranamrameez/WealthCrescent/actions/runs/41208426730) passed 138 test files / 1,100 tests, type-check and production build on application-code head `4841fb6b3b0059738d7d3972804a37662196d869`. The commits after that validated code head were documentation-only.
- **Post-merge manual follow-ups:** real legacy backup/export review and interactive browser smoke tests were not completed in this session. The user explicitly requested the merge; do not claim these manual checks passed. Complete them against the merged `main` before treating those manual verification items as done.
- The specifically requested `feat/broker-profile-isolation-rebased` branch was stale/diverged and was not merged. Use merged `main` as the source of truth.


## 2026-10-31 — PR #44 merged into main (latest)


- **PR #44:** [Standardize section actions, pagination, and finance summaries](https://github.com/ranamrameez/WealthCrescent/pull/44) is closed and merged.
- **Merge method:** Squash merge.
- **Merge commit on `main`:** `d1c3c4c33776dc871cf15f044353359a71c18986`.
- **Merged feature branch:** `fix/trade-entry-validation-and-transactions-ui`.
- **Scope:** 56 files covering shared actions and pagination, finance summaries, credit-card running limits, QSE/PSX trade safeguards, FAB/plan execution verification, and legacy oversell reconciliation.
- **Validation:** application-code head `18348fa258be95767b209b8585b575a8acdd2cf8` passed both jobs in Actions run [#41201015866](https://github.com/ranamrameez/WealthCrescent/actions/runs/41201015866): full test suite and type-check/production build. Later commits before merge were documentation-only; no application code or tests changed after this successful run.
- **Accounting regression:** PSO history is 122 BUY / 132 SELL; 122 shares are matched, 10 excess SELL shares remain flagged, and unmatched shares/fees do not create realized profit.
- **Manual verification limitation:** the connected browser in that session exposed read-only tab content only. Interactive branch-level testing of trade entry, FAB persistence, credit limits, pagination, and chart/filter behavior was not completed. Do not represent those flows as manually verified; perform a production UI smoke test when interactive browser access is available.

### User-confirmed delivery rules (2026-10-31)

1. Make small, focused commits and push them regularly on the active feature branch.
2. Keep `webapp/README.md`, `webapp/USER_MANUAL.md`, root `CLAUDE.md`, and this handoff current when relevant.
3. Never push directly to `main`; use a branch and PR.
4. Before merging, verify the latest application-code head with successful type-check, production build, and full test suite. If application code changes after validation, rerun the full checks.

---

## 2026-10-31 — PR #44 continuation handoff (latest)

**Current work is already in draft PR #44** — [Standardize section actions, pagination, and finance summaries](https://github.com/ranamrameez/WealthCrescent/pull/44). Do not start a duplicate branch or duplicate implementation. Live GitHub check at handoff time:

- PR: **#44**, open, draft, base `main`.
- Branch: `fix/trade-entry-validation-and-transactions-ui`.
- Latest application-code/PR head before this handoff refresh: `54560149c170a2af1d32223c1e4bafdd2c6c0afa`; this update adds documentation only. Re-fetch the branch after this commit rather than relying on this snapshot SHA.
- Base SHA reported by PR at the last comparison: `49cb2a40810619fa075cd422703ab4a6900adce2`; re-check live main before any merge.
- PR has a large commit history (159 commits at this comparison) and 56 changed files. Review the complete diff and commit history carefully; do not assume the PR description's validation refers to the current head. Review the complete diff and commit history carefully; do not assume the PR description's validation refers to the current head.
- Latest verified application-code/PR head: `54560149c170a2af1d32223c1e4bafdd2c6c0afa`. GitHub Actions run [#41200626771](https://github.com/ranamrameez/WealthCrescent/actions/runs/41200626771) passed **Type-check and production build** and the **full test suite** on that exact head. This handoff refresh adds documentation only; re-check Actions for the resulting documentation head before marking ready or merging.
- Intermediate pagination commits exposed a leftover `setPage(1)` reference in Banking after moving to the shared hook; it was removed in code head `bf80f621`, whose build and tests passed. A final review also strengthened historical edit validation to compare unmatched quantities per SELL transaction, not only per-ticker totals.
- Nothing from this work has been merged into `main`. Keep the PR as a draft until current-head tests/build, full diff review, and any required manual checks are complete.

### Latest continuation update (2026-10-31)

After the earlier `bf80f621` checkpoint, the branch received the following additional application work:

- Extended shared pagination to Bank account/all-bank ledgers, Cash planned entries, Funds import/transaction/balance/transfer tables, Net Worth activity drilldowns, Planning category/activity tables, Rental property plans/monthly rollups/plan overview, and Subscription renewals. Existing intentionally short import previews and small summary tables remain bounded.
- Corrected the PSO fixture to the actual supplied **122 BUY / 132 SELL** history. The final 80-share SELL matches 70 available shares and leaves 10 unmatched; no synthetic BUY is added and no profit is recognized on unmatched shares.
- Added transaction-specific chronological edit validation so an edit cannot move a pre-existing unmatched quantity from one SELL row to another.
- Added proportional-fee regression coverage and surfaced unmatched SELL fees in reconciliation warnings and all-time summaries for both QSE and PSX.
- Applied sell-quantity and configurable price-deviation checks to Trade Strategy plan execution and verify that the transaction is actually recorded before showing success.
- Kept the FAB calculator ticker synchronized with stock-detail route changes and added summary regressions for date formatting and credit-card debt-change tone.

The exact application-code head `54560149` passed type-check, production build, and the full test suite in run `41200626771`. The current PR remains open and in draft; nothing has been merged to `main`.

### Scope already represented in PR #44 — verify rather than re-implement

The PR description reports implementation of: functional-only StandardCard/TableCard actions and legacy Tabs forwarding; shared pagination across finance and QSE/PSX tables; credit-card chronological running consumed/allowed/available limits; Funds and Brokers as peer navigation sections with Summary/Funds/Brokers expanded by default; Portfolio Item-style inline summary subsections; All Time defaults for QSE/PSX stock-detail history/exports; daily/latest-recorded-day and lifetime low/high bounds on both price-comparison charts; sell-quantity guards and configurable ±10% market-price deviation confirmations; stock-detail FAB ticker preselection; robust FAB save success/failure handling; and legacy oversell reconciliation with proportional fee allocation and no fictitious P&L on unmatched shares.

### Critical financial-data correction to the PR description / PSO regression

The transaction table supplied by the user totals **122 BUY shares and 132 SELL shares**, not 132 BUY and 132 SELL. The correct accounting expectation is:

- Match/close the 122 genuinely purchased shares against 122 sold shares.
- Leave **0 matched/open shares** after all valid lots are consumed.
- Flag **10 excess SELL shares as unmatched/reconciliation quantity**.
- Do not invent 10 BUY shares, silently discard the excess, or count unmatched shares/fees as realized profit.
- Allocate the SELL fee proportionally to the matched quantity; separately surface the unmatched portion/fee for reconciliation.

The PSO regression fixture and PR description now use those exact 122/132 totals. Re-check the test and description if the fixture is edited; never add a synthetic BUY to make the numbers balance.

### Next-session execution order

1. Re-read root `CLAUDE.md`, this handoff, `webapp/README.md`, `webapp/USER_MANUAL.md`, and `webapp/audit.md`; then refresh live PR #44, branch head, main head, and Actions state.
2. Confirm the PR head is still the expected handoff base; if it moved, use the new exact SHA for every validation decision.
3. Inspect PR #44's full diff and all commits for accidental unrelated changes, duplicate implementations, data migrations, and shared-component regressions. Preserve existing URL-backed filters, full filtered datasets for calculations/exports, and QSE/PSX parity.
4. Run/check current-head type-check, production build, and full test suite. Fix failures on this branch, then re-run all required checks against the final head.
5. Specifically verify: credit-card opening debt and chronological running limits; Funds/Brokers route and navigation hierarchy; default-open behavior; All Time filter behavior and URL persistence; summary groups on each affected entity page; daily/lifetime chart bounds; QSE and PSX sell guards including sequential/multi-row entries; ±10% warning/cancel path; FAB ticker preselection and correct broker-profile persistence; and PSO 122/132 reconciliation math.
6. Finish the cross-page audit for remaining inert section actions and unpaginated tables. Do not add fake menu actions or paginate a dataset before calculations/exports consume it.
7. Update `webapp/README.md` Done/Pending, `webapp/USER_MANUAL.md`, and this handoff only for behavior actually verified. Keep PR #44 draft until ready; never push directly to `main`. The user explicitly requested this handoff be pushed, but did not authorize merging PR #44.

### Continuation work after the initial handoff snapshot (2026-10-31)

The next context continued on the same branch and preserved the handoff/docs commits. Additional code changes after head `0901cfc9`:

- Applied shared pagination to Personal Loans plan/payment tables, EMI repayment and planned-installment tables, QSE/PSX stock-detail transaction tables, and expanded stock price-history tables.
- Expanded default-open primary sections to Summary, Banks, Accounts, Funds, Brokers, Properties, Loans, and Subscriptions (explicit `defaultOpen: false` remains respected).
- Corrected shared summary date detection and credit-card debt-change tone; added regression tests.
- Added chronological edit validation so changing a historical BUY/SELL cannot introduce new unmatched sells, while existing legacy discrepancies remain editable.
- Added sell-quantity and configurable price-deviation checks to Trade Strategy plan execution; verify the store actually records the planned transaction before showing success.
- Kept the FAB calculator ticker synchronized if the stock-detail route changes while the modal is open.
- Corrected the PSO regression fixture: removed an unsupported 10-share BUY. The supplied history is 122 BUY / 132 SELL; the final 80-share SELL matches 70 and leaves 10 unmatched. No synthetic BUY is introduced and no profit is recognized on those 10 shares.
- Updated PR #44's description to reflect these changes and the correct PSO totals.

The latest verified application-code head is `bf80f6217ef00f26a1ec45ea1f825841c7790e18`; it passed type-check, production build, and full tests in run `41199973181`. This code head includes the transaction-specific legacy-oversell edit validation and the Banking pagination cleanup. Subsequent documentation-only commits refreshed `USER_MANUAL.md`, `README.md`, and `CLAUDE.md`; verify the current PR head and its latest Actions run before merge.

### Tool/session limitation

The original handoff commit `8688aebb` was documentation-only; that handoff-writing context made no application-code changes and ran no build, tests, or browser verification. Subsequent continuation changes are recorded in the section above and have their own branch commits and CI runs.

---

# WealthCrescent — Session Handoff (2026-10-29)

Read this before continuing work in a new session. This is a concise, dated handoff, not a replacement for the canonical project documents.

## Source of truth and working rules

1. Read root `CLAUDE.md` for standing instructions, then `webapp/README.md` for the current Done/Pending backlog, `webapp/USER_MANUAL.md` for user-facing behavior, and `webapp/audit.md` for the active cost-basis audit.
2. Keep `webapp/README.md` Done/Pending, this handoff, and `webapp/USER_MANUAL.md` current as work lands. Record concrete examples and regression tests for financial-calculation fixes.
3. Never push directly to `main`. Use focused branches and pull requests. The latest explicit instruction allows incremental merging of independently working tasks, but merge each task only after its relevant checks pass; do not wait for a giant batch.
4. Do not claim tests/build/browser verification unless there is evidence. GitHub-connected tools can inspect and edit repository files, but do not assume a local npm/browser runtime is available.
5. Preserve financial data during settings resets. Defaults apply initially; each user can customize their own values. A newer app-default version should offer a choice to apply new defaults or retain custom values, never silently overwrite user customizations.

## Main branch / validation checkpoint

- main was at aef2c82b0ea2d82521cbbeb7e5d01eb5290d867a after documentation PR #32 merged on 2026-10-29. Re-check the live remote HEAD before further work.
- PR #31 merged: [Align transaction-page P/L with configured cost basis](https://github.com/ranamrameez/WealthCrescent/pull/31). Its production build and full test suite passed. QSE/PSX per-SELL P/L now follows Average/FIFO/Lowest-cost-first settings; Average cost hides incompatible lot-attribution tables. This is only the transaction-page slice, not a completed app-wide cost-basis audit.
- PR #30 merged: [Preserve stock-trade entry when save fails](https://github.com/ranamrameez/WealthCrescent/pull/30). Current main preserves QSE/PSX entry values and shows a retryable error if the synchronous transaction-store mutation throws; its QSE success/failure tests, full test suite, and production build passed CI.
- PR #29 merged: [Document current session state and safe porting plan](https://github.com/ranamrameez/WealthCrescent/pull/29); `webapp/SESSION_HANDOFF.md` is now part of `main` and linked from `CLAUDE.md`/`webapp/README.md`.
- PR #28 merged: [Fix existing CI regressions in finance UI and persistence](https://github.com/ranamrameez/WealthCrescent/pull/28). Post-merge Pages workflow [run 40931354687](https://github.com/ranamrameez/WealthCrescent/actions/runs/40931354687) completed successfully. The PR's final CI run passed production build and all 134 test files.
- PRs #25, #26, #27 are merged:
  - [#25 appearance reset and initial defaults](https://github.com/ranamrameez/WealthCrescent/pull/25)
  - [#26 versioned broker defaults](https://github.com/ranamrameez/WealthCrescent/pull/26)
  - [#27 data-preserving reset of all settings](https://github.com/ranamrameez/WealthCrescent/pull/27)
- App defaults are **partially implemented, not a complete administrator-managed defaults system**. Broker defaults are versioned and users can choose apply/keep; appearance reset and Account-page reset-all-settings exist. Still verify behavior in the live/browser experience and decide whether an admin-facing source-of-truth/editor and broader default versioning are required. Reset-all must preserve financial records.
- Broker profiles exist per exchange. QSE starts with The Group; PSX starts with JS Zindigi and AL Habib Capital Markets. Published broker fee schedules may be incomplete/out of date; users must reconcile editable levies with actual contract notes.

## Closed stale work — preserve useful history, do not merge old branches

### PR #22 — superseded and closed
[Closed PR #22](https://github.com/ranamrameez/WealthCrescent/pull/22), former branch `chatgpt-audit-qse-transaction-order`, preserved head `d962a49f03b170d7a6ff7bc6c141c366809b5804`.

- The transaction-view cost-basis slice was ported to fresh work and merged in PR #31.
- PR #22 was closed on 2026-10-29 and retitled `[Superseded] Align QSE/PSX accounting order and cost basis` to prevent accidental merging of a stale, diverged branch.
- The stale branch is still closed and must not be merged. Its useful ordering idea is being ported in fresh PR #36. The intended canonical fields are `globalTransactionIndex` (workbook-wide accounting order) and `perTickerIndex` (derived order within each ticker); reordering swaps global positions and recomputes per-ticker indexes through a shared helper. Legacy `transactionIndex`/`seq` are mirrors only. PR #36 remains open pending CI/review, and does not solve unified ordering for mixed cash-ledger events.
- The source branch was intentionally retained for recovery. Do not build new work on it; if the idea is resumed, create a fresh branch from current `main` and port only reviewed changes. The connected GitHub tools available in this session do not expose branch deletion, so the old branch has not been deleted.

### PR #23 — superseded and closed
[Closed PR #23](https://github.com/ranamrameez/WealthCrescent/pull/23), former branch `fix/fab-trade-save`, head `979ac79e9d6a4c775580131550f17992ec21f73d`.

Its unique retry-preserving failure behavior and regression coverage were ported into PR #30, which is merged and passed CI. Do not reopen or merge this stale branch. Its source branch is retained for recovery; it is not the source of truth for future development.

PR #31 merged the transaction-page cost-basis consistency slice. PR #32 merged the status/handoff refresh. PR #36 is the current fresh transaction-order implementation; check its live state and CI before proceeding.

## Remaining work and safe next actions

1. Re-check live GitHub PR/branch/CI state before each task; this handoff is a dated snapshot.
2. PR #22 and PR #23 are closed as superseded. Do not reopen or merge their stale branches. PR #30 and PR #31 are merged with green CI; PR #32 and PR #33 are documentation-only merges.
3. **Canonical global/per-ticker transaction ordering is in PR #36, not merged.** Never merge stale PR #22. Review the fresh PR and its CI. `globalTransactionIndex` is canonical total order; `perTickerIndex` is recalculated from it for each ticker; `transactionIndex` and `seq` are compatibility mirrors.
4. Before shipping cross-date reordering, ensure tests cover synchronized indexes, positions, realized P/L, and cash-ledger behavior. The mixed cash ledger still sorts combined trades/transfers/adjustments by effective date, so do not claim a unified mixed-event ledger order is solved until separately designed and tested.
5. Continue the broader cost-basis dependency audit outside Transactions: Dashboard, Position Detail, analytics/time series, exports, charts, and strategy/advisory views. Update this handoff, `webapp/README.md`, `webapp/audit.md`, and `webapp/USER_MANUAL.md` after each independently verified slice.
6. Keep PSX market-cache activation pending until rules deployment, scheduled function deployment, and cache population are actually verified; the prior Firebase admin attempt returned HTTP 401 before mutation.
7. Old source branches are retained for recovery because the connected GitHub tools available in this session do not expose branch deletion. The stale PRs are closed and cannot be accidentally merged through the normal open-PR workflow.

## Latest CI regression fixes now on main

PR #28 fixed the `PriceInput` draft/default interaction, flushes queued local-storage writes during local-data reset, preserves merged-away bundled default categories, and aligns two brittle/current-behavior tests. Full test suite: 134/134 test files passed; production build passed. This does not validate the deferred global transaction-order proposal or live Firebase/browser behavior.

### PR #36 CI repair update (2026-10-30)

The prior full suite had failures in QSE batch CSV imports, hidden-order reorder saving, and the live price-input synchronization test. Fixes are now committed on `feat/persisted-trade-accounting-order`: exclude derived `perTickerIndex` from numeric input validation; teach `BatchEditGrid` to include hidden `orderKey` drafts in dirty state and onSave (QSE's `globalTransactionIndex` is not a visible column); and await the live-price effect in the asynchronous test. Production build passed in the previous run; the new test run has not yet completed.

## 2026-10-30 — verified stock-order merge and current follow-ups

- PR #36, `Synchronize global and per-ticker trade accounting order`, was merged to `main` as `e4aef0bcd2ccf20e2cd7c73a3fe98cc293943be8`. Its exact source head passed GitHub Actions run #94: full test suite and production build both succeeded. The mixed-event cash ledger (trades + transfers + adjustments) still uses effective-date ordering; do not claim that separate ledger problem is solved.
- Broker-profile isolation from PR #38 was merged into its original feature branch only after its exact source head passed run #99. A main-targeted PR #39 now carries that implementation; its own CI must pass before merge. The migration still requires a backup/export review and browser verification; CI alone does not validate a user's financial data migration.
- Mutual Funds date/amount fixes are being ported to a fresh branch from the post-#36 `main` because the original PR #37 branch diverged when #36 merged. Main-targeted PR #40 is the intended replacement; PR #37 should be closed as superseded only after #40 is opened and CI starts.
- Mutual Funds changes: Balance History uses effective `date` (same-day `time` tie-break only); Invest/Withdraw Amount is editable and derives units from NAV; tests cover amount conversion and date-driven history/latest-price ordering. Invest and Withdraw remain separate actions; P&L is derived.
- Funds transfer/cash reconciliation is intentionally separate. `FundsWorkbook` inherits generic transfers but has no per-fund cash-on-hand account. A correct solution needs an explicit cash ledger/account model so a deposit is cash until a BUY moves it into units; otherwise the same deposit could be counted once as cash and again as holdings. Do not merge a shortcut that double-counts it.
- For every PR, validate the latest head SHA, not a previous run. Require both full tests and production build green before merge. Never push directly to `main`.


## Broker-profile isolation — current PR #41 checkpoint (2026-10-30)

- Clean main-based branch: `feat/broker-profile-isolation-main`; PR #41.
- Per-broker data: trades, transfers, adjustments, dividends/rewards, trade plans, fee/cost-basis settings and calculations. Shared exchange data: market prices, price history, watchlists and exchange-wide information.
- Central Transfers/Cash Transfer pickers store the individual broker profile ID. Add/edit/delete must route to the correct profile even when it is inactive; legacy linked transfers recover their broker reference.
- Archived profiles remain view-only; deactivated profiles are hidden from normal activity and cannot become active.
- Legacy PSX history migrates to JS Zindigi/JS Zindagi, preserving transaction IDs, dates, tickers, actions, quantities, prices, fee overrides, transfer amounts/fees, and shared market data.
- The original stacked implementation passed run #99; clean main-based PR #41 passed run #105 (tests/build) before post-PR40 reconciliation. The latest head needs a fresh Actions run. Do not merge until a backup/export review and browser checks confirm migration, profile switching, linked transfer routing, and status restrictions.
- PR #36 and PR #40 are merged; PR #37 and #39 are closed as superseded. Funds cash reconciliation is tracked in issue #42.


## 2026-10-30 — PR #43 final CI status

PR #43 (`feat/broker-profile-isolation-main-v2`) is based on current `main`, including PR #40's Mutual Funds effective-date correction. Latest head `b31bbd264d105c0445abc655abe2f083017e9407` passed GitHub Actions run #107: full test suite and production build. Keep it open until a real backup/export migration review and browser verification are complete. The connected browser session was unavailable during this pass, so do not claim those manual checks were performed.


## PR #43 latest-head validation (2026-10-30)

Latest head `dcf3181a0a8955417c4049089f4735685c25a8ec` passed GitHub Actions run #112: full test suite and production build. PR #43 is code/CI ready but remains open pending a real PSX backup/export migration review and browser verification. The connected browser context was unavailable during this session; do not claim those manual checks were completed.


## 2026-10-31 — merge authorization and workflow rules

The user confirmed that only this session is active and explicitly instructed us to complete PR #44 and merge it. Do not defer to earlier notes asking to keep the PR in draft without user approval; that approval has now been given.

**Standing workflow rules (user-confirmed 2026-10-31):** make small, focused commits; push regularly to the existing feature branch; keep `CLAUDE.md`, `webapp/README.md`, `webapp/USER_MANUAL.md`, and this handoff updated when relevant; never push directly to `main`; and never merge unless the exact latest PR head has successful type-check, production build, and full test suite. Any code change after validation requires a fresh full run on the new head.

### Live review checkpoint

- PR #44 was open, draft, and mergeable at application-code head `18348fa258be95767b209b8585b575a8acdd2cf8`; 56 files changed and 163 commits at that checkpoint. No inline review threads or submitted reviews were present.
- GitHub Actions run [#41201015866](https://github.com/ranamrameez/WealthCrescent/actions/runs/41201015866) completed successfully on that exact application-code head. Both jobs succeeded: full test suite (including broker-profile and PSX-fee regression tests) and type-check/production build.
- Subsequent PR commits `89f05a58`, `c65b0884`, and `aa40f608` are documentation-only changes to `CLAUDE.md` and this handoff; no application source or tests changed after the successful run. The workflow did not report a new PR run for these docs-only commits.
- The diff was reviewed for the shared section actions, default section expansion, shared pagination, credit-card chronological balances, FIFO legacy-oversell matching/fee allocation, transaction edit validation, QSE/PSX position summaries and trade calculator changes. The PSO fixture expectation remains 122 BUY / 132 SELL, with 10 unmatched SELL shares and no fictitious realized profit.
- The connected production browser tab exposed the deployed Net Worth analytics page for read-only inspection. This session's browser connection provides tab reading only, not navigation/click interaction, so end-to-end interaction checks for the PR branch could not be performed here. Do not claim those manual flows were browser-verified; automated validation and source review are the available evidence.
- The user explicitly authorized merging despite the earlier draft-only checkpoint. The remaining actions are to re-fetch the live PR head/base and mergeability, confirm no application-code changes occurred after the successful run, mark PR #44 ready, and merge it. Never push directly to `main`.


## 2026-10-31 — PR #48 unified stock calculation engine (current work)

- **PR:** [#48 — Unify stock calculations, lifecycles, and same-day event ordering](https://github.com/ranamrameez/WealthCrescent/pull/48)
- **Branch:** `feat/unified-stock-calculation-engine`
- **Current code head at this handoff update:** `24bfbf12d4642d9df6c11f596a4cced3a8fcdd01` (re-fetch live head before continuing).
- Do not start a duplicate branch or revert any newer main changes. Continue on this PR branch.

### Architecture delivered in the branch

1. `stockCalculationEngine.ts` is the single stock-accounting pass. Average/FIFO/other lot methods share chronological lifecycle processing and produce positions, realized P/L, per-SELL attribution, closed trades, open lots, lifecycle reporting and oversell reconciliation.
2. `portfolioCalculationEngine.ts` is the public exchange portfolio pipeline. QSE and PSX derived hooks call it and consume the returned stock results, position valuations, cash ledger and cash summary.
3. `positions.ts`, `realizedPL.ts`, `closedTrades.ts` and `fifoPositions.ts` are compatibility adapters into the stock engine. Do not reintroduce parallel accounting logic into pages/hooks.
4. A fully closed position lifecycle is reset before a later BUY. Reopening the ticker starts a new lifecycle with no inherited shares, cost or FIFO lots.
5. Oversells preserve actual cash movement but unmatched shares receive no cost basis or realized P/L. Unmatched quantities and their proportional SELL fees are returned per SELL transaction and surfaced in QSE/PSX transaction views.
6. Same-day ordering is persisted as one `accountingOrder` across trades, transfers, adjustments and dividends. Existing arrow controls use the complete same-day event stream, preserve event dates, and recalculate through the central pipeline. QSE controls are available in Modify mode; PSX controls are displayed beside rows. Sequence is not edited in Batch Edit.

### Latest validation checkpoint

- The prior CI attempt failed because the QSE reorder test expected a sequence input that the Batch Edit UI intentionally does not expose. The test was corrected to assert that Batch Edit has no separate reorder arrows and that the existing row arrows reorder a trade across a same-day transfer.
- The QSE test import was also corrected to import `QseReorder` from its actual module, `QseTableActions.tsx`.
- Actions must be checked again on the exact current head. Do not use the earlier failed runs as evidence of success. The latest known build/type-check job passed, but the full test suite failed on the now-corrected batch-editor assertion; the rerun for the corrected head is pending.
- Manual browser smoke tests and real backup/export migration review remain outstanding.
- No merge has been performed. Never push directly to `main`.

### Next steps

1. Verify Actions on the live PR head: full tests, type-check and production build.
2. If tests fail, inspect logs and fix only the actual failing regression; rerun on the new head.
3. Review the complete PR diff for unintended changes and ensure every QSE/PSX transaction card uses the shared ordering control.
4. Perform interactive browser smoke tests when browser interaction is available.
5. Only after exact-head CI and review, consider merge according to the user's approval.


## 2026-10-31 — latest validated calculation-engine checkpoint

The latest validated application-code head before this documentation/comment refresh was `48fde7820b387ec1c1fa4184bb02dd5600774330` on `feat/unified-stock-calculation-engine`, PR #48.

**Actions run #41242056151 passed**:
- Type-check and production build.
- Broker-profile and PSX-fee regression tests.
- Full Vitest suite: **142 files / 1,123 tests passed**.

Latest implementation details:
- `stockCalculationEngine.ts` is the sole stock-basis accounting pass for Average/FIFO/lowestCostFirst. The exchange-level `portfolioCalculationEngine.ts` returns positions, realized series, sale attribution, closed trades, lifecycle records, open lots, oversell reconciliation, valuation rows, cash ledger and cash summary.
- `positionValuation.ts` is the shared market-value/unrealized-P&L formula used by the portfolio pipeline, cash-summary fallback and historical chart snapshots. Whole-position average cost, break-even, +1%/+2%/+5% targets and per-share commission are returned by the pipeline and consumed by QSE/PSX dashboard and portfolio views.
- Strategic Trades views also use the same pipeline with `lowestCostFirst`; historical P/L uses the central stock engine for each chronological prefix and the shared valuation helper for historical quotes.
- Shared same-day `accountingOrder` spans trades, transfers, adjustments and dividends. Existing arrows are fixed to map target orders to the store's expected current values, then swap them. The store rejects cross-date moves.
- Legacy same-day rows without saved sequence use actual recorded time before legacy global trade indexes. Explicit saved `accountingOrder` remains authoritative.
- Unmatched SELL shares remain visible and receive no invented cost basis or realized profit; actual proceeds remain in cash and unmatched SELL fees are expensed separately.

The current documentation/comment refresh is behavior-neutral. Verify the live PR head and Actions again before merge; any later application-code change requires a fresh full validation. No browser smoke test or real-backup review is claimed. No merge to `main` has been performed.


## 2026-11-04 — Upcoming application-service migration checkpoint

- **Working branch:** `fix/net-worth-dashboard-parity-and-accounting`; re-fetch the live head before continuing.
- Added `webapp/src/services/finance/upcomingService.ts`. It owns subscriptions to the nine source workbooks, gathers current data, calls `CalculationEngine.upcoming.collectUpcomingItems`, and caches snapshots by source revision, horizon and calendar day.
- Replaced `useUpcomingItems`' direct Zustand/calculator dependencies with a thin `useSyncExternalStore` adapter to the application service.
- Moved due-timing label calculation into the calculation result. `UpcomingList` now renders the supplied `dueLabel`; it no longer derives day differences locally.
- Added `upcomingService.test.ts` to check stable snapshots, store-change invalidation and the service-produced next-day label. Extended `upcoming.test.ts` to assert the engine-provided label.
- Architecture checkpoint recorded in `webapp/docs/CALCULATION_ENGINE_ARCHITECTURE.md`.
- This is a deliberately small first service migration. It does **not** complete the UI-only architecture: `PlanningPage`, `FinancePlansHierarchy`, other pages/components and plan writes still need migration. No auto-pay scheduler, execution history, pending-ledger command or settlement workflow has been implemented yet.
- No local test/build was available through the connected GitHub workflow tools before opening a PR. The next action is to open a draft PR from this branch, inspect the exact-head full-test and build/type-check results, and fix failures before considering merge. Do not merge if any check is pending, missing, failing, or tied to an older head. No direct-main push.


## 2026-11-04 — PR #51 implementation and validation checkpoint

- **Branch:** `fix/net-worth-dashboard-parity-and-accounting`
- **PR:** [#51 — Centralize financial calculations and migrate planning read services](https://github.com/ranamrameez/WealthCrescent/pull/51), currently draft against `main`.
- **Last validated application/documentation head:** `aacb7c60bab1ca4d1df1597e59d388091bcd5621` (80 PR commits, 29 changed files at that point; re-fetch before further work).
- **Base:** `main` `e545273018b08eebd9f95328b766c7cb2764c5af`. No merge or direct-main push has occurred.
- Added the public `CalculationEngine` facade. It delegates to the existing domain calculators and preserves the existing StockExchangeEngine implementation. The `funds` namespace is included; Funds holdings/category valuation and matched SELL cash handling now use `calculateStockPortfolio`, avoiding a parallel position/oversell implementation.
- Added the first service migration: `src/services/finance/upcomingService.ts` owns Upcoming source subscriptions, gathers inputs, calls `CalculationEngine`, and caches stable read-model snapshots. `useUpcomingItems` is now a thin `useSyncExternalStore` adapter. Due labels are calculated outside the renderer.
- Dashboard work includes shared top-bar reporting range navigation, source/section filter behavior, lifetime Recent Transactions, URL-backed date controls and tests. Preset/custom date ends are clamped to today.
- Pending Cash/Bank/Rentals activity remains visible as pending but is excluded from cleared monthly budget actuals. Subscription lead-time reminders fire only on their scheduled calendar day; missed days are not replayed. Test fixtures and assertions were aligned with those semantics.
- Updated `USER_MANUAL.md`, `MODULES_PLAN.md`, `CALCULATION_ENGINE_ARCHITECTURE.md`, root `CLAUDE.md`, and this handoff. The old budget note is superseded: category-based and project-based budgeting are approved as one unified model.
- **CI:** Actions run #421 passed on code head `8e17ce13c4378b362dee435c34f7fff69e4b8664`; Actions run #423 passed on documentation head `3662f3eade965a21069aeae1190b7e33e5127004`; Actions run #424 passed on exact head `aacb7c60bab1ca4d1df1597e59d388091bcd5621`. The successful exact-head run includes broker-profile/PSX-fee regressions, full Vitest suite (144 test files / 1,143 tests), TypeScript checks and production build. The subsequent commits `bed06c91ea469e9d016d1c09dd23e51038e1688e` and `ec7292b5c3e4bbb45ed99072da43a081c528ec31` are documentation-only; check the new workflow run for the resulting current head before any merge decision.
- **Not complete:** app-wide UI/service migration; PlanningPage and FinancePlansHierarchy query/command migration; planned-payment write services; scheduled app-only auto-pay; deterministic occurrence execution history; pending-ledger creation; and explicit settlement workflow. No bank APIs, payment-provider APIs, or external money movement have been added.
- **Manual UI verification remains outstanding.** The UI guidelines require a real rendered-page review; the connected browser surface available in this session is read-only and no branch preview was available. Do not claim visual acceptance. Keep the PR draft and do not merge until the exact current head is green and the required UI review has been completed. A passing automated build/test suite alone does not complete the requested auto-pay feature.


## 2026-11-04 continuation — Planning read/write service slice

Continue PR #51 on fix/net-worth-dashboard-parity-and-accounting; main is untouched. The fetched starting head was 5d5ca1c48e5b68d0faa0039c1ebeb307deef8211 and main was e545273018b08eebd9f95328b766c7cb2764c5af.

Implemented planningService.ts, thin usePlanning adapters, and CalculationEngine.planning. PlanningPage/FinancePlansHierarchy read recurring items, activity, statuses, currency-safe summaries and chart data through that boundary. Shared payment/group/finance-link editors dispatch authenticated service commands; commands retain stale edits, recurrence exclusions, currency acknowledgement, inactive-finance rejection and fulfilled-history protection. Pure plan primitives were extracted from the store-facing financePlans module to keep engine imports pure. Shared date validation moved to lib/dateValidation.ts with a compatibility re-export.

Regression coverage includes separate same-category/module currencies, filters, fulfilled recurrence snapshots, empty group selection, stable service snapshots/store invalidation, command authorization and stale writes; existing shared editor/group behavior tests remain relevant. Restored locked local dependencies with npm ci because the old installation lacked fflate. Vitest needs an unsandboxed run on this Windows machine because sandbox temporary-file renames fail. Build/type-check passed during development; final full-suite/build results will be recorded after completion.

Local interactive review now works through the in-app browser and local Vite server. Checked Planning overview, category/module budget view switching, recurring-plan navigation and opening/cancelling an occurrence editor. Browser error log was empty at that checkpoint. No user financial records were saved or deleted. Other dashboard/mobile/write-flow acceptance is still outstanding.

Next: introduce transaction-safe persistence before scheduled auto-pay. useWorkbookCloudSync currently writes whole workbooks with set(), so simply appending backend-created ledger entries can lose them to a stale client write. Scheduler, occurrence execution history, pending-ledger creation, settlement/void commands and the remaining UI/module service migration are still outstanding. Keep PR #51 draft; do not merge on this slice alone.
