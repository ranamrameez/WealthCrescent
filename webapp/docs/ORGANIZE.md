# Organize

Add a sidebar parent named **Organize** with two child pages.

## Requested workflow audit — 2026-11-19

| Requirement | Existing or added implementation |
| --- | --- |
| Log transactions, subscriptions, card payments, bank and investment transfers | Native Cash, Banking/Cards, Subscriptions, Transfers, QSE/PSX and Funds ledgers remain the source of truth. |
| Scan descriptions, categories, account names, phone fragments and keywords | Subscription renewal matcher plus native transfer adapters and CalculationEngine.linkSuggestions. Scans run after ledger changes while the app is open. |
| Review popup from every page and manual scan | Global toolbar Suggested links and Scan now; optional new-suggestion popup shares the same inbox. |
| Dedicated approve/reject page | Organize → Suggested links reviews existing records and explains each match. |
| Categories under the same navigation parent | Organize → Categories reuses category CRUD, groups and merge actions. |
| Click a category to see its transactions | Exact category-ID drilldown, source/date filters, currency-separated native links. |
| Reuse the workflow for new transactions | Debounced subscriptions to all supported native stores plus explicit rescans. |
| Phone recharge every 28 days | Custom subscription cycle with customDays = 28; existing recurrence engine and review regression exercise the next renewal. |
| Keep ambiguous matches pending | Scanner returns all eligible peers; only a reviewed Accept writes provenance or a link. |

The transfer scanner conservatively excludes invalid fees and malformed duplicate native IDs. It proposes supported same-currency pairs rather than guessing an exchange rate. Background scanning means in-app observation; it does not imply an offline server scanner or real money movement. Popup and rejected-candidate preferences are local to each signed-in account on this device. Storage failure leaves a rejection pending and reports the error.

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


## Implemented scanner boundaries

Transfer review covers Bank/Cash pairs, Bank-to-Bank transfers, Bank/Cash card repayments, Bank-to-QSE/PSX cash transfers, and Bank/Cash-to-Funds cash transfers in either supported direction. It requires cleared records with the same currency and cent-rounded gross amount, posting dates within three days, and meaningful identifier, keyword, account/broker-name or category evidence. Unsupported pairs and cross-currency/fee-adjusted amounts remain available through manual transfer review. Approval writes only the link record; it never rewrites either native ledger. Active broker snapshots are scanned once, with inactive profiles isolated by source. Live background scans run while the app is open. Rejections and popup preference are account-scoped on the current device.
