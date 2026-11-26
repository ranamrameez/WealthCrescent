# Backend delivery register

Use the [common claim and merge workflow](../webapp/docs/MULTI_AGENT_WORKFLOW.md). The following IDs are the existing cross-platform backend claims.

| Claim | Delivery focus |
| --- | --- |
| `account-backup` | Implement versioned account recovery, pre-change snapshots and scheduled checks. See [account backup strategy](../webapp/docs/account-backup-strategy.md). Production activation is pending. |
| `audit-data-access` | Inventory deployed access rules and every client path. Verify owner isolation, then publish route migration order. |
| `backend-foundation` | Extend Firebase Functions with authenticated, versioned private data APIs for web and Android. Publish fixtures and error, retry and conflict contracts. |
| `backend-migration` | Claim one workflow per PR. Move private data and authoritative calculations behind the API, stage both clients, then close direct database access after cutover verification. |
| `payment-persistence` / `payment-scheduling` | Verify ledger atomicity, rules, backup and recovery before activation. Pending scheduling never moves real money. |
| `audit-data-protection` | Track account separation, retention, deletion, export/restore and private logging across the API and both clients. |

Use [priority work and audits](../webapp/docs/MULTI_AGENT_WORKFLOW.md#priority-work-and-app-wide-audits) for acceptance criteria. Record affected web and Android clients in API PRs. Keep production rollouts compatible with deployed clients and verify their migration before disabling a legacy path.

- [PSX market-price recovery](PSX_PRICE_FEED.md) tracks the backend provider engine and production activation.
