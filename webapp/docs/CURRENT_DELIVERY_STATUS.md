# Current delivery status

Actions 448 passed on 4f367f8a, the published reviewed workbook-import checkpoint. Import apply now also verifies the preview was reviewed under the current account. Guarded archive restore is available from the installment ledger. The integration test covers account-scoped review, typed confirmation, focus restoration and archiving the displaced ledger. Desktop and mobile browser acceptance are pending because the local browser environment could not reach the fixture.

Latest evidence: independent source 730733fd passed Actions 447 (176 files / 1,334 tests and build). The reviewed workbook-import continuation passed 7 focused files / 27 tests and final TypeScript/production build. Read-only browser verified actual workbook totals and date diagnostics, then cancelled. Imports preserve archived originals and reject stale/link/budget/fine conflicts. Archive browser acceptance and the broader remaining backlog are still open.

2026-11-07 priority clarification: irregular EMI needs independent contract events, dated payments and many-to-many allocations; current month-keyed repayment editing is insufficient. See EMI_IRREGULAR_PAYMENTS.md for the reference report, migration plan and a spreadsheet-versus-backup conflict. Earlier reported remaining is backup-based, not reconciled to the newly supplied spreadsheet.

Current continuation implements the independent contract/payment path: optional persisted obligations and explicit allocation splits, actual-only fixed-total debt, partial/late/advance receipts, monthly/event reports, shared charts and accessible tables, linked Bank/Cash completion with one economic movement, open remainder plans and default bank routing. 10 focused files / 93 tests passed; both TypeScript projects and the final checkpoint production build passed. Resulting-head full CI remains required. Read-only browser opened/cancelled contract review; no real loan was adopted or receipt changed. Reviewed workbook migration, archive recovery and planned card-funded charge linkage are implemented. Unlinked independent receipts support dated partial/full reversals. Coordinated funding-ledger reversals, lender-specific interest policies, allocation recovery and remaining UI/export/period parity are open. Host Vite dev server was restarted on port 5173 for browser testing.

Updated 2026-11-07. This is the concise status index; SESSION_HANDOFF.md records exact checkpoint evidence, DELIVERY_CHECKLIST.md retains detailed scope/history, and CALCULATION_ENGINE_ARCHITECTURE.md remains the architecture contract. Historical notes do not override the current status here.

## Delivery and data safety
- Published EMI repair: cde1280cf917975afe9c9c69c87e6a8538c592dd; Actions 446 passed 173 files / 1,322 tests, broker regressions, both TypeScript projects and production build. Recorded-versus-estimated balances, save-time linked-plan refresh, booking/first-installment dates, advance/price basis, month intervals and schedule-only bigger installments are implemented. See EMI_INSTALLMENT_MODEL.md. Focused acceptance: 10 files / 139 tests passed; 6 service tests passed again after fixture type corrections. Final local rerun exhausted Windows/Node memory; exact-source CI supplied the final full validation. Existing inconsistent/future-dated private records are preserved for review. No actual loan/payment was changed in browser.
- Source provenance/lifecycle continuation: explicit EMI/subscription provenance survives manual fulfillment; cancelled source series retain fulfilled history and suppress unresolved occurrences. Six files / 50 tests and both TypeScript projects/production build passed before the EMI slice.
- Existing branch: fix/net-worth-dashboard-parity-and-accounting; draft PR 51 only. Nothing merged/deployed by this work.
- Published checkpoint: 7ac9cf8b054931a86191afc40c85fd4a269ec2be passed Actions 445. Previous 128d1391639ee46c6a7b807275b4332726d3a03b / Actions 444 passed 170 files / 1,297 tests and build. Earlier 321b18ac passed 167 files / 1,271 tests in Actions 441.
- Collection-aware movement/allocation identity and explicit link matching shipped in 7ac9cf8b and passed Actions 445. EMI source cde1280c passed all Actions 446 checks. The following documentation-only checkpoint does not change application source; retain draft status for the wider remaining scope.
- No private backup imported, no real user ledger created/settled/deleted, no private proof screenshots uploaded. The only committed sample images are the user's approved stock UI references in docs/ui-samples.

