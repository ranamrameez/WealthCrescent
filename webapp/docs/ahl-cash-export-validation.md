# AHL cash export validation

On 2026-11-22, the native PSX cash importer read two privately supplied Al Habib account-statement HTML exports. Each produced cash rows with unique source identifiers. In an isolated workbook, the review classified the rows as new, added the selected rows to the Al Habib profile, and classified every row as matched when the same export was reviewed again.

Both private-file checks passed. No importer changes were required. The check used a local test owner. It did not write to a production ledger, verify cloud sync, or reconcile against bank records. Private statements and trade values remain outside the repository.
