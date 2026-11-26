# Credit Card PDF statements

On a card’s Transactions card, choose **Card options → Import PDF statement**. Select a supported text PDF with Date, Description and Amount, optionally with Balance. Review the statement’s signed amounts and explicitly choose a card transaction kind for each selected row. Leave refunds and uncertain rows skipped. The importer checks the current card ledger and skips existing or repeated matches. It appends selected transactions to that card only.

A component regression verifies explicit selection, duplicate protection and preservation of existing records.