## Completed implementation
| Area | Behavior and evidence boundary |
| --- | --- |
| Calculation authority | CalculationEngine facade exposes deterministic domains; new dashboard, Banking, Planning, movement and manual fulfillment slices use services. This is not yet an all-app migration. |
| Funds correctness | Missing legacy cash-inclusion setting means holdings-only; explicit settings remain authoritative. No invented deposits. Native PKR holdings reconciled read-only against supplied backup. |
| Broker correctness | Every included broker valued independently using its own accounting settings/currency; active arrays beat stale snapshots; archived history retained. |
| Reporting | Exact calendar/custom dates; currency separation; current/historical net-worth valuation, missing FX/opening warnings; month widgets and local charts. Canonical actual movement adapters cover Cash, Bank, Rentals, cards, recorded personal-loan/EMI repayments, Funds and all QSE/PSX brokers. |
| Movement classification | Explicit rental/loan links count domain event once. Internal transfers/card repayments excluded from combined totals and viewable separately. Purchases/sales are investment movements; repayments financing; explicit fees/dividends separate. Unclassified account movement stays visible. No fabricated contract receipts, schedule settlements or principal/interest allocations. |
| Breakdowns | Actual/pending/planned populations; category/module/account-source/plan-group/movement-kind dimensions; matching chart/table and contributing-record detail. |
| Calendar plans | Exact 1/3/6/12 calendar-month windows and recurrence expansion; source-native cash/bank/rental/card/personal-loan plans. Only actual records become actuals. Standalone schedules and investment trade-plan sketches require remaining adapters/clear estimate labels. |
| Manual plan completion | Cash/Bank/cards and Rentals use authenticated services, deterministic occurrence/provenance checks, reviewed-source validation, local rollback and existing explicit Mark as done semantics. New native actuals preserve plan/group links. Existing unlinked history stays unallocated. This is not backend automation or atomic cloud execution. |
| Shared UI | Existing Comfortable/Compact/Console repaired; no new mode. Main/support/extra figure hierarchy, semantic icons/arrows, dashboard outer-section collapse only, dismissible Notice, mobile menu inside topbar, shared date/filter controls, sectioned/typeable shared dropdown and entity finder. Full app acceptance remains open. |
| Themes/charts | Nine theme profiles retained; shared Chart.js registration/renderers/style/interaction helpers, soft visuals and nearest-position hover/guideline behavior implemented. Complete app audit remains open. |
| Categories | General defaults plus preserved custom/legacy identities; authenticated category creation service. No automatic semantic remapping of historical records. |
| App Data | Visible Remove all app data section; typed phrase + confirmation, confirmed-user checks, acknowledged atomic reset of 18 financial paths and pending-payment execution history and local sync-queue invalidation. UI verified without deleting real data. Login/appearance/shared market data preserved. |

## Remaining work, in dependency order

Use the [delivery task register](MULTI_AGENT_WORKFLOW.md) to coordinate ownership across agents and sessions.

### 1. Complete reporting and calculation contracts
- Publish/verify the current unified dashboard actual-population slice; check the new exact head in CI.
- Carry explicit EMI/subscription provenance into future actual completion records so classification can use source identity. Preserve unknown historical records.
- Upcoming labels standalone renewal and legacy EMI estimates. Money in/out includes uncovered subscription renewals as planned estimates using the same funding checks. Active same-day funding plans offset the matching reviewed installment by obligation ID and currency. Partial funding leaves a visible remainder and conflicting plans leave the contract obligation visible. The canonical movement-report adapters for other standalone schedules remain open.
- Dated QSE and PSX trade estimates are shown by broker and strategy in Money in/out. Strategy dates remain as entered and fee overrides carry into executed trades. Saved scenarios remain separate from cleared and pending transactions.
- The cleared movement report compares the selected period with an immediately preceding equal-length period and provides both sets of records. A previous-calendar-month preset compares completed months in full and aligns month-to-date cutoffs where possible.
- Independent installment funding remains visible when a linked receipt is absent. When both records are available, the receipt represents the movement once.
- Finish all allocation drilldowns and source inclusion/empty/negative/FX/opening acceptance cases.

