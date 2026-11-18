# Parallel delivery workflow

The register lives on the shared delivery branch linked to the active PR. For the current delivery, use the head branch of [PR #51](https://github.com/ranamrameez/WealthCrescent/pull/51). Read that remote version before claiming work, even if your local checkout is newer in other files. The [delivery checklist](CURRENT_DELIVERY_STATUS.md) describes the acceptance criteria.

1. Fetch the delivery branch. Read current AGENTS.md, the session handoff, the delivery checklist, and the relevant module docs and guidelines. Check the register and active PRs. Choose the next ready, unclaimed item in dependency order. Split broad work into named deliverables and give each a file or feature scope. Check for overlap with other in-progress items.
2. Set the row to **In progress** with your agent or session identifier, branch or PR, scope, and UTC date. Publish the claim to the delivery branch before editing product files. Use a fast-forward ref update against the head you read. If another session advances the branch, fetch and reread the register before retrying. If it claimed the same work, choose another item.
3. Work from the published claim on your own branch. Use a separate worktree for each session that shares a local clone. Keep your row current if scope or dependencies change. For a blocked item, record the blocker and whether ownership is retained. Confirm a handoff with the current owner before taking over their claim. If nobody can confirm a stale claim, leave a note for the coordinating session.
4. When the deliverable meets its acceptance criteria, publish **Done** with the commit or PR and verification. Then fetch and reread the register, claim the next ready unowned item, and begin it without waiting for a user prompt. Keep the repository instructions, handoff and affected delivery docs up to date. If no unowned item is ready, record the dependencies or ownership that prevent progress. If an item is released unfinished, set it to **Ready** and record the remaining work and its branch or commit.

## PR #51 task register

| Task | Status | Owner and branch | Scope or evidence |
| --- | --- | --- | --- |
| Preserve the QSE statement reconciliation in the delivery branch | Done | WC-TR coordination, PR #51 | Integrate `main` at `32c289aa`, which contains merged PR #53. |
| Protect linked independent installment receipts from generic edits and deletions | Done | WC-TR coordination, PR #51 | Shared transfer actions, bank account changes and loan deletion. Cash, Bank and card fixtures passed with the full suite. |
| Coordinate reversal with the funding ledger | Ready | | Depends on linked-receipt protection and atomic payment persistence. |
| Integrate and verify atomic multi-workbook payment persistence | Ready | | Verify the owner-only RTDB rules and emulator behavior. Integrate pending records with reporting, deliberate settlement, backup and reset before activation. |
| Count pending Cash and Bank occurrences once in movement reports | Done | WC-TR coordination, PR #51 | Focused movement regressions cover explicit linkage, recurring dates, bank-account scope and removal. |
| Hide already-pending Cash and Bank occurrences from Upcoming | Done | WC-TR coordination, PR #51 | Service test verifies that adding and removing a linked pending record refreshes Upcoming while keeping later recurring occurrences. |
| Add atomic pending Cash and Bank occurrence persistence | Done | WC-TR coordination, PR #51 | Draft service and transaction fixtures cover occurrence identity, replay, concurrent writes, stale plans, cancellation and auth changes. |
| Complete scheduled-payment and settlement lifecycle | Ready | | Depends on atomic payment persistence. |
| Add explicit full settlement for pending Cash and Bank occurrences | In progress | WC-TR coordination, PR #51, 2026-11-18 UTC | Draft account transaction clears reviewed entry, completes occurrence and updates execution history together. |
| Add standalone subscription renewals to planned movement | Done | WC-TR coordination, PR #51 | Shared Upcoming funding checks and dashboard scope. Tests cover active and archived funding, cancelled subscriptions, and the Money in/out breakdown and record detail. |
| Keep installment funding visible when its linked receipt is missing | Done | WC-TR coordination, PR #51 | Cash and Bank regressions verify the funding stays visible until its receipt exists, then counts only once. Card behavior uses the same rule. |
| Finish remaining canonical reporting adapters and drilldowns | Ready | | Other standalone schedules, allocation drilldowns and source-scope acceptance. |
| Finish currency budget workflows | Ready | | Bulk definition edits, source identity and planned reservations. |
| Continue UI-to-service migration | Ready | | Claim one named module and workflow at a time. |
| Cash accounts in the global finder | Done | WC-TR session 1939ef032035, PR #51 | `0526e262` covers defaults, Cash entries, Cash plans, independent favorites and filter-preserving links. 1,390 tests and build passed locally; Actions 474 passed. |
| Shared finder keyboard acceptance | Done | WC-TR session 1939ef032035, PR #51 | `92c13b71` skips disabled keyboard results and handles empty searches. 1,393 tests passed locally; Actions 477 passed tests and build. |
| Add app-wide record search | In progress | WC-TR session 1939ef032035, work/app-record-search, 2026-11-18 UTC | High priority. Topbar keyword search and a dedicated results page with module and submodule scopes. See the delivery checklist for acceptance. |
| Validate Cash currency detail links | Done | WC-TR session 1939ef032035, PR #51 | `7fb88810` shares the Cash currency registry, rejects unknown URLs and preserves active filters. Focused tests and Actions 483 passed. |
| Complete UX acceptance | Ready | | Claim one module or a specific shared control at a time. |
| Final PR validation and merge | Ready | | Depends on the remaining acceptance checks and exact-head CI. |
