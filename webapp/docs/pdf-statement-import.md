# Bank PDF statement import

From an individual bank account’s transaction actions, choose **Import transactions** and select a CSV or text-based PDF. Review the date, description and amount columns and the duplicate summary before confirming.

PDF processing runs on the device. This first slice accepts a selectable-text table headed Date, Description (or Narration or Details), and Amount, with one transaction per line and headings repeated on transaction pages. Use ISO dates or a named month and a single signed amount column. An optional Balance column is read separately and excluded from the transaction amount. Scanned or password-protected PDFs and layouts with separate debit and credit columns need a CSV export for now.

A synthetic PDF smoke check confirmed text extraction. Focused regressions cover numeric precision, positioning, and unsupported formats. No private statements were used.
