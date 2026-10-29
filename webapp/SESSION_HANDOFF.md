# WealthCrescent — Session Handoff (2026-10-29)

Read this before continuing work in a new session. This is a concise, dated handoff, not a replacement for the canonical project documents.

## Source of truth and working rules

1. Read root `CLAUDE.md` for standing instructions, then `webapp/README.md` for the current Done/Pending backlog, `webapp/USER_MANUAL.md` for user-facing behavior, and `webapp/audit.md` for the active cost-basis audit.
2. Keep `webapp/README.md` Done/Pending, this handoff, and `webapp/USER_MANUAL.md` current as work lands. Record concrete examples and regression tests for financial-calculation fixes.
3. Never push directly to `main`. Use focused branches and pull requests. The latest explicit instruction allows incremental merging of independently working tasks, but merge each task only after its relevant checks pass; do not wait for a giant batch.
4. Do not claim tests/build/browser verification unless there is evidence. GitHub-connected tools can inspect and edit repository files, but do not assume a local npm/browser runtime is available.
5. Preserve financial data during settings resets. Defaults apply initially; each user can customize their own values. A newer app-default version should offer a choice to apply new defaults or retain custom values, never silently overwrite user customizations.

## Main branch / validation checkpoint

- `main` is at `2c69cbbf77b18c3f4d8d3cb036088e511bf0895d` as of this handoff (after merging documentation PR #29, stock-trade save recovery PR #30, and cost-basis transaction-view PR #31).
- PR #31 merged: [Align transaction-page P/L with configured cost basis](https://github.com/ranamrameez/WealthCrescent/pull/31). Its production build and full test suite passed. QSE/PSX per-SELL P/L now follows Average/FIFO/Lowest-cost-first settings; Average cost hides incompatible lot-attribution tables. This is only the transaction-page slice, not a completed app-wide cost-basis audit.
- PR #30 merged: [Preserve stock-trade entry when save fails](https://github.com/ranamrameez/WealthCrescent/pull/30). Current main preserves QSE/PSX entry values and shows a retryable error if the synchronous transaction-store mutation throws; its QSE success/failure tests, full test suite, and production build passed CI.
- PR #29 merged: [Document current session state and safe porting plan](https://github.com/ranamrameez/WealthCrescent/pull/29); `webapp/SESSION_HANDOFF.md` is now part of `main` and linked from `CLAUDE.md`/`webapp/README.md`.
- PR #28 merged: [Fix existing CI regressions in finance UI and persistence](https://github.com/ranamrameez/WealthCrescent/pull/28). Post-merge Pages workflow [run 40931354687](https://github.com/ranamrameez/WealthCrescent/actions/runs/40931354687) completed successfully. The PR's final CI run passed production build and all 134 test files.
- PRs #25, #26, #27 are merged:
  - [#25 appearance reset and initial defaults](https://github.com/ranamrameez/WealthCrescent/pull/25)
  - [#26 versioned broker defaults](https://github.com/ranamrameez/WealthCrescent/pull/26)
  - [#27 data-preserving reset of all settings](https://github.com/ranamrameez/WealthCrescent/pull/27)
- App defaults are **partially implemented, not a complete administrator-managed defaults system**. Broker defaults are versioned and users can choose apply/keep; appearance reset and Account-page reset-all-settings exist. Still verify behavior in the live/browser experience and decide whether an admin-facing source-of-truth/editor and broader default versioning are required. Reset-all must preserve financial records.
- Broker profiles exist per exchange. QSE starts with The Group; PSX starts with JS Zindigi and AL Habib Capital Markets. Published broker fee schedules may be incomplete/out of date; users must reconcile editable levies with actual contract notes.

## Unmerged work to review — do not merge stale branches blindly

### PR #22 — QSE/PSX accounting order and cost basis
[Open draft PR #22](https://github.com/ranamrameez/WealthCrescent/pull/22), branch `chatgpt-audit-qse-transaction-order`, head `d962a49f03b170d7a6ff7bc6c141c366809b5804`.

It contains potentially valuable work:
- persisted global `transactionIndex` distinct from transaction IDs and per-ticker `seq`;
- cross-date reorder controls for QSE/PSX transactions;
- QSE and PSX lot reporting following the configured FIFO vs lowest-cost-first method;
- weighted-average realized P/L per SELL when Average cost is configured, and suppression of misleading lot reports under Average cost;
- regression tests and audit notes.

Status: draft, no verified checks on its current head. It is 43 commits ahead and 85 behind current main (diverged); do **not** merge it as-is. Rebase/port the work onto a fresh branch from current main in small logical slices, inspect every conflict and overlapping file, then run full build/tests. Critical known review point: `cashLedger.ts` may validate trades in `transactionIndex` order but present cash events in date/time order; verify that the displayed cash balance and accounting validation agree after cross-date reorder. Continue the dependency audit outside Transactions (Dashboard, Position Detail, analytics/time series, exports, charts, strategy/advisory views). Keep advisory calculations explicitly labelled.

### PR #23 — stock-trade FAB save completion
[Open PR #23](https://github.com/ranamrameez/WealthCrescent/pull/23), branch `fix/fab-trade-save`, head `979ac79e9d6a4c775580131550f17992ec21f73d`.

It closes the shared Buy/sell stock modal only after the QSE/PSX store mutation succeeds, preserves entered values on synchronous failure, and adds a QSE regression test. It overlaps with the same callback change already present in PR #22. It was 6 commits ahead / 85 behind main and had no verified checks. Its unique failure-recovery behavior and regression coverage are now merged in PR #30, which passed the production build and full test suite. PR #23 was closed as superseded on 2026-10-29; do not reopen unless new unique work is discovered.

## Recommended next actions

1. Re-check current GitHub branch/PR/CI state before acting; these notes are a dated snapshot.
2. PR #30 and PR #31 are merged with green CI. PR #23 is closed as superseded.
3. Continue PR #22's remaining global transaction-order work on a fresh branch based on current main. Do not merge the stale branch wholesale. The transaction-page cost-basis consistency slice is already merged in PR #31.
4. Before adopting cross-date `transactionIndex` accounting order, resolve the known `cashLedger.ts` concern: trades may validate in accounting order while displayed cash events remain sorted by date/time. Add tests proving running cash balances and accounting validation remain consistent after cross-date reordering.
5. Continue the cost-basis dependency audit outside Transactions: Dashboard, Position Detail, analytics/time series, exports, charts, and strategy/advisory views. Update this handoff, `webapp/README.md`, `webapp/audit.md`, and `webapp/USER_MANUAL.md` after each independently verified slice.
6. Keep PSX market-cache activation pending until rules deployment, scheduled function deployment, and cache population are actually verified; the prior Firebase admin attempt returned HTTP 401 before mutation.

## Latest CI regression fixes now on main

PR #28 fixed the `PriceInput` draft/default interaction, flushes queued local-storage writes during local-data reset, preserves merged-away bundled default categories, and aligns two brittle/current-behavior tests. Full test suite: 134/134 test files passed; production build passed. This does not validate the unmerged transaction-order branches or live Firebase/browser behavior.
