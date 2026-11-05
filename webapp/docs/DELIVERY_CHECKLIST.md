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

The legacy tab now uses the existing account query for ledger, cleared/pending populations, plans, opening and closing balances. Eighteen focused engine/navigation tests pass. Remaining: aggregate scope still selects a first account, and legacy budget ownership/commands require migration. Build validation is in bank-analytics-boundary-build.log.
