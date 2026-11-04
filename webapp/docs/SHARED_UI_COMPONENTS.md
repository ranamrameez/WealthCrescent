# Shared UI components — current continuation contract

Status: implemented and locally regression/build tested. Final interactive browser acceptance is pending. Financial correctness remains the active priority; these changes preserve the earlier user requests.

## Charts

AppCharts.tsx is the only production adapter importing react-chartjs-2. AppLine, AppBar, AppDoughnut and AppChart share appChartStyle, chartInteraction, reduced-motion and chart-theme helpers. StockCharts decorates labels and delegates to these wrappers. Existing feature datasets, currency units, tooltip callbacks and filters remain authoritative.

Cartesian charts use index / axis-x / intersect-false interaction (axis-y for horizontal bars). The pointer guideline follows the mouse within the plot; tooltips choose the nearest category without requiring a point hit. Radial charts use radial interaction. Sparkline retains its lightweight SVG implementation and shared pointer-guide behavior. Do not add another raw renderer/style/hover system.

## StandardDropdown

The controlled component at components/ui/StandardDropdown.tsx accepts label, value, sections, onChange, optional onFavoriteToggle and isTypeable. A section has a title and items. Each item has value, label, optional left icon, isFavorite, disabled and search keywords. Favorite actions do not select or dismiss the item. The popup is a portalled accessible grid with separate selection/favorite buttons; arrow/Enter/Escape and favorite keyboard interaction are supported.

SearchableEntitySwitch adapts existing group/item selectors. QuickEntitySwitch preserves simple native selects and delegates rich/typeable selections to that shared adapter. QSE/PSX Market Prices uses the standard ticker dropdown with logos and native favorites. Avoid nested interactive controls inside native option roles.

## Cross-module navigation

AppEntityFinder uses navigationService for Funds, fund brokers, banks, accounts, cards, EMI, personal loans, properties and subscriptions. Native favorites remain source-owned and authenticated. URL-backed selection preserves reporting parameters and clears mutually exclusive fund/broker selection. Cash currency and exchange stock finders remain separate existing controls; global finder coverage is not claimed complete for those types.

## Topbar and reporting controls

The mobile menu button is the first TopBar item and controls the sidebar drawer. Escape, backdrop and route changes close the drawer. DateRangeWidget keeps month navigation together. QSE/PSX Analytics now uses URL-backed period/from/to/entity scope and the shared topbar Filters modal.

## Themes

All nine palettes also set scoped visual tokens for surfaces, corners, elevation, dropdown/navigation shapes and chart treatment. Theme helpers clamp numeric chart tokens; explicit dataset styling still wins. Preserve existing fonts/density preferences, light/dark modes, reduced motion and theme isolation.

## Verification and pending review

Final local full suite: 158 files / 1,210 tests. Production build and both TypeScript projects passed. Relevant focused tests cover dropdown keyboard/favorite behavior, finder routes, mobile drawer, reporting controls and chart interaction options/plugin behavior. Browser review still needs cursor/tooltip behavior on representative charts, narrow mobile topbar, light/dark theme variants and cross-module finder navigation. No private financial records were edited during earlier browser checks. See SESSION_HANDOFF.md for the exact application commit and current delivery state.
