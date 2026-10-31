# WealthCrescent — Session Handoff (refreshed 2026-10-31)

## 2026-10-31 — PR #44 continuation handoff (latest)

**Current work is already in draft PR #44** — [Standardize section actions, pagination, and finance summaries](https://github.com/ranamrameez/WealthCrescent/pull/44). Do not start a duplicate branch or duplicate implementation. Live GitHub check at handoff time:

- PR: **#44**, open, draft, base `main`.
- Branch: `fix/trade-entry-validation-and-transactions-ui`.
- Current PR head before this handoff update: `0901cfc9c8704c470e0fb954fb049390e6d8d4e4`.
- Base SHA reported by PR: `49cb2a40810619fa075cd422703ab4a6900adce2`.
- PR currently contains 122 commits and 50 changed files. Review the diff and commit history carefully; do not assume the PR description's validation refers to the current head.
- PR description says type-check and production build passed at older head `7e58b931`; the full suite was still running at that point, with the preceding completed suite at `50917bf1`. **No validation result for head `0901cfc9` was established in this session.** Re-run/check CI for the exact current head before marking ready or merging.
- Nothing from this work has been merged into `main`. Keep the PR as a draft until current-head tests/build, full diff review, and any required manual checks are complete.

### Scope already represented in PR #44 — verify rather than re-implement

The PR description reports implementation of: functional-only StandardCard/TableCard actions and legacy Tabs forwarding; shared pagination across finance and QSE/PSX tables; credit-card chronological running consumed/allowed/available limits; Funds and Brokers as peer navigation sections with Summary/Funds/Brokers expanded by default; Portfolio Item-style inline summary subsections; All Time defaults for QSE/PSX stock-detail history/exports; daily/latest-recorded-day and lifetime low/high bounds on both price-comparison charts; sell-quantity guards and configurable ±10% market-price deviation confirmations; stock-detail FAB ticker preselection; robust FAB save success/failure handling; and legacy oversell reconciliation with proportional fee allocation and no fictitious P&L on unmatched shares.

### Critical financial-data correction to the PR description / PSO regression

The transaction table supplied by the user totals **122 BUY shares and 132 SELL shares**, not 132 BUY and 132 SELL. The correct accounting expectation is:

- Match/close the 122 genuinely purchased shares against 122 sold shares.
- Leave **0 matched/open shares** after all valid lots are consumed.
- Flag **10 excess SELL shares as unmatched/reconciliation quantity**.
- Do not invent 10 BUY shares, silently discard the excess, or count unmatched shares/fees as realized profit.
- Allocate the SELL fee proportionally to the matched quantity; separately surface the unmatched portion/fee for reconciliation.

Before merge, inspect the PSO regression test and implementation to ensure it encodes those exact totals and outcomes. The PR body currently says “132 bought / 132 sold”; correct that statement if the code/test is actually based on the user's supplied 122/132 ledger.

### Next-session execution order

1. Re-read root `CLAUDE.md`, this handoff, `webapp/README.md`, `webapp/USER_MANUAL.md`, and `webapp/audit.md`; then refresh live PR #44, branch head, main head, and Actions state.
2. Confirm the PR head is still the expected handoff base; if it moved, use the new exact SHA for every validation decision.
3. Inspect PR #44's full diff and all commits for accidental unrelated changes, duplicate implementations, data migrations, and shared-component regressions. Preserve existing URL-backed filters, full filtered datasets for calculations/exports, and QSE/PSX parity.
4. Run/check current-head type-check, production build, and full test suite. Fix failures on this branch, then re-run all required checks against the final head.
5. Specifically verify: credit-card opening debt and chronological running limits; Funds/Brokers route and navigation hierarchy; default-open behavior; All Time filter behavior and URL persistence; summary groups on each affected entity page; daily/lifetime chart bounds; QSE and PSX sell guards including sequential/multi-row entries; ±10% warning/cancel path; FAB ticker preselection and correct broker-profile persistence; and PSO 122/132 reconciliation math.
6. Finish the cross-page audit for remaining inert section actions and unpaginated tables. Do not add fake menu actions or paginate a dataset before calculations/exports consume it.
7. Update `webapp/README.md` Done/Pending, `webapp/USER_MANUAL.md`, and this handoff only for behavior actually verified. Keep PR #44 draft until ready; never push directly to `main`. The user explicitly requested this handoff be pushed, but did not authorize merging PR #44.

### Tool/session limitation

This handoff update is documentation-only. No application code was changed in this session, and no build, tests, or browser verification were run here. The handoff was committed to the existing PR branch so the next session can resume from the current draft PR.

---

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


## PR #43 latest-head validation (2026-10-30)

Latest head `dcf3181a0a8955417c4049089f4735685c25a8ec` passed GitHub Actions run #112: full test suite and production build. PR #43 is code/CI ready but remains open pending a real PSX backup/export migration review and browser verification. The connected browser context was unavailable during this session; do not claim those manual checks were completed.
