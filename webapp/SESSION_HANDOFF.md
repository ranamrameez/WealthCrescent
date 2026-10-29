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

It closes the shared Buy/sell stock modal only after the QSE/PSX store mutation succeeds, preserves entered values on synchronous failure, and adds a QSE regression test. It overlaps with the same callback change already present in PR #22. It is also 6 commits ahead / 82 behind main and has no verified checks. Do not merge it separately or close it until its unique work is ported and verified. Prefer porting the small FAB change and test into a fresh current-main branch, unless a validated PR #22 port already includes the same behavior.

## Recommended next actions

1. Inspect current PR and branch state before each action; these notes are a 2026-10-29 snapshot.
2. Create a fresh branch from current `main`; port PR #23's FAB save fix + regression test as a small independent PR, unless the exact behavior is already present on current main. Run CI and merge only when green.
3. Port PR #22 by focused slices, not by merging its stale branch wholesale. Start with transaction-order semantics and tests; separately handle cost-basis reporting. Review the cash-ledger ordering concern before calling the accounting behavior correct.
4. Update this handoff, `webapp/README.md`, `webapp/audit.md`, and the user manual with actual results after each slice. Never label the broader audit complete until every dependent surface is reviewed and tested.
5. Keep the PSX market-cache activation pending until rules deployment, scheduled function deployment, and cache population are actually verified; the prior Firebase admin attempt returned HTTP 401 before mutation.

## Latest CI regression fixes now on main

PR #28 fixed the `PriceInput` draft/default interaction, flushes queued local-storage writes during local-data reset, preserves merged-away bundled default categories, and aligns two brittle/current-behavior tests. Full test suite: 134/134 test files passed; production build passed. This does not validate the unmerged transaction-order branches or live Firebase/browser behavior.
