# Current delivery status

Updated 2026-11-06. This is the concise status index; SESSION_HANDOFF.md records exact checkpoint evidence, DELIVERY_CHECKLIST.md retains detailed scope/history, and CALCULATION_ENGINE_ARCHITECTURE.md remains the architecture contract. Historical notes do not override the current status here.

## Delivery and data safety
- Existing branch: fix/net-worth-dashboard-parity-and-accounting; draft PR 51 only. Nothing merged/deployed by this work.
- Published checkpoint: 5a8de6270e0ccbb6717cc2ae81e7071fde5b39de; Actions 442 passed build/tests. Earlier 321b18ac passed 167 files / 1,271 tests in Actions 441.
- Current working continuation aligns all dashboard actual-flow views with the canonical native movement selector. Focused 4 files / 41 tests passed; browser verified matching native totals in Money in/out, Analytics insights and both monthly widgets. Both TypeScript projects and production build passed (canonical-dashboard-build.log). The resulting published head still requires its own CI.
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
| App Data | Visible Remove all app data section; typed phrase + confirmation, confirmed-user checks, acknowledged atomic reset of 18 financial paths and local sync-queue invalidation. UI verified without deleting real data. Login/appearance/shared market data preserved. |

## Remaining work, in dependency order

### 1. Complete reporting and calculation contracts
- Publish/verify the current unified dashboard actual-population slice; check the new exact head in CI.
- Carry explicit EMI/subscription provenance into future actual completion records so classification can use source identity. Preserve unknown historical records.
- Add standalone subscription/EMI schedule adapters with explicit estimate labels and explicit-ID/date deduplication against generated native plans/actuals. Never turn elapsed schedules into cleared payments.
- Add dated investment trade-plan adapters with existing broker fee/order semantics; distinguish sketches, pending orders and settled trades.
- Add prior-period/month comparisons with honest zero/missing baselines, partial-period bounds and supporting records.
- Finish all allocation drilldowns and source inclusion/empty/negative/FX/opening acceptance cases.

### 2. Unified currency-owned budgets
- Add backward-compatible category/project allocation definitions with explicit currency, month/period, limit and rollover policy. Preserve FinancePlanGroup/native plan IDs.
- Keep legacy currency-agnostic BankSettings.budgets unassigned until explicitly scoped; never apply one target in multiple currencies.
- Compute actual/allocated/unallocated, remaining, refunds and rollover through CalculationEngine. One actual must not be counted twice globally when category/project dimensions overlap.
- Add service commands with auth/stale/finite-value/source checks; shared editor, monthly views and detail records. Test negative/refund/zero/currency/boundary cases.

### 3. Finish UI-to-service migration
- Cash, cards, Rentals, EMI, personal loans, Subscriptions, Funds and exchange UI still contain legacy store/calculator access. Migrate reads and commands by verified vertical slice; facade renaming alone is insufficient.
- Complete embedded Planning editors/batch actions, source regeneration/relink/delete paths, common entity/record/category/position/advice widgets and import/export commands.
- Preserve FIFO versus advisory lots, broker/currency isolation, fee treatment, unmatched SELL guards, active filters and Android/WebView/auth behavior.

### 4. Safe payment persistence and pending-only automation
- Replace whole-workbook concurrent overwrite assumptions with tested RTDB repository transactions/merge-conflict handling, including current client sync. A local rollback is not a distributed transaction.
- Add deterministic occurrence identity, atomic native pending record + linkage + execution history, replay/retry/concurrent-edit protection and user isolation.
- Add opt-in eligible outflow policies and backend scheduled execution. Skip fulfilled/cancelled/archived/deleted/inactive/excluded sources and income. Never move real money.
- Add explicit settlement, partial settlement, void and reconciliation. Pending never silently becomes cleared.
- Verify duplicates, interrupted retries, simultaneous clients, auth changes, month-end/leap boundaries and cancellation before enabling the scheduler.

### 5. App-wide UX acceptance
- Audit every module aggregate/detail page against PAGE_TEMPLATE_GUIDE: shared scoped controls, summaries/plans/history/analytics/ledger, modify/batch/import/export parity and currency-safe all-entity totals.
- Finish global finder Cash/exchange/broker/position coverage and shared-filter preservation. Check independent favorites, keyboard, disabled/no-result and popup placement.
- Audit every chart consumer for shared renderer use, full-plot hover/guideline, units/denominators/date labels, truthful scales/negative/zero/missing cases, table equivalents, mobile sizing and reduced motion.
- Review all nine themes in light/dark and the three existing densities, mobile topbar/sidebar overlap, focus/escape/backdrop, heading gaps, table/form readability and section-only collapse.

### 6. Final delivery gates
- Run focused regressions for each change, full suite, both TypeScript projects and production build; inspect the complete diff and preserve all user changes.
- Browser-check desktop/mobile with fixtures and representative existing records read-only; do not use real financial writes as UI tests.
- Push focused commits to existing branch, verify CI on exact current head, update draft PR metadata and these docs. Keep draft until all acceptance work is actually complete.
