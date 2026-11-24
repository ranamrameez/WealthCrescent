# AHL generated CSV validation

On 2026-11-24, the native PSX import readers were exercised offline with a privately generated order-history CSV and two account-statement CSVs. The order reader parsed every data row. The cash importer selected deposits and withdrawals from the account statements, excluding rows outside that importer's scope, such as trade settlements. The updated statement returned one additional deposit with its time and time zone, and the earlier cash rows retained their source identifiers.

Both offline checks passed. This validates parsing. A signed-in save and cloud synchronization were outside this check. The exports and raw values remain private.
