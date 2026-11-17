# Importing The Group statements

Select the correct QSE broker profile. Use Cash ledger → Import The Group statement for trades, deposits and existing reward ordering. Trade list imports trades only and opens a review with cards for existing and incoming values. Filter new trades, matches, and items that need manual review. Select individual statement trades or select all new trades and all matched trades in bulk. Unchecked matched trades keep their existing values. The reader resolves known QSE symbols, company names, and broker aliases such as GWC and Qatar German Med.

The Excel cash and commission figures are rounded to whole riyals. Trade dates, quantities, prices and order come from the statement. Trade cash uses quantity × price and configured fractional fees, retaining existing fee overrides. Exact rewards in the app are preserved. Missing rounded rewards are excluded and listed for entry from exact records. Existing precise deposit amounts and fees are retained when matching rounded statement deposits.

Repeated imports preserve stable IDs and do not duplicate trades. In Trade list, ambiguous overlaps stay visible and unavailable for import until corrected with Modify. Other eligible trades can still be selected. Cash ledger retains strict validation and requires ambiguous overlaps to be resolved first. New same-day trades use matched statement trades as anchors while retaining the relative order of existing events. Existing records outside the statement are retained.

Validation: 142 test files / 1,128 tests passed, plus TypeScript checks and the production build. Automated component checks cover sequence, precise rewards, price corrections and repeated imports. Interactive browser smoke testing remains pending.
