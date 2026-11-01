# Importing The Group statements

Select the correct QSE broker profile. Use Cash ledger → Import The Group statement for trades, deposits and existing reward ordering. Trade list imports trades only. Review additions, updates, price corrections and missing-reward dates before confirming.

The Excel cash and commission figures are rounded to whole riyals. Trade dates, quantities, prices and order come from the statement. Trade cash uses quantity × price and configured fractional fees, retaining existing fee overrides. Exact rewards in the app are preserved. Missing rounded rewards are excluded and listed for entry from exact records. Existing precise deposit amounts and fees are retained when matching rounded statement deposits.

Repeated imports preserve stable IDs and do not duplicate trades. Ambiguous overlaps or combined fills crossing another trade stop the import; resolve those records with Modify before importing. Existing records outside the statement are retained.

Validation: 142 test files / 1,128 tests passed, plus TypeScript checks and the production build. Automated component checks cover sequence, precise rewards, price corrections and repeated imports. Interactive browser smoke testing remains pending.
