# Parallel delivery workflow

The register lives on the shared delivery branch linked to the active PR. For the current delivery, use the head branch of [PR #51](https://github.com/ranamrameez/WealthCrescent/pull/51). Read that remote version before claiming work, even if your local checkout is newer in other files. The [delivery checklist](CURRENT_DELIVERY_STATUS.md) describes the acceptance criteria.

1. Fetch the delivery branch and check the register and active PRs. Choose the next ready, unclaimed item in dependency order. Split broad work into named deliverables and give each a file or feature scope. Check for overlap with other in-progress items.
2. Set the row to **In progress** with your agent or session identifier, branch or PR, scope, and UTC date. Publish the claim to the delivery branch before editing product files. Use a fast-forward ref update against the head you read. If another session advances the branch, fetch and reread the register before retrying. If it claimed the same work, choose another item.
3. Work from the published claim in a separate branch or worktree when sessions share a checkout. Keep your row current if scope or dependencies change. For a blocked item, record the blocker and whether ownership is retained. Confirm a handoff with the current owner before taking over their claim. If nobody can confirm a stale claim, leave a note for the coordinating session.
4. When the deliverable meets its acceptance criteria, publish **Done** with the commit or PR and verification. Then fetch the register and claim the next ready item. If an item is released unfinished, set it to **Ready** and record the remaining work and its branch or commit.

## PR #51 task register

| Task | Status | Owner and branch | Scope or evidence |
| --- | --- | --- | --- |
| Preserve the QSE statement reconciliation in the delivery branch | Done | WC-TR coordination, PR #51 | Integrate `main` at `32c289aa`, which contains merged PR #53. |
| Protect linked independent installment receipts from generic edits and deletions | Done | WC-TR coordination, PR #51 | Shared transfer actions, bank account changes and loan deletion. Cash, Bank and card fixtures passed with the full suite. |
| Coordinate reversal with the funding ledger | Ready | | Depends on linked-receipt protection and atomic payment persistence. |
| Build atomic multi-workbook payment persistence | Ready | | Native pending record, linkage, execution history and replay protection. |
| Complete scheduled-payment and settlement lifecycle | Ready | | Depends on atomic payment persistence. |
| Add standalone subscription renewals to planned movement | Done | WC-TR coordination, PR #51 | Shared Upcoming funding checks and dashboard scope. Tests cover active and archived funding, cancelled subscriptions, and the Money in/out breakdown and record detail. |
| Keep installment funding visible when its linked receipt is missing | In progress | WC-TR coordination, `work/pr51-main-integration`, 2026-11-18 UTC | Canonical Cash, Bank and card movement deduplication when cloud records arrive separately. |
| Finish remaining canonical reporting adapters and drilldowns | Ready | | Other standalone schedules, allocation drilldowns and source-scope acceptance. |
| Finish currency budget workflows | Ready | | Bulk definition edits, source identity and planned reservations. |
| Continue UI-to-service migration | Ready | | Claim one named module and workflow at a time. |
| Complete UX acceptance | Ready | | Claim one module or a specific shared control at a time. |
| Final PR validation and merge | Ready | | Depends on the remaining acceptance checks and exact-head CI. |
