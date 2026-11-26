# Native Trade Journal export

In either exchange’s Trade Journal, open **Executed trades → Card options** and choose **Export all executed trades**. Select a ticker to also see **Export filtered trades**. Each export includes every matching active-broker row across pages, with fees, realized P/L, full numeric precision, and currency. Pending orders are excluded. Legacy browser-local data can still be exported separately.

The component regression verifies both downloads, rows beyond the first page, pending exclusion, and numeric precision. The local production build and focused regression passed on 2026-11-24.

In **Daily results** or **Ticker results**, open **Card options** and select the corresponding export. The CSV follows the current **Ticker** filter and includes every matching report group across pages, with the fill count, fees, realized P/L, and currency. A blank realized P/L means the report has no realized result for that group.

Use **Date range** to scope the Journal by trade date. Both dates in a custom range are inclusive. The selected range and ticker apply to all three tables and their filtered exports. **Export all executed trades** continues to export the active broker’s full executed history.

The **Date range** and **Ticker** selections are saved in the page URL and restored on reload. A link uses the recipient’s active broker workbook. If the selected ticker is unavailable in that workbook, the Journal displays all tickers in the selected range.
