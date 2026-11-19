# EMI and installment agreements

Updated 2026-11-06. Applies to the current working implementation; release acceptance is recorded in SESSION_HANDOFF.md.

## Two agreement cases

- Bank loan: enter the financed principal, an agreement date, the first installment date, installment count and rate or fixed repayment total. Advance is normally zero. Schedule-estimate tracking remains available when complete actual repayment history has not been recorded.
- Property or other installment purchase: choose total price before booking. Financed principal is price minus booking, exactly once. Alternatively enter an already financed principal and keep booking as separate metadata. Fixed-total installment repayments exclude booking. A booking amount does not create an actual Cash/Bank transaction.

Booking/agreement date and first installment date are separate. New explicit first dates mean installment one is due on exactly that date. Later dates follow the selected interval in calendar months; an optional later-payment day clamps at month end. Legacy loans without an explicit first date retain startDate plus one monthly interval, including month-end behavior. The persisted tenureMonths field retains its legacy name but is the installment count; installmentIntervalMonths defaults to one. Interest uses the corresponding periodic rate. No dependency or appearance mode was added.

Bigger installments repeat after N installment occurrences and can replace the regular installment or add to it. Optional final reconciliation closes the scheduled remainder. Generating a schedule never creates EMIRepayment records. Existing future-dated records produced by older workflows are preserved and flagged; they are not silently migrated/deleted or counted as paid today.

## Recorded balances versus estimates

CalculationEngine.emi.emiRepaymentSummary reconciles native repayment records against schedule overrides without modifying either. For fixed-total recorded tracking, remaining = contractual installment total minus dated repayments through the reporting date, clamped at zero; excess payment is separate. Fines do not reduce debt. Future-dated repayments do not reduce today's remaining or increase today's paid total. Schedule overrides and elapsed dates do not prove payment.

Legacy fixed-total loans with a repayment ledger default to recorded tracking; legacy loans without one retain explicitly labelled schedule estimates. Users can explicitly choose recorded tracking when their ledger is complete, including an empty ledger representing no payments, or scheduled tracking for estimates. Interest-bearing principal remains a schedule estimate pending a proper actual-interest/accrual model; a recorded-interest balance is not fabricated.

EMI detail/list/aggregate and current/historical net-worth valuation use the same supplied native repayment ledger and tracking policy. Future forecasts start from recorded fixed-total outstanding and apply only future scheduled payments, capped at remaining debt. Past unrecorded installments remain debt; projections cannot create negative debt after a prepayment. Legacy engine callers omitting repayment input retain their schedule-only contract. Include-in-Net-Worth remains authoritative.

The payment log shows actual payment dates and flags future-dated records. Schedule cumulative payment/balance columns are explicitly labelled scheduled. Paid row status requires a dated actual repayment, not merely an elapsed due date. Differences between override amounts and the repayment ledger are surfaced for review.

## Save and plan refresh

Authenticated saveEmiLoan checks the reviewed snapshot, validates terms through CalculationEngine, and refreshes open generated installment plans. Bank/Cash/Card plan IDs, routing, descriptions, categories and projects survive schedule changes. Completed/cancelled history and real repayments are unchanged. A shortened schedule removes only now-inapplicable open plans; recorded repayment months cannot be dropped. New future installments use deterministic IDs on the linked bank account. Repeated saves do not duplicate them. Explicit bank relinking refreshes bank routing while preserving explicitly rerouted Cash/Card plans.

Reject stale/signed-out saves, invalid numbers/dates, incompatible default bank accounts, duplicate occurrence plans, source plans without valid installment identity, independent recurrence on a generated installment and open plans already linked to native ledger records. Local failures restore touched workbooks. This is local rollback, not an atomic cloud transaction; existing whole-workbook sync still blocks backend auto-pay release.

## Remaining work

- Full EMI UI-to-service migration, including actual repayment editing/linking/deletion and schedule analytics/export parity.
- Separate schedule-only per-occurrence amount/date editor; existing explicit repayment actions still record actual ledger entries and must be labelled clearly.
- Explicit, reviewed correction/migration tools for historical generated future repayments and inconsistent imported overrides. Never infer or rewrite private history automatically.
- Actual interest/accrual and partial-payment allocation policy before presenting an interest-loan ledger balance.
- Dedicated booking-payment linkage and separate non-monthly calendar recurrence beyond the supported month interval, if required.
- Remote transaction-safe persistence, pending settlement/void, scheduler history and all theme/mobile/keyboard acceptance remain governed by the wider delivery checklist.
