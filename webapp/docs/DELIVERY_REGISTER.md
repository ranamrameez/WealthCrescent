See [Statement imports and repeat transfers](STATEMENT_IMPORTS.md) for supported formats, module coverage, and follow-up work.

# Web frontend delivery register

Use the [common claim and merge workflow](MULTI_AGENT_WORKFLOW.md). The [follow-up groups](MULTI_AGENT_WORKFLOW.md#follow-up-groups) and [priority audits](MULTI_AGENT_WORKFLOW.md#priority-work-and-app-wide-audits) retain the web task IDs and acceptance criteria.

| Work | Claim IDs and ownership |
| --- | --- |
| Access | `auth-google-recovery` owns web sign-in. Native Google sign-in is tracked separately under [Android](../../android/DELIVERY_REGISTER.md). |
| UX and parity | `organize-search`, `ux-acceptance`, `audit-ui-ux`, `audit-page-parity` and `trading-acceptance` cover named screens or controls. Use the [shared design references](../../docs/PAGE_TEMPLATE_GUIDE.md). |
| Financial workflows | `movement-reporting`, `budget-acceptance`, `installment-recovery`, `funding-reversals`, `audit-calculations` and `module-services` cover named functional slices. |
| Data integration and reliability | `backend-migration` web slices consume the shared API. Coordinate cutover with the [backend register](../../functions/DELIVERY_REGISTER.md). Claim web reliability work under `audit-reliability-performance`. |
| QSE statement import data integrity | [`qse-import-data-integrity`](qse-import-data-integrity.md) has verified snapshots and partial recovery evidence. Reward protection is merged. Broader implementation still requires explicit approval. |

Publish the PR under the listed claim ID so the central workflow and platform registers point to the same work.
