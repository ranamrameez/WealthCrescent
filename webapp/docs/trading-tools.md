# Trade Journal and PSX Profiler

## Open the tools

| Wealth Crescent | Original app | Source |
|---|---|---|
| [QSE Trade Journal](https://ranamrameez.github.io/WealthCrescent/#/trade-journal) | [Trade Journal](https://ranamrameez.github.io/Translation-Helper/Trade%20Journal.html) | [Trade Journal HTML](https://github.com/ranamrameez/Translation-Helper/blob/12c5ddc1feaede76d440343c62d079e44d46556b/Trade%20Journal.html) |
| [PSX Trade Journal](https://ranamrameez.github.io/WealthCrescent/#/psx/trade-journal) | [Trade Journal](https://ranamrameez.github.io/Translation-Helper/Trade%20Journal.html#psx-import) | [AHL matching and weighted-average calculation](https://github.com/ranamrameez/Translation-Helper/blob/12c5ddc1feaede76d440343c62d079e44d46556b/ahl-journal.js) |
| [PSX Profiler](https://ranamrameez.github.io/WealthCrescent/#/psx/profiler) | [PSX Profiler](https://ranamrameez.github.io/Translation-Helper/psx-command-deck.html) | [PSX Profiler HTML](https://github.com/ranamrameez/Translation-Helper/blob/12c5ddc1feaede76d440343c62d079e44d46556b/psx-command-deck.html) |

The original PSX Profiler still uses `psx-command-deck.html` in its URL. Each Journal route reads executed trades, fees and realized results from its exchange’s active broker workbook. [Translation Helper repository](https://github.com/ranamrameez/Translation-Helper)

## Import AHL records

1. Select your Al Habib broker in PSX and open the [PSX Dashboard](https://ranamrameez.github.io/WealthCrescent/#/psx) or [Trade Transactions](https://ranamrameez.github.io/WealthCrescent/#/psx/transactions).
2. Use **Import AHL order history** for executed fills. Choose the saved HTML page, HTML in a text file, CSV, or XLSX. Review the execution date, clearing date, side, quantity, and gross price. Existing fills are skipped. Other same-day fills for the same ticker and side need explicit selection. Identical fills in one export are counted separately.
3. Select and import the fills. Wealth Crescent uses execution dates and the selected broker’s fee settings. Clearing dates are available in the preview. If a historical sale needs opening shares, import the relevant earlier buys and review the sale again. Same-day fills without times follow the order of the export.
4. Use **Import AHL account statement (cash)** to review deposits and withdrawals in the same broker profile. Choose which records to add or reconcile. **Sync bank transfers** remains available in the Cash transfers section.
5. Use **Export legacy Journal data** from the PSX Journal route for the broker’s ledger, including settlements, charges, cash balance and reconciliation with order history. Add the account statement and order history in their separate boxes. Use **Statement date** or **Trade date** to switch the reporting basis. The journal’s replacement imports and backup restores operate on its separate dataset.

The reviewed QSE importer remains available from **Import QSE statement** on the [QSE Dashboard](https://ranamrameez.github.io/WealthCrescent/#/qse). [The Group import guide](the-group-import.md)

## Trade Journal features

| Area | Features |
|---|---|
| QSE / The Group | Statement upload or drag-and-drop, transactions and rewards, account history, fees, official-close inputs, before-and-after trading comparison, equal-allocation comparison, and open positions. |
| PSX / Al Habib | Separate account-statement and order-history replacements, pasted tables or CSV, file upload, coverage and import history, statement-versus-execution date choice, and estimated ledger from order history where applicable. |
| AHL dashboard | Weighted-average net realized P&L, fees, cash balance and running-balance warnings, positions, ticker totals, and order-to-ledger quantity discrepancy review. Same-day Difference rows contribute to realized settlement P&L. Gross realized P&L is withheld where fill-level fees cannot be allocated. Quantity and running-balance checks are partial reconciliation. |
| Calculators and prices | Independent QSE and PSX buy, weighted-average cost and break-even calculators with editable broker fees and reset. Editable current prices, price history, QSE market-table paste, same-day and later-day exit prices and round-trip costs. |
| Reports | Daily and ticker P&L, realized and unrealized trends, comparison with holding, net-worth series, summary cards, stock and position tables, interactive zoom and per-ticker charts. |
| Exports | CSV for daily results, ticker P&L, trades or settlement lines, AHL order history, open positions and prices. Full version-1 JSON backup and restore. |

The legacy Journal starts with the source sample data and labels it as a placeholder. Your data stays in the current browser. To move from the original app or another device, export a JSON backup there and restore it in Wealth Crescent’s Journal. A new upload replaces that Journal dataset and preserves saved prices. The native Wealth Crescent importers have their own review and save flow. [AHL Journal accounting notes](https://github.com/ranamrameez/Translation-Helper/blob/12c5ddc1feaede76d440343c62d079e44d46556b/AHL-REFACTOR.md)

## PSX Profiler features

| Area | Features |
|---|---|
| Fee guide | Al Habib greater-of commission floor, one charged leg intraday and two multi-day, estimated ancillary charge ranges, and break-even moves and sell prices rounded to one paisa. Fixed range bands cover PKR 0.01–1,500. Each band has a slider, exact price input, visible tick marks and expandable labels that jump to breakpoints. |
| Watchlist | November 2026 snapshot. Group by health tier, trading approach or price tier. Filter the Green, Watch, Grey, Caution or Red zones. Open a stock for its 52-week position, Shariah and held labels, buy/sell ranges, intraday and multi-day break-even, dividend cycle, debt risk and trading notes. |
| Total returns | PKR 100,000 comparisons with share value and gross dividends shown separately, period switch, total amount and percentage gain. |
| Trader profile | Master profile modal, clipboard copy and selectable-text fallback, trading rules, health scale, positions, and dividend/research notes. OGDC and LOTCHEM dividend tracking and reminders are written profile notes in the source snapshot. |

The Profiler snapshot is separate from live prices and portfolio holdings. Fee figures are planning estimates. [Al Habib brokerage schedule](https://ahcml.com/assets/uploads/Normal_AOF.pdf)

## Implementation notes

The source snapshot is pinned to [Translation Helper commit 12c5ddc](https://github.com/ranamrameez/Translation-Helper/commit/12c5ddc1feaede76d440343c62d079e44d46556b). The explicit legacy Journal export routes render the adapted Journal inside a standard card. The default QSE and PSX Journal routes and PSX Profiler render native pages. The browser sandbox grants scripts and downloads and isolates the tools from the parent origin. The Journal only receives its own allowlisted storage keys, the appearance colors and the bundled SheetJS asset. Browser storage errors display a backup prompt. The bundled spreadsheet reader supports legacy XLS alongside the source app's other file formats. Native AHL order and cash import use Wealth Crescent’s existing table readers and broker workbook.

## Native integration work

The native Journal covers executed fills, ticker filtering, fees and realized P/L using the existing accounting hooks. The native PSX Profiler covers active holdings, market prices, cost, break-even and unrealized P/L. Follow-up native slices include Journal statement reconciliation reports, exports, and Profiler fee scenarios, research/watchlist, return comparisons and profile tools. Legacy Journal backup remains available while these are migrated.

The native Journal includes daily and ticker breakdowns of executed fill counts, fees and realized P/L. Both breakdowns use the same ticker filter as the fill table and cover every filtered fill across all pages.