### 2. Unified currency-owned budgets
Implemented core/service/Planning UI now includes optional definitions/allocations, monthly overrides, explicit refunds, partial/unallocated conservation, ambiguous scopes and three rollover policies. Monthly budget balances and allocation details export to CSV. Reviewed CSV import can add budget definitions in one batch. The shared batch editor updates monthly limit overrides for the displayed period. The definition batch editor updates names, default limits and rollover while preserving existing monthly overrides, scopes and allocations. The engine leaves ambiguous legacy identities unallocated. Monthly budget balances show pending and planned outflow reservations, their contributing records, and the amount available after reservations. Analytical, theme and mobile acceptance remains open. The original detailed requirements below remain the full acceptance checklist, not a claim they are all done.
- Add backward-compatible category/project allocation definitions with explicit currency, month/period, limit and rollover policy. Preserve FinancePlanGroup/native plan IDs.
- Keep legacy currency-agnostic BankSettings.budgets unassigned until explicitly scoped; never apply one target in multiple currencies.
- Compute actual/allocated/unallocated, remaining, refunds and rollover through CalculationEngine. One actual must not be counted twice globally when category/project dimensions overlap.
- Add service commands with auth/stale/finite-value/source checks; shared editor, monthly views and detail records. Test negative/refund/zero/currency/boundary cases.

### 3. Finish UI-to-service migration
- Cash, cards, Rentals, EMI, personal loans, Subscriptions, Funds and exchange UI still contain legacy store/calculator access. Migrate reads and commands by verified vertical slice; facade renaming alone is insufficient.
- Complete embedded Planning editors/batch actions, source regeneration/relink/delete paths, common entity/record/category/position/advice widgets and import/export commands.
- Preserve FIFO versus advisory lots, broker/currency isolation, fee treatment, unmatched SELL guards, active filters and Android/WebView/auth behavior.

### 4. Safe payment persistence and pending-only automation
- Explicit uploads and routine per-workbook sync use RTDB transactions. Competing changes stop sync and preserve the local workbook for export. Atomic multi-workbook payment persistence and conflict recovery remain open.
- Generic transfer edits and deletes protect independent installment receipts and their Cash, Bank or card funding records. Coordinated reversals remain open.
- The draft Cash and Bank persistence command uses deterministic occurrence IDs and one account-scoped transaction for the pending native record, plan link and execution history. Fixture tests cover replay, retry, stale or cancelled plans and auth changes. The command is isolated from UI and scheduling. Verify account-root rules and RTDB emulator behavior, then integrate settlement, backup before activation. Money in/out keeps matched Cash and Bank occurrences in Pending. Planned movement and Upcoming omit those occurrences while later recurrence dates remain visible.
- Add opt-in eligible outflow policies and backend scheduled execution. Skip fulfilled/cancelled/archived/deleted/inactive/excluded sources and income. Never move real money.
- Draft full settlement updates the native Cash or Bank entry, matching plan occurrence and execution history together. Draft void removes the pending entry and retains its execution history. UI integration, partial settlement and reconciliation are open. Pending stays pending until explicitly settled.
- Verify duplicates, interrupted retries, simultaneous clients, auth changes, month-end/leap boundaries and cancellation before enabling the scheduler.

### 5. App-wide UX acceptance
- Add app-wide keyword search to the shared topbar and a dedicated results page. Search transactions and other native records across modules by their available fields, including titles, descriptions, notes, references and symbols. Let users narrow the same query to one or more modules and submodules, such as a bank account or broker when applicable. Show each result’s module and record context and link it to the relevant native view. Keep search scoped to the signed-in account’s authorized data, reuse shared controls, and verify keyboard, mobile, empty-result and account-switch behavior. Track implementation slices in the task register.
- Audit every module aggregate/detail page against PAGE_TEMPLATE_GUIDE: shared scoped controls, summaries/plans/history/analytics/ledger, modify/batch/import/export parity and currency-safe all-entity totals.
- Finish global finder Cash/exchange/broker/position coverage and shared-filter preservation. Check independent favorites, keyboard, disabled/no-result and popup placement.
- Audit every chart consumer for shared renderer use, full-plot hover/guideline, units/denominators/date labels, truthful scales/negative/zero/missing cases, table equivalents, mobile sizing and reduced motion.
- Review all nine themes in light/dark and the three existing densities, mobile topbar/sidebar overlap, focus/escape/backdrop, heading gaps, table/form readability and section-only collapse.

### 6. Final delivery gates
- Run focused regressions for each change, full suite, both TypeScript projects and production build; inspect the complete diff and preserve all user changes.
- Browser-check desktop/mobile with fixtures and representative existing records read-only; do not use real financial writes as UI tests.
- Push focused commits to existing branch, verify CI on exact current head, update draft PR metadata and these docs. Keep draft until all acceptance work is actually complete.
