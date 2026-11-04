# CalculationEngine correctness audit — 2026-11-04

Financial correctness takes priority over the shared-chart, navigation and theme work. The architecture migration remains in progress; a namespace facade alone is not completion.

## Corrected calculation paths

- Current and historical net worth use CalculationEngine.valuation.calculateNetWorth. The engine takes an explicit calendar date, native ledger snapshot, quote inputs and module scope. Net-worth query hooks subscribe to the application service, which owns store/feed access and snapshot caching.
- Historical QSE/PSX valuations include recorded dividends, even when dividends are the only dated activity. Future dividends and other future ledger events are excluded at the cutoff. Valuation delegates to the existing portfolio/stock engines and preserves cost-basis settings.
- Personal-loan receivables and debts remain gross when reporting assets and liabilities. Example: 500 lent, 100 received back, 300 borrowed, and a pending 200 repayment produce assets 400, liabilities 300, net 100. The breakdown exposes both sides and reconciles to net.
- Pending BUY limit prices cannot become fallback market prices for executed holdings. The fallback uses executed BUYs and the shared stock accounting chronology. Non-finite quotes cannot value a holding.
- Historical quote lookup sorts by calendar date, then time, without mutating the price history.
- A pending bank transaction cannot establish evidence for an undated opening balance. Historical bank/card openings require dated ledger evidence; live openings remain included. Period comparisons are withheld where opening evidence is missing, instead of interpreting an unknown opening as growth.
- Zero, negative and non-finite FX rates cannot enter converted totals. A period change is withheld when either endpoint lacks conversion coverage. Zero contributions do not require a rate.
- Dashboard headlines, actual-flow totals, itemized flow selection, planned totals and reporting-range resolution live in CalculationEngine.dashboard. Actual totals and detail rows share the same cleared population; planned values remain separate.
- Monthly recurrence clamps short months and preserves the original billing day: Jan 31 -> Feb 28 -> Mar 31. Yearly Feb 29 rules recover Feb 29 in leap years. Calendar stepping is UTC; exclusions and end dates retain their meaning. Old daily rules jump to the requested window instead of silently exceeding the historical 10,000-step cap.

## Preserved boundaries

- Native ledgers remain actuals; plans never become settled money merely because they are due.
- Funds cash and held NAV value are counted once, with separate native currencies and the existing inclusion controls.
- Stock accounting, broker ownership, unmatched-SELL reconciliation and advisory lot views remain delegated to the existing engines. This audit does not merge broker ledgers.
- An archived entity still counts unless explicitly excluded from net worth.
- Existing data and fulfilled occurrence snapshots are not rewritten by the recurrence correction. Unfulfilled forecasts now use the corrected calendar dates.

## Remaining architecture work

- NetWorthPage and NetWorthRecentTransactions now obtain financial models and writes through services. The wider app still needs the same migration; do not claim app-wide render-only completion.
- Cash, Bank, Cards, Funds, EMI, Personal Loans, Rentals, Subscriptions and exchange feature consumers still require application query/command migration. Existing pure calculators remain authoritative implementation details during that work.
- Category/project allocation and payment lifecycle capabilities must be completed against the approved architecture; no duplicate budgeting system or guessed settlement semantics should be introduced.
- Transaction-safe multi-workbook persistence remains a prerequisite for app-only auto-pay. No scheduler is enabled against the existing whole-workbook set() sync.
- Financial fixture regressions do not constitute reconciliation of every private user ledger with external statements. Historical openings without evidence remain explicitly unknown.

## Verification

See SESSION_HANDOFF.md for exact completed test/build results. Focused valuation/service/FX tests and month-end recurrence regressions were run during implementation; the final full-suite/build result must be recorded only after completion. Keep PR #51 draft until its acceptance requirements are met.

## 2026-11-05 continuation

- Fixed pending activity in Insights and monthly/category drilldowns so the detail population reconciles with displayed totals.
- Corrected historical capital split to use period-end values while retaining live current headlines.
- Explicit recurrence windows cover 90/365-day forecasts and future Planning filters; forecasts stop at their displayed exact end date, including same-month horizons and due-today plans. New planned currencies remain represented. Future-start loans do not create today's amortization offset.
- Native dashboard sources, inclusion controls/commands and local FX persistence now cross an application-service boundary. Native card inclusion is exposed alongside legacy banking controls.
- Most recent focused checkpoint: 8 files / 61 tests passed. Production build and both TypeScript checks passed. A full suite is running separately; SESSION_HANDOFF.md records its log and must be updated with its completed result.

### Historical finding — Recent Transactions (now fixed in the checkpoint below)

The renderer calculates Funds and QSE/PSX withdrawal amounts as -(gross - fee), while the native cash ledger records -(gross + fee). Its migration to a pure read model/service is the next financial slice; include native-ledger fee reconciliation and retained archived broker history tests. This is explicitly pending, not part of the validated corrections above.

### Completed full-suite checkpoint — 2026-11-05

The isolated final run passed **156 test files / 1,205 tests** in 503.53 seconds (engine-verified-full-suite.log). The production build and both TypeScript projects also passed (engine-dashboard-final-build.log). This validates the working-tree checkpoint before the next Recent Transactions migration; it does not claim all architecture work or that pending child-view defect is complete.

## Completed Recent Activity checkpoint — 2026-11-05

Recent Activity now uses a pure CalculationEngine read model and service snapshot. Transfer fees share the native cash-ledger function; archived/deactivated brokers remain in lifetime history; active data/currency takes precedence over stale profile snapshots; migrated card records are not repeated; EMI paid amounts include fines. The list labels trade values before fees and warns against summing linked source records as cash flow.

Final full suite passed **158 files / 1,210 tests** (recent-engine-full-suite.log). Production build and both TypeScript projects passed (recent-engine-build.log). Source is saved in focused local commits through ede55d7b; Git transport publication is failing, and remote CI/browser acceptance is not claimed.
