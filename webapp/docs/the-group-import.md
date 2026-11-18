# Importing The Group statements

Select the correct QSE broker profile. **Import QSE statement** on the main Dashboard or QSE Dashboard opens the same review used by **Import The Group statement** in Trade list and Cash ledger. The review includes trades, trading rewards, deposits, and withdrawals. Filter for new records, matches, mismatches, or ambiguous rows. Mismatches show the existing and statement values side by side and highlight the fields that differ.

Select all new records or choose them individually. For a matched row, keep the existing values by leaving it unchecked, or select it to use the statement values. The workbook rounds cash and commission amounts. Keep precise existing reward amounts, transfer amounts, and fees when available. New rewards (including zero-rounded rewards) and transfers use the workbook values. Trade cash uses quantity × price and configured fees, keeping existing fee overrides.

Repeated imports preserve stable IDs and do not duplicate records. Ambiguous overlaps remain visible for reconciliation using Modify while other records can be imported. Use Modify to change the gross amount of a linked transfer so both sides stay in sync. New same-day rows use statement matches as anchors while preserving the relative order of existing records.
