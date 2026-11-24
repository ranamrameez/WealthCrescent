# Native Trade Journal export

In either exchange’s Trade Journal, open **Executed trades → Card options** and choose **Export all executed trades**. Select a ticker to also see **Export filtered trades**. Each export includes every matching active-broker row across pages, with fees, realized P/L, full numeric precision, and currency. Pending orders are excluded. Legacy browser-local data can still be exported separately.

The component regression verifies both downloads, rows beyond the first page, pending exclusion, and numeric precision. The local production build and focused regression passed on 2026-11-24.

In **Daily results** or **Ticker results**, open **Card options** and select the corresponding export. The CSV follows the current **Ticker** filter and includes every matching report group across pages, with the fill count, fees, realized P/L, and currency. A blank realized P/L means the report has no realized result for that group.
