# Irregular installment payments — required model

User reference received 2026-11-07. This supersedes any assumption that one repayment equals one installment or that elapsed installments were paid. Implementation is not complete.

Workbook inspection and continuation: the user confirmed that the disputed payment-sheet date should be 4 June 2025, matching the schedule, rather than 2027. Original workbook remains unchanged. Other one-day payment-date differences between sheets still require review before import.

Implemented continuation: CalculationEngine.installmentLedger now supports independent same-day receipts, oldest-first partial/multiple allocation, explicit manual splits with unapplied remainder, arrears, future-obligation advance and excess credit. Monthly data fills calendar gaps and distinguishes future actual values from zero. New Contract & payments UI provides reviewed contract adoption/editing, independent payment entry/editing, manual allocation using the shared dropdown, chronological actual/scheduled event report, primary/supporting shared summary cards, shared interactive charts and matching monthly tables. Services validate auth, reviewed snapshots, dates/currencies/identities/amounts/allocations; linked payment edits use the existing linked workflow rather than silently changing one side.

Persistence is backward-compatible: optional contractSchedule/paymentAllocations on the native loan; paymentOnly on independent receipts; legacy month is zero for new unassigned payments. Existing loans are not silently converted. With an adopted contract, store receipt add/edit/delete no longer overwrites contractual installmentOverrides. Reviewed adoption preserves native receipt IDs and legacy overrides. Net-worth current/historical valuation and forecasts use actual contract remaining; open obligation amounts and dates drive allocation-aware plans/upcoming. Source plan IDs, routing/project/category metadata and fulfilled history survive refresh. Bank/Cash Mark done creates a deterministic linked native EMI receipt; movement deduplication retains one economic event and its plan/category provenance. A fulfilled partial installment retains history and leaves a new open remainder. Local rollback is not cloud atomicity.

Validation: 10 focused files / 93 tests passed (independent-emi-checkpoint-tests.log), including independent payment UI, manual allocation validation, Bank/Cash linkage/deduplication, partial-plan remainder, date boundaries and stock statement-reader parity after extraction of a bounded shared XLSX reader. independent-emi-checkpoint-final-build.log passed both TypeScript projects and Vite. Browser reached the host-served EMI page, opened Contract & payments and its draft review, then cancelled without saving. The default sandbox server was unreachable from the browser; host Vite server is running via the authorized dev command. No real user data was adopted, imported or edited. Resulting-head full CI remains required.

## Practical product taxonomy and researched limits

Research checked 2026-11-07. These primary US consumer/lender sources inform product distinctions; they are not asserted as Qatar/Pakistan legal rules or as terms for this user's agreement.

