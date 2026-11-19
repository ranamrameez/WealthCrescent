# Organize

Add a sidebar parent named **Organize** with two child pages.

## Suggested links

Show the original payment, the candidate entity and occurrence, and the reasons for the match. Include the payment date, amount, and currency. Offer **Accept** and **Reject** for each candidate and keep ambiguous matches together for review.

- Queue a scan after a native transaction is saved or imported. Provide **Scan now** and an inbox shortcut in the global toolbar. The optional popup and dedicated inbox use the same account-scoped queue. Turning off popups still leaves the inbox active.
- Use normalized description terms, category identity, renewal date, currency, and amount. Preserve clues such as a masked number in a subscription and the same suffix in a card description. Display the existing descriptions and match reasons without exposing additional phone data.
- Scan subscription payments from card charges, Bank outflows and Cash outflows. Also scan Bank transfers, Cash movements, card repayments and investment cash transfers through explicit native adapters. Match descriptions, categories, account and broker names, keywords and masked identifier fragments. Keep multiple plausible peers pending for review. Approval joins existing records without duplicating them.
- Keep the native ledger record and any existing transfer link. Acceptance records reviewed subscription provenance on the existing payment, using the correct occurrence. It must preserve the payment timestamp, source, category, and other ledger values. Do not create a second payment or move the subscription anchor when accepting a historical match.
- Scope suggestion identity to account, source, native record, entity, and occurrence. Make repeat scans and accepts idempotent. Persist rejection for the reviewed candidate. Revalidate ownership, the transaction, entity, and occurrence at approval and identify competing links before applying a change.
- Keep matching and review independent of budgets and cleared cash totals. Use reviewed provenance for reporting without counting a payment twice.

## Categories

Move the existing category management workflow from Account to a dedicated page, with a link from Account for discoverability. Reuse the shared category registry, custom-category actions, and category groups.

- Select a category to show its native transactions across supported modules by category ID. Apply date and source filters to the list and keep each currency separate.
- Open the owning record or its native view from the results. Show same-name categories separately and preserve the existing rules for built-in categories, merges, and legacy uncategorized entries.
- Keep the transaction view read-only and use the existing category edit and merge actions for category changes.

Track implementation and verification in the shared delivery register.
