# Selectable-text PDF imports

Import files from the owning module. PDF text is read on the device and passed to that module's existing validation and review.

| Module | Accepted PDF table |
| --- | --- |
| Bank, Cash, Personal Loans, Rentals | Date, Description (or Narration or Details), Amount, and optional Balance. ISO dates or named months. |
| QSE | The Group cash statement headings Date, Type, Count, Unit, Price, Amount in that order. |
| PSX | AHL cash statement Date, Description, Debit, Credit, or AHL order history with Scrip, Quantity, Gross Rate, Type and Execution Date. |
| EMI | Existing installment schedule or payment table headings, with normal contract and receipt review. |
| Funds | The existing 11-column fund summary, including FundCode, Total Invested, Withdrawn, and Current Balance in their template positions. |

Use selectable text with separate header cells and the same headers on each page. The extractor preserves blank cells and rejects missing or changed layouts. Scanned files, password-protected files, merged headings, and layouts outside these conventions need an alternate export. Credit Cards, Subscriptions, and planning definitions have separate workflows. No cross-module ledger writes occur during PDF extraction.

Verified with synthetic text-position fixtures and the existing QSE and PSX parser regressions. Real statements remain to be verified.
