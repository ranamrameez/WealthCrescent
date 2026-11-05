# CalculationEngine migration inventory — 2026-11-05

This is a static migration snapshot, not a claim that any listed calculation is wrong. It scans feature pages/components and shared UI hooks/components, excludes tests and explicit type-only imports, and excludes presentation-preference stores. Application bootstrap and infrastructure are outside this scan.

A runtime CalculationEngine facade import is counted too: UI should call a service rather than the engine directly. Inline financial arithmetic and helpers outside lib/calc are not captured. Zero imports therefore does not prove a component is render-only.

| Area | Files importing runtime calculators | Files importing financial stores |
|---|---:|---:|
| account | 0 | 1 |
| appData | 0 | 1 |
| bank | 2 | 2 |
| cash | 1 | 1 |
| emi | 1 | 1 |
| funds | 3 | 3 |
| netWorth | 0 | 0 |
| personalLoans | 1 | 1 |
| planning | 0 | 0 |
| psx | 13 | 17 |
| qse | 13 | 17 |
| rentals | 1 | 2 |
| shared components | 12 | 16 |
| stocks | 0 | 1 |
| subscriptions | 1 | 1 |
| transfers | 1 | 1 |

## Files still requiring review

- src/components/CategorySelect.tsx: financial stores.
- src/components/CreditCardPositionSummary.tsx: runtime calculators; financial stores.
- src/components/FinanceBatchEditors.tsx: financial stores.
- src/components/InvestmentPlans.tsx: runtime calculators; financial stores.
- src/components/InvestmentRecordEditor.tsx: financial stores.
- src/components/InvestmentTransactionEditor.tsx: financial stores.
- src/components/OrphanPlanCleanup.tsx: financial stores.
- src/components/PartialTradeAdviceTable.tsx: runtime calculators.
- src/components/PartialTradeAlertsPopup.tsx: runtime calculators; financial stores.
- src/components/PlanExecutionSummary.tsx: runtime calculators.
- src/components/PlanningPositionSummary.tsx: financial stores.
- src/components/ProfitableLotAlerts.tsx: runtime calculators.
- src/components/PSXTickerDatalist.tsx: financial stores.
- src/components/RecordRow.tsx: financial stores.
- src/components/RiskCalculator.tsx: runtime calculators.
- src/components/Sidebar.tsx: financial stores.
- src/components/StockPLCharts.tsx: runtime calculators.
- src/components/StockTradingChart.tsx: runtime calculators.
- src/components/SubscriptionAlertsPopup.tsx: runtime calculators; financial stores.
- src/components/TickerDatalist.tsx: financial stores.
- src/components/TopBar.tsx: financial stores.
- src/components/TransactionEntryModal.tsx: runtime calculators; financial stores.
- src/components/ui/PlanningHorizonField.tsx: runtime calculators.
- src/features/account/pages/AccountPage.tsx: financial stores.
- src/features/appData/pages/AppDataPage.tsx: financial stores.
- src/features/bank/pages/BankPage.tsx: runtime calculators; financial stores.
- src/features/bank/pages/CreditCardsSection.tsx: runtime calculators; financial stores.
- src/features/cash/pages/CashPage.tsx: runtime calculators; financial stores.
- src/features/emi/pages/EMIPage.tsx: runtime calculators; financial stores.
- src/features/funds/components/FundsScope.tsx: runtime calculators; financial stores.
- src/features/funds/hooks/useFundsDerived.ts: runtime calculators; financial stores.
- src/features/funds/pages/FundsPage.tsx: runtime calculators; financial stores.
- src/features/personalLoans/pages/PersonalLoansPage.tsx: runtime calculators; financial stores.
- src/features/psx/components/AlertsBox.tsx: financial stores.
- src/features/psx/components/DividendsSection.tsx: financial stores.
- src/features/psx/components/MarketPriceHistory.tsx: runtime calculators; financial stores.
- src/features/psx/components/PositionDetail.tsx: runtime calculators; financial stores.
- src/features/psx/components/PSXReorder.tsx: financial stores.
- src/features/psx/components/TradeCalculator.tsx: runtime calculators; financial stores.
- src/features/psx/hooks/useChartData.ts: runtime calculators.
- src/features/psx/hooks/useLivePsxWorkbook.ts: financial stores.
- src/features/psx/hooks/usePSXDerived.ts: runtime calculators; financial stores.
- src/features/psx/hooks/usePSXStrategicDerived.ts: runtime calculators; financial stores.
- src/features/psx/pages/AnalyticsPage.tsx: runtime calculators.
- src/features/psx/pages/DashboardPage.tsx: runtime calculators; financial stores.
- src/features/psx/pages/MarketPricesPage.tsx: financial stores.
- src/features/psx/pages/PortfolioPage.tsx: runtime calculators; financial stores.
- src/features/psx/pages/SettingsPage.tsx: financial stores.
- src/features/psx/pages/StockPage.tsx: runtime calculators; financial stores.
- src/features/psx/pages/TradeStrategyPage.tsx: runtime calculators; financial stores.
- src/features/psx/pages/TransactionsPage.tsx: runtime calculators; financial stores.
- src/features/psx/pages/WatchlistPage.tsx: runtime calculators; financial stores.
- src/features/qse/components/AlertsBox.tsx: financial stores.
- src/features/qse/components/DividendsSection.tsx: financial stores.
- src/features/qse/components/MarketPriceHistory.tsx: runtime calculators; financial stores.
- src/features/qse/components/PositionDetail.tsx: runtime calculators; financial stores.
- src/features/qse/components/QseTableActions.tsx: financial stores.
- src/features/qse/components/TradeCalculator.tsx: runtime calculators; financial stores.
- src/features/qse/hooks/useChartData.ts: runtime calculators.
- src/features/qse/hooks/useLiveQseWorkbook.ts: financial stores.
- src/features/qse/hooks/useMarketPageData.ts: financial stores.
- src/features/qse/hooks/useQSEDerived.ts: runtime calculators; financial stores.
- src/features/qse/hooks/useQSEStrategicDerived.ts: runtime calculators.
- src/features/qse/pages/AnalyticsPage.tsx: runtime calculators.
- src/features/qse/pages/DashboardPage.tsx: runtime calculators; financial stores.
- src/features/qse/pages/MarketPricesPage.tsx: financial stores.
- src/features/qse/pages/PortfolioPage.tsx: runtime calculators; financial stores.
- src/features/qse/pages/SettingsPage.tsx: financial stores.
- src/features/qse/pages/StockPage.tsx: runtime calculators; financial stores.
- src/features/qse/pages/TradeStrategyPage.tsx: runtime calculators; financial stores.
- src/features/qse/pages/TransactionsPage.tsx: runtime calculators; financial stores.
- src/features/qse/pages/WatchlistPage.tsx: runtime calculators; financial stores.
- src/features/rentals/pages/RentalPlanEditor.tsx: financial stores.
- src/features/rentals/pages/RentalsPage.tsx: runtime calculators; financial stores.
- src/features/stocks/pages/BrokersPage.tsx: financial stores.
- src/features/subscriptions/pages/SubscriptionsPage.tsx: runtime calculators; financial stores.
- src/features/transfers/pages/TransferLinksPage.tsx: runtime calculators; financial stores.

## Immediate priorities

Complete and validate the active Banking read slice recorded in SESSION_HANDOFF.md. Its remaining editors/commands and legacy AnalyticsTab are not covered by the read migration. Legacy BankSettings.budgets has no stored currency ownership; migrate those targets losslessly through the approved unified category/project budget model, without guessing their currency. Continue the remaining module service migrations while preserving the tested stock accounting and native ledger ownership. Auto-pay still requires transaction-safe persistence.
