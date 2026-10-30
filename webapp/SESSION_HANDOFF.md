# WealthCrescent — Session Handoff (2026-10-29)

Read this before continuing work in a new session. This is a concise, dated handoff, not a replacement for the canonical project documents.

## Source of truth and working rules

1. Read root `CLAUDE.md` for standing instructions, then `webapp/README.md` for the current Done/Pending backlog, `webapp/USER_MANUAL.md` for user-facing behavior, and `webapp/audit.md` for the active cost-basis audit.
2. Keep `webapp/README.md` Done/Pending, this handoff, and `webapp/USER_MANUAL.md` current as work lands. Record concrete examples and regression tests for financial-calculation fixes.
3. Never push directly to `main`. Use focused branches and pull requests. The latest explicit instruction allows incremental merging of independently working tasks, but merge each task only after its relevant checks pass; do not wait for a giant batch.
4. Do not claim tests/build/browser verification unless there is evidence. GitHub-connected tools can inspect and edit repository files, but do not assume a local npm/browser runtime is available.
5. Preserve financial data during settings resets. Defaults apply initially; each user can customize their own values. A newer app-default version should offer a choice to apply new defaults or retain custom values, never silently overwrite user customizations.

## Main branch / validation checkpoint

- main was at aef2c82b0ea2d82521cbbeb7e5d01eb5290d867a after documentation PR #32 merged on 2026-10-29. Re-check the live remote HEAD before further work.
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

## Closed stale work — preserve useful history, do not merge old branches

