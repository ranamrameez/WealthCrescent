# Batch editing architecture

## Assessment of existing code

Bank transactions use signed amounts and derive `isDeposit` in the workbook store.
Personal Loan payments use positive magnitudes for both Borrow and Lent. Transfer
relationships live in `interEntityTransfersStore`, not on transaction rows;
`linkCascade` distinguishes single-side edits from propagation, including independent
cross-currency amounts. Bank plans have free-text categories and optional recurrence,
execution and generated-source metadata. Loan plans use category IDs. Credit Card's
existing batch-add form queues new rows; it does not provide staged existing-record
editing, conflict detection or a reusable spreadsheet. StandardCard Actions provides
the entry points without replacing normal rows or the existing single-edit forms.

## Reusable contract

`BatchEditGrid<T>` receives source rows, `getRowId`, column definitions, row validation,
an optional read-only reason, `onSave(BatchChange<T>[])` and `onClose`.
Columns configure key, label, width, editor type, editability, read-only formatter,
parser, validator and select options. Category columns take registry options from the
caller, so the grid does not mutate a category store while staging edits.

Numeric cells use the shared `FormulaInput` and `resolveNumericInput` parser. It
accepts `=5*986.5`, optional equals signs, +, -, *, / and parentheses; stores receive
only finite numbers. The existing `AmountInput` also delegates to this standard
input. Invalid or incomplete formulas remain visible and block a batch save.

Editor code is loaded on demand through `LazyFinanceBatchEditors`. The sheet mounts
50 rows initially, then appends 50 on near-bottom scrolling or Load more. Period
presets and From/To controls filter the opening selection by its original dates.
Filtering never drops drafts; all changed rows are saved, with a hidden-change count.
Validation reveals the first invalid row even if filtered out or not yet loaded.

Rows are cloned on mount. Raw cell drafts retain blank/invalid input instead of
coercing it to zero. Only changed cells are parsed; only changed rows are validated
and submitted as before/after pairs. Reverting a cell clears its dirty indicator.
The grid blocks duplicate submissions, keeps failed drafts, traps Tab, restores focus,
and warns on document unload while dirty. Arrows keep native field behavior.

`financeBatchEdit.ts` rechecks current entities, links, plan restrictions, validation
and original records immediately before saving. `prepareBatch` accepts an allowlist
of editable fields, prepares every replacement before any write, and preserves
unrelated current records. Each batch uses one existing `setWorkbook` call, retaining
normalization, persistence and existing cloud synchronization. This is an atomic
in-memory update to one workbook, not a cross-store or server transaction; existing
localStorage/cloud persistence failure behavior is unchanged.

## Scope and limitations

- Account/loan identity, currency, sequence, IDs and import provenance are immutable.
- Linked rows are locked, with a fresh link check at save time.
- Executed plans are locked; recurring and generated Bank plans are locked as well.
- Transactions/payments use current filters. Bank plans use the list's date range;
  Loan plans use all plans for that loan, matching its Plans table.
- No adding/deleting rows, range paste, undo stack, new-category creation, or full
  virtualization in this version. Lazy row rendering limits initial DOM size.
- Conflicts are conservative at record granularity. A changed record is rejected
  even if another session edited a different field. Drafts remain open for review.
