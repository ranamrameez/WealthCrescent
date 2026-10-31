# WealthCrescent — Session Handoff (refreshed 2026-10-31)

## 2026-10-31 — Funds cash reconciliation / issue #42 (latest work)

- Open issue: [#42 — Design and implement Funds cash-on-hand reconciliation without double-counting holdings](https://github.com/ranamrameez/WealthCrescent/issues/42).
- Implementation branch: `feat/funds-cash-reconciliation` (branched from current `main`); no PR opened yet.
- Architecture: a separate portfolio-level cash account per currency. Funds linked transfers are portfolio-level and have no fund/broker reference, so a per-fund account would not match the existing transfer model.
- New/edited Funds transfers store `currencyCode`. A versioned metadata-only migration snapshots the existing Funds default currency for legacy transfers without rewriting the original transfer records. The Cash ledger warns about those rows and lets users assign a currency by editing.
- BUY reduces cash in the fund's currency; valid SELL adds proceeds; transfer fees are applied once; unmatched SELLs and pending trades do not create cash movement. Each currency has an independent ledger.
- Funds Summary separates invested cost basis, holdings value, cash on hand and total Funds value. Current and historical Net Worth add cash to holdings once, with a separate Funds cash inclusion toggle.
- Regression tests added for fees, BUY/SELL movement, currency separation, unmatched SELL handling, legacy currency fallback and historical Net Worth.
- **Not yet validated:** no local run or CI run on this branch yet. Do not merge until the exact latest PR head passes full tests, type-check and production build. Real legacy backup/export review and interactive browser smoke tests remain outstanding.

### Broker-profile branch status

The broker-profile feature was delivered by merged [PR #43](https://github.com/ranamrameez/WealthCrescent/pull/43). The specifically requested `feat/broker-profile-isolation-rebased` branch is diverged from main (69 commits ahead / 34 behind) and has no matching open PR; do not merge or continue work on that stale branch. Use merged `main` as the source of truth.


## 2026-10-31 — PR #44 merged into main (latest)


- **PR #44:** [Standardize section actions, pagination, and finance summaries](https://github.com/ranamrameez/WealthCrescent/pull/44) is closed and merged.
- **Merge method:** Squash merge.
- **Merge commit on `main`:** `d1c3c4c33776dc871cf15f044353359a71c18986`.
- **Merged feature branch:** `fix/trade-entry-validation-and-transactions-ui`.
- **Scope:** 56 files covering shared actions and pagination, finance summaries, credit-card running limits, QSE/PSX trade safeguards, FAB/plan execution verification, and legacy oversell reconciliation.
- **Validation:** application-code head `18348fa258be95767b209b8585b575a8acdd2cf8` passed both jobs in Actions run [#41201015866](https://github.com/ranamrameez/WealthCrescent/actions/runs/41201015866): full test suite and type-check/production build. Later commits before merge were documentation-only; no application code or tests changed after this successful run.
- **Accounting regression:** PSO history is 122 BUY / 132 SELL; 122 shares are matched, 10 excess SELL shares remain flagged, and unmatched shares/fees do not create realized profit.
- **Manual verification limitation:** the connected browser in that session exposed read-only tab content only. Interactive branch-level testing of trade entry, FAB persistence, credit limits, pagination, and chart/filter behavior was not completed. Do not represent those flows as manually verified; perform a production UI smoke test when interactive browser access is available.

### User-confirmed delivery rules (2026-10-31)

1. Make small, focused commits and push them regularly on the active feature branch.
2. Keep `webapp/README.md`, `webapp/USER_MANUAL.md`, root `CLAUDE.md`, and this handoff current when relevant.
3. Never push directly to `main`; use a branch and PR.
4. Before merging, verify the latest application-code head with successful type-check, production build, and full test suite. If application code changes after validation, rerun the full checks.

---

## 2026-10-31 — PR #44 continuation handoff (latest)

**Current work is already in draft PR #44** — [Standardize section actions, pagination, and finance summaries](https://github.com/ranamrameez/WealthCrescent/pull/44). Do not start a duplicate branch or duplicate implementation. Live GitHub check at handoff time:

- PR: **#44**, open, draft, base `main`.
- Branch: `fix/trade-entry-validation-and-transactions-ui`.
- Latest application-code/PR head before this handoff refresh: `54560149c170a2af1d32223c1e4bafdd2c6c0afa`; this update adds documentation only. Re-fetch the branch after this commit rather than relying on this snapshot SHA.
- Base SHA reported by PR at the last comparison: `49cb2a40810619fa075cd422703ab4a6900adce2`; re-check live main before any merge.
- PR has a large commit history (159 commits at this comparison) and 56 changed files. Review the complete diff and commit history carefully; do not assume the PR description's validation refers to the current head. Review the complete diff and commit history carefully; do not assume the PR description's validation refers to the current head.
- Latest verified application-code/PR head: `54560149c170a2af1d32223c1e4bafdd2c6c0afa`. GitHub Actions run [#41200626771](https://github.com/ranamrameez/WealthCrescent/actions/runs/41200626771) passed **Type-check and production build** and the **full test suite** on that exact head. This handoff refresh adds documentation only; re-check Actions for the resulting documentation head before marking ready or merging.
- Intermediate pagination commits exposed a leftover `setPage(1)` reference in Banking after moving to the shared hook; it was removed in code head `bf80f621`, whose build and tests passed. A final review also strengthened historical edit validation to compare unmatched quantities per SELL transaction, not only per-ticker totals.
- Nothing from this work has been merged into `main`. Keep the PR as a draft until current-head tests/build, full diff review, and any required manual checks are complete.

### Latest continuation update (2026-10-31)

After the earlier `bf80f621` checkpoint, the branch received the following additional application work:

- Extended shared pagination to Bank account/all-bank ledgers, Cash planned entries, Funds import/transaction/balance/transfer tables, Net Worth activity drilldowns, Planning category/activity tables, Rental property plans/monthly rollups/plan overview, and Subscription renewals. Existing intentionally short import previews and small summary tables remain bounded.
- Corrected the PSO fixture to the actual supplied **122 BUY / 132 SELL** history. The final 80-share SELL matches 70 available shares and leaves 10 unmatched; no synthetic BUY is added and no profit is recognized on unmatched shares.
- Added transaction-specific chronological edit validation so an edit cannot move a pre-existing unmatched quantity from one SELL row to another.
- Added proportional-fee regression coverage and surfaced unmatched SELL fees in reconciliation warnings and all-time summaries for both QSE and PSX.
- Applied sell-quantity and configurable price-deviation checks to Trade Strategy plan execution and verify that the transaction is actually recorded before showing success.
- Kept the FAB calculator ticker synchronized with stock-detail route changes and added summary regressions for date formatting and credit-card debt-change tone.

The exact application-code head `54560149` passed type-check, production build, and the full test suite in run `41200626771`. The current PR remains open and in draft; nothing has been merged to `main`.

### Scope already represented in PR #44 — verify rather than re-implement

The PR description reports implementation of: functional-only StandardCard/TableCard actions and legacy Tabs forwarding; shared pagination across finance and QSE/PSX tables; credit-card chronological running consumed/allowed/available limits; Funds and Brokers as peer navigation sections with Summary/Funds/Brokers expanded by default; Portfolio Item-style inline summary subsections; All Time defaults for QSE/PSX stock-detail history/exports; daily/latest-recorded-day and lifetime low/high bounds on both price-comparison charts; sell-quantity guards and configurable ±10% market-price deviation confirmations; stock-detail FAB ticker preselection; robust FAB save success/failure handling; and legacy oversell reconciliation with proportional fee allocation and no fictitious P&L on unmatched shares.

### Critical financial-data correction to the PR description / PSO regression

The transaction table supplied by the user totals **122 BUY shares and 132 SELL shares**, not 132 BUY and 132 SELL. The correct accounting expectation is:

- Match/close the 122 genuinely purchased shares against 122 sold shares.
- Leave **0 matched/open shares** after all valid lots are consumed.
- Flag **10 excess SELL shares as unmatched/reconciliation quantity**.
- Do not invent 10 BUY shares, silently discard the excess, or count unmatched shares/fees as realized profit.
- Allocate the SELL fee proportionally to the matched quantity; separately surface the unmatched portion/fee for reconciliation.

The PSO regression fixture and PR description now use those exact 122/132 totals. Re-check the test and description if the fixture is edited; never add a synthetic BUY to make the numbers balance.

### Next-session execution order

1. Re-read root `CLAUDE.md`, this handoff, `webapp/README.md`, `webapp/USER_MANUAL.md`, and `webapp/audit.md`; then refresh live PR #44, branch head, main head, and Actions state.
2. Confirm the PR head is still the expected handoff base; if it moved, use the new exact SHA for every validation decision.
3. Inspect PR #44's full diff and all commits for accidental unrelated changes, duplicate implementations, data migrations, and shared-component regressions. Preserve existing URL-backed filters, full filtered datasets for calculations/exports, and QSE/PSX parity.
4. Run/check current-head type-check, production build, and full test suite. Fix failures on this branch, then re-run all required checks against the final head.
5. Specifically verify: credit-card opening debt and chronological running limits; Funds/Brokers route and navigation hierarchy; default-open behavior; All Time filter behavior and URL persistence; summary groups on each affected entity page; daily/lifetime chart bounds; QSE and PSX sell guards including sequential/multi-row entries; ±10% warning/cancel path; FAB ticker preselection and correct broker-profile persistence; and PSO 122/132 reconciliation math.
6. Finish the cross-page audit for remaining inert section actions and unpaginated tables. Do not add fake menu actions or paginate a dataset before calculations/exports consume it.
7. Update `webapp/README.md` Done/Pending, `webapp/USER_MANUAL.md`, and this handoff only for behavior actually verified. Keep PR #44 draft until ready; never push directly to `main`. The user explicitly requested this handoff be pushed, but did not authorize merging PR #44.

### Continuation work after the initial handoff snapshot (2026-10-31)

The next context continued on the same branch and preserved the handoff/docs commits. Additional code changes after head `0901cfc9`:

- Applied shared pagination to Personal Loans plan/payment tables, EMI repayment and planned-installment tables, QSE/PSX stock-detail transaction tables, and expanded stock price-history tables.
- Expanded default-open primary sections to Summary, Banks, Accounts, Funds, Brokers, Properties, Loans, and Subscriptions (explicit `defaultOpen: false` remains respected).
- Corrected shared summary date detection and credit-card debt-change tone; added regression tests.
- Added chronological edit validation so changing a historical BUY/SELL cannot introduce new unmatched sells, while existing legacy discrepancies remain editable.
- Added sell-quantity and configurable price-deviation checks to Trade Strategy plan execution; verify the store actually records the planned transaction before showing success.
- Kept the FAB calculator ticker synchronized if the stock-detail route changes while the modal is open.
- Corrected the PSO regression fixture: removed an unsupported 10-share BUY. The supplied history is 122 BUY / 132 SELL; the final 80-share SELL matches 70 and leaves 10 unmatched. No synthetic BUY is introduced and no profit is recognized on those 10 shares.
- Updated PR #44's description to reflect these changes and the correct PSO totals.

The latest verified application-code head is `bf80f6217ef00f26a1ec45ea1f825841c7790e18`; it passed type-check, production build, and full tests in run `41199973181`. This code head includes the transaction-specific legacy-oversell edit validation and the Banking pagination cleanup. Subsequent documentation-only commits refreshed `USER_MANUAL.md`, `README.md`, and `CLAUDE.md`; verify the current PR head and its latest Actions run before merge.

### Tool/session limitation

The original handoff commit `8688aebb` was documentation-only; that handoff-writing context made no application-code changes and ran no build, tests, or browser verification. Subsequent continuation changes are recorded in the section above and have their own branch commits and CI runs.

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


## 2026-10-31 — merge authorization and workflow rules

The user confirmed that only this session is active and explicitly instructed us to complete PR #44 and merge it. Do not defer to earlier notes asking to keep the PR in draft without user approval; that approval has now been given.

**Standing workflow rules (user-confirmed 2026-10-31):** make small, focused commits; push regularly to the existing feature branch; keep `CLAUDE.md`, `webapp/README.md`, `webapp/USER_MANUAL.md`, and this handoff updated when relevant; never push directly to `main`; and never merge unless the exact latest PR head has successful type-check, production build, and full test suite. Any code change after validation requires a fresh full run on the new head.

### Live review checkpoint

- PR #44 was open, draft, and mergeable at application-code head `18348fa258be95767b209b8585b575a8acdd2cf8`; 56 files changed and 163 commits at that checkpoint. No inline review threads or submitted reviews were present.
- GitHub Actions run [#41201015866](https://github.com/ranamrameez/WealthCrescent/actions/runs/41201015866) completed successfully on that exact application-code head. Both jobs succeeded: full test suite (including broker-profile and PSX-fee regression tests) and type-check/production build.
- Subsequent PR commits `89f05a58`, `c65b0884`, and `aa40f608` are documentation-only changes to `CLAUDE.md` and this handoff; no application source or tests changed after the successful run. The workflow did not report a new PR run for these docs-only commits.
- The diff was reviewed for the shared section actions, default section expansion, shared pagination, credit-card chronological balances, FIFO legacy-oversell matching/fee allocation, transaction edit validation, QSE/PSX position summaries and trade calculator changes. The PSO fixture expectation remains 122 BUY / 132 SELL, with 10 unmatched SELL shares and no fictitious realized profit.
- The connected production browser tab exposed the deployed Net Worth analytics page for read-only inspection. This session's browser connection provides tab reading only, not navigation/click interaction, so end-to-end interaction checks for the PR branch could not be performed here. Do not claim those manual flows were browser-verified; automated validation and source review are the available evidence.
- The user explicitly authorized merging despite the earlier draft-only checkpoint. The remaining actions are to re-fetch the live PR head/base and mergeability, confirm no application-code changes occurred after the successful run, mark PR #44 ready, and merge it. Never push directly to `main`.
