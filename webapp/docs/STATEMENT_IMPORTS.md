# Statement imports and repeat transfers

The selected account, cash currency, loan, or property owns the import. Open its import action, choose a file, review the suggested column mappings, change any selection, and confirm through the module's existing import screen. Recognized headers are suggestions. When two columns match the same field, select the right one yourself.

| Import | Coverage |
| --- | --- |
| Bank accounts, Cash, Personal Loans, Rentals | CSV, TSV, delimited TXT, one populated XLSX or XLSM worksheet, one flat HTML table, JSON arrays of transaction objects, and supported text PDF tables |
| QSE, PSX, EMI, Funds, Credit Cards | Existing module-specific statement import flows and supported layouts |
| Scanned PDFs and arbitrary document layouts | Pending OCR and layout review |
| Multiple tables or worksheets with data, legacy XLS, ODS, and additional modules | Pending table selection, readers, and module adapters |

Files are read in the browser. Use a source with column headers. Excel numeric dates are converted for a uniquely recognized date header using the workbook's date system. For other date columns, export dates as YYYY-MM-DD text. Broker reconciliation continues through its own review flow, including QSE protection for more precise recorded amounts.

In Transfers, choose an active bank account. If its history has a repeated eligible bank-to-bank route, the form offers a repeat-transfer button. The suggestion ranks by use count and breaks ties by last transaction date. Choosing it fills the counterpart, direction, available category, and FX source label from the route's latest transaction. Accounts, categories, and source remain editable. Enter current amounts before saving. For example, a previously saved QIB-to-UBL route can suggest Doha Exchange if that was the prior FX source. Suggestions are computed from existing transfers in the browser.

General action suggestions for modules and ordinary recurring categories such as Grocery, configurable automatic opening, and native Android parity are follow-up work.