- Fixed contractual total / installment purchase: booking plus regular, additional/replacement major and final balloon obligations; irregular dated receipts and allocation ledger are supported by the new model.
- Simple-interest bank loan: actual timing changes interest and principal application. A fixed-total subtraction is not an actual bank principal balance. See [CFPB: simple versus precomputed interest](https://www.consumerfinance.gov/ask-cfpb/whats-the-difference-between-a-simple-interest-rate-and-precomputed-interest-on-an-auto-loan-en-841/) and [Chase: final loan payment](https://www.chase.com/personal/auto-loans/servicing/faqs/final-loan-payment).
- Partial/suspense payments and advance installments differ from principal-only prepayment. Keep allocation policy explicit instead of assuming every surplus advances the due date or reduces principal. See [CFPB: payment application](https://www.consumerfinance.gov/ask-cfpb/is-it-better-to-pay-off-the-interest-or-principal-on-my-auto-loan-en-845/) and [CFPB: servicing and partial payments](https://www.consumerfinance.gov/consumer-tools/mortgages/your-mortgage-servicer-must-comply-with-federal-rules/).
- Late fees, refunds/reversals, variable-rate resets, grace periods, prepayment charges, rescheduling/recasting, settlement discounts and write-offs need distinct dated facts/policies. Never synthesize charges or change principal from a generic schedule assumption. Interest/accrual and these contract-specific policies remain separate implementation work; existing interest schedules stay estimates until supported by actual ledger components or the agreed lender policy.

Still pending: ordinary archive recovery UI, linked card-charge funding semantics, reversals/refunds, allocation recovery for malformed imports/external edits, export/period/accessibility/theme/mobile parity, lender-specific actual interest handling, complete legacy UI/service migration and transaction-safe remote repositories. These are not completion claims for the wider app backlog.

Reviewed import continuation: the lazy-loaded reconciliation dialog now reads XLSX/CSV locally, selects one worksheet explicitly, preserves actual source row identity, checks declared summary totals, previews contractual obligations and positive actual receipts, and shows alternate-worksheet sequence/date differences without merging or guessing. Applying requires acknowledgement, typed loan name, sign-in and a final review confirmation. Commands recheck the loan and receipt snapshot, current links and budget references; existing fines cannot disappear when the source has no Fine column. Schedule-only input cannot erase an existing receipt ledger. Originals are deep-copied into optional EMIWorkbook.reconciliationHistory, outside active calculations. Identical repeat imports are no-ops; linked real transactions are not rewritten to force a match. Open planning intents refresh through the existing independent-contract service with local rollback.

Import verification: installment-import-ui-tests.log passed 7 files / 27 tests, including file selection, preview, acknowledgement/typed confirmation and fixture replacement with archived originals. installment-import-final-build.log passed both TypeScript projects and production build. Browser loaded the supplied workbook locally, verified selected-sheet totals and all three date discrepancies, then cancelled. No user import was applied. Private source/proof files remain uncommitted. Continue normal archive recovery UI and remaining edge cases.

## Separate facts

- Contract events: booking, regular installments, additional/replacement major installments, final balloon; each has a stable ID, due date and amount. Booking is installment zero, not regular installment one. Major events need their own identities rather than fractional installment indices.
- Actual payments: independent IDs, actual dates and amounts; any number on the same day or against the same installment. Never overwrite a payment because another exists in that month. Recording a payment must not rewrite the contract schedule.
- Allocations: explicit amounts linking payments to obligations. Default oldest-due-first, including partial allocations; retain unapplied credit when payments exceed available obligations. Allow reviewed manual allocations. A payment can cover several obligations; several payments can cover one obligation.
- Reversals/refunds: dated linked events, not silent deletion or negative schedule overrides. Fines remain separate from contractual debt and require explicit treatment.

## Reference report

Show scheduled date/description/amount alongside actual payment date/amount, cumulative scheduled due, cumulative actual paid, overdue balance, advance credit, actual contractual remaining and expected scheduled remaining. Merge obligation and payment events chronologically with stable same-day ordering. Include month summary and contributing allocations. Missing payment is zero paid, not a tiny synthetic amount.

At an as-of date, actual remaining = contractual total minus eligible dated actual payments (excluding separate fines); scheduled remaining = contractual total minus amounts scheduled through that date. Arrears = max(cumulative due minus allocated payments covering due obligations, 0). Advance/unapplied credit must be shown separately. Future-dated payments do not count as paid today. No cross-currency totals.

For interest-bearing bank loans, use contractual lender rules for accrual/day count, payment application order and prepayment effects. Do not apply the fixed-total formula as an actual-interest balance or invent penalties.

## Source conflict requiring reconciliation

The supplied workbook and earlier app backup disagree on receipt amounts and dates. Numeric reconciliation evidence stays in ignored local proof files, not repository documentation. Earlier remaining was backup-based. Do not silently overwrite history or claim reconciliation until the selected source has been reviewed.

## Implementation order

1. Introduce immutable contract events and independent payment/allocation types behind CalculationEngine and services.
2. Add conservation/partial/late/advance/same-day/reversal/date-boundary tests.
3. Remove store coupling that writes repayment amounts into installmentOverrides; preserve legacy IDs and links through an explicit reviewed migration. Tiny placeholder records and generated future repayments require review, not automatic correction.
4. Add independent payment entry and allocation review; support multiple payments per installment.
5. Replace elapsed-row statuses and present the reference event report with actual versus scheduled balances, arrears and credit.
6. Reconcile against a complete user-approved ledger, then propagate the same results to dashboard, net worth, plans, charts and exports. Preserve source identity and prevent linked Bank/Cash payments from being counted twice.

The current month-keyed EMIRepayment/store design and schedule-coupled editing do not satisfy this model. Keep PR 51 draft until the wider acceptance requirements are met.