### PR #22 — superseded and closed
[Closed PR #22](https://github.com/ranamrameez/WealthCrescent/pull/22), former branch `chatgpt-audit-qse-transaction-order`, preserved head `d962a49f03b170d7a6ff7bc6c141c366809b5804`.

- The transaction-view cost-basis slice was ported to fresh work and merged in PR #31.
- PR #22 was closed on 2026-10-29 and retitled `[Superseded] Align QSE/PSX accounting order and cost basis` to prevent accidental merging of a stale, diverged branch.
- The stale branch is still closed and must not be merged. Its useful ordering idea is being ported in fresh PR #36. The intended canonical fields are `globalTransactionIndex` (workbook-wide accounting order) and `perTickerIndex` (derived order within each ticker); reordering swaps global positions and recomputes per-ticker indexes through a shared helper. Legacy `transactionIndex`/`seq` are mirrors only. PR #36 remains open pending CI/review, and does not solve unified ordering for mixed cash-ledger events.
- The source branch was intentionally retained for recovery. Do not build new work on it; if the idea is resumed, create a fresh branch from current `main` and port only reviewed changes. The connected GitHub tools available in this session do not expose branch deletion, so the old branch has not been deleted.

### PR #23 — superseded and closed
[Closed PR #23](https://github.com/ranamrameez/WealthCrescent/pull/23), former branch `fix/fab-trade-save`, head `979ac79e9d6a4c775580131550f17992ec21f73d`.

Its unique retry-preserving failure behavior and regression coverage were ported into PR #30, which is merged and passed CI. Do not reopen or merge this stale branch. Its source branch is retained for recovery; it is not the source of truth for future development.

PR #31 merged the transaction-page cost-basis consistency slice. PR #32 merged the status/handoff refresh. PR #36 is the current fresh transaction-order implementation; check its live state and CI before proceeding.

## Remaining work and safe next actions

1. Re-check live GitHub PR/branch/CI state before each task; this handoff is a dated snapshot.
2. PR #22 and PR #23 are closed as superseded. Do not reopen or merge their stale branches. PR #30 and PR #31 are merged with green CI; PR #32 and PR #33 are documentation-only merges.
3. **Canonical global/per-ticker transaction ordering is in PR #36, not merged.** Never merge stale PR #22. Review the fresh PR and its CI. `globalTransactionIndex` is canonical total order; `perTickerIndex` is recalculated from it for each ticker; `transactionIndex` and `seq` are compatibility mirrors.
4. Before shipping cross-date reordering, ensure tests cover synchronized indexes, positions, realized P/L, and cash-ledger behavior. The mixed cash ledger still sorts combined trades/transfers/adjustments by effective date, so do not claim a unified mixed-event ledger order is solved until separately designed and tested.
5. Continue the broader cost-basis dependency audit outside Transactions: Dashboard, Position Detail, analytics/time series, exports, charts, and strategy/advisory views. Update this handoff, `webapp/README.md`, `webapp/audit.md`, and `webapp/USER_MANUAL.md` after each independently verified slice.
6. Keep PSX market-cache activation pending until rules deployment, scheduled function deployment, and cache population are actually verified; the prior Firebase admin attempt returned HTTP 401 before mutation.
7. Old source branches are retained for recovery because the connected GitHub tools available in this session do not expose branch deletion. The stale PRs are closed and cannot be accidentally merged through the normal open-PR workflow.

## Latest CI regression fixes now on main

PR #28 fixed the `PriceInput` draft/default interaction, flushes queued local-storage writes during local-data reset, preserves merged-away bundled default categories, and aligns two brittle/current-behavior tests. Full test suite: 134/134 test files passed; production build passed. This does not validate the deferred global transaction-order proposal or live Firebase/browser behavior.

### PR #36 CI repair update (2026-10-30)

The prior full suite had failures in QSE batch CSV imports, hidden-order reorder saving, and the live price-input synchronization test. Fixes are now committed on `feat/persisted-trade-accounting-order`: exclude derived `perTickerIndex` from numeric input validation; teach `BatchEditGrid` to include hidden `orderKey` drafts in dirty state and onSave (QSE's `globalTransactionIndex` is not a visible column); and await the live-price effect in the asynchronous test. Production build passed in the previous run; the new test run has not yet completed.

## 2026-10-30 — verified stock-order merge and current follow-ups

- PR #36, `Synchronize global and per-ticker trade accounting order`, was merged to `main` as `e4aef0bcd2ccf20e2cd7c73a3fe98cc293943be8`. Its exact source head passed GitHub Actions run #94: full test suite and production build both succeeded. The mixed-event cash ledger (trades + transfers + adjustments) still uses effective-date ordering; do not claim that separate ledger problem is solved.
- Broker-profile isolation from PR #38 was merged into its original feature branch only after its exact source head passed run #99. A main-targeted PR #39 now carries that implementation; its own CI must pass before merge. The migration still requires a backup/export review and browser verification; CI alone does not validate a user's financial data migration.
- Mutual Funds date/amount fixes are being ported to a fresh branch from the post-#36 `main` because the original PR #37 branch diverged when #36 merged. Main-targeted PR #40 is the intended replacement; PR #37 should be closed as superseded only after #40 is opened and CI starts.
- Mutual Funds changes: Balance History uses effective `date` (same-day `time` tie-break only); Invest/Withdraw Amount is editable and derives units from NAV; tests cover amount conversion and date-driven history/latest-price ordering. Invest and Withdraw remain separate actions; P&L is derived.
- Funds transfer/cash reconciliation is intentionally separate. `FundsWorkbook` inherits generic transfers but has no per-fund cash-on-hand account. A correct solution needs an explicit cash ledger/account model so a deposit is cash until a BUY moves it into units; otherwise the same deposit could be counted once as cash and again as holdings. Do not merge a shortcut that double-counts it.
- For every PR, validate the latest head SHA, not a previous run. Require both full tests and production build green before merge. Never push directly to `main`.


## Broker-profile isolation — current PR #41 checkpoint (2026-10-30)

- Clean main-based branch: `feat/broker-profile-isolation-main`; PR #41.
- Per-broker data: trades, transfers, adjustments, dividends/rewards, trade plans, fee/cost-basis settings and calculations. Shared exchange data: market prices, price history, watchlists and exchange-wide information.
- Central Transfers/Cash Transfer pickers store the individual broker profile ID. Add/edit/delete must route to the correct profile even when it is inactive; legacy linked transfers recover their broker reference.
- Archived profiles remain view-only; deactivated profiles are hidden from normal activity and cannot become active.
- Legacy PSX history migrates to JS Zindigi/JS Zindagi, preserving transaction IDs, dates, tickers, actions, quantities, prices, fee overrides, transfer amounts/fees, and shared market data.
- The original stacked implementation passed run #99; clean main-based PR #41 passed run #105 (tests/build) before post-PR40 reconciliation. The latest head needs a fresh Actions run. Do not merge until a backup/export review and browser checks confirm migration, profile switching, linked transfer routing, and status restrictions.
- PR #36 and PR #40 are merged; PR #37 and #39 are closed as superseded. Funds cash reconciliation is tracked in issue #42.


## 2026-10-30 — PR #43 final CI status

PR #43 (`feat/broker-profile-isolation-main-v2`) is based on current `main`, including PR #40's Mutual Funds effective-date correction. Latest head `b31bbd264d105c0445abc655abe2f083017e9407` passed GitHub Actions run #107: full test suite and production build. Keep it open until a real backup/export migration review and browser verification are complete. The connected browser session was unavailable during this pass, so do not claim those manual checks were performed.
