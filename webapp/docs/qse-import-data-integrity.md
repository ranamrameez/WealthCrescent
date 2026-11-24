# QSE statement import data integrity

Claim ID: `qse-import-data-integrity`

## Verified findings

- [The Group parser](../src/lib/theGroupStatement.ts) retains the original statement amount alongside the matched reward. The review allows selecting matched rows in bulk. [The apply service](../src/services/finance/qseStatementImportService.ts) uses the incoming amount to update a selected reward whose amount differs, preserving the existing ID and timestamp. The same path permits overwrites of trade and transfer fields.
- Trade matching includes the date in its main key, but the fallback blocks an otherwise identical trade within three days. This can suppress a legitimate consecutive-day fill.
- The inspected QSE write path persists current workbook snapshots in localStorage and Firebase Realtime Database. It does not append field-level before and after values.

## Required order and status

1. **Snapshot first — blocked.** Export the current WealthCrescent localStorage app data and the Firebase account node to private JSON files and confirm both files and their locations. The prior session had no signed-in app tab or authenticated Firebase access. Keep exports and authentication material out of Git. Do not run imports or sync that could overwrite data before the snapshots exist.
2. **Read-only recovery — pending snapshots.** Inspect Firebase history and backups, localStorage, Git history, and earlier exports. Report each verified exact reward and its source. For unresolved rewards, list date and current rounded amount so the owner can re-enter the exact SMS figures. Do not infer amounts, run destructive migrations, or bulk overwrite data. Recheck the reconciliation residual after verified amounts are restored. Report recovery findings and wait for the owner's explicit approval before implementation.
3. **Implementation — pending approval after recovery.** Complete the acceptance criteria below and report actual test results.

## Implementation acceptance criteria

- **Provenance.** Track manual, imported, or system at record and financial-field level. Treat all existing records as manual. Enforce at the write boundary that imports only create missing records or fill genuinely missing fields. Preserve populated amounts, fees, prices, and shares, including zero. Show both values for conflicts and require a separate explicit choice per field. Remove bulk statement overwrite. Cash matches must be consistent with whole-riyal rounding. Classify larger differences as new or conflicting. Add the permanent rule to `AGENTS.md` during implementation.
- **Trade matching.** Count date + ticker + side + shares + price occurrences per day and consume each existing candidate at most once. Import the shortfall as new. The statement lacks execution IDs and times, and its repeated Remarks value is not an identifier. Cross-date similarities can only be advisory suggestions for leftovers without exact-date candidates on either side. A consumed candidate cannot generate a date-correction suggestion. Different-date identical fills are new.
- **Audit log.** Cover all module writes, including imports, restores, sync, and system jobs, through an audited data-access boundary. Atomically append entity type, record ID, operation, field-level before and after values, timestamp, source, and import batch ID when applicable. Provide record and module history and log restores as new actions. Include history in backups and exports. Document the storage choice, quota handling, and persistence across reloads on GitHub Pages.
- **Importer review.** Use visually distinct labeled checkboxes and action buttons, one primary action, and shared spacing tokens. Default to new and mismatched or conflicting rows, with matched rows behind a filter and counts visible for every status. Before explicit batch confirmation, preview additions, field changes, conflicts, and cash before and after. After import, reconcile the ledger against the statement Balance column with a small rounding tolerance and show the difference from a user-entered broker-reported balance.

## Required verification

Test consecutive-day identical buys (QIBK, 20 shares at 21.75 on November 11 and 12), three same-day identical fills, a genuine wrong-date suggestion, idempotent re-import, preservation of manual amounts, visible conflicts, and audit entries for create, update, and delete. Verify audit persistence on reload and through backup export and restore. Replay the pre-fix ledger CSV and broker statement XLSX privately and verify the November 12 QIBK buy appears as new. No recovery, code implementation, or regression tests have been performed for this claim.
