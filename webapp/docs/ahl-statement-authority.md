# AHL raw HTML and statement authority

Both supplied raw HTML files passed private checks through the native order and cash readers. Account statement import covers cash deposits and withdrawals. Order-history import reads executed fills separately.

In PSX cash review, select **Use statement values** to correct a confirmed match. Statement gross and fee win when the amounts disagree at the precision shown in the source text. If the app amount rounds to that figure, the saved amount retains its extra decimals. XLSX cells use exact comparison because this reader does not preserve visible decimal formatting. Missing fees and timestamps retain their existing values. Linked transfers still require the coordinated editor, and records with ambiguous identity require review. Existing records outside the statement are preserved.

Private inputs and raw account values were kept out of GitHub. Focused service and importer tests passed. No production data was written.
