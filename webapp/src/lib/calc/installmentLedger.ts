import { validBatchDate } from '../dateValidation';

export interface InstallmentObligation { id: string; dueDate: string; amount: number; currency: string; description: string; }
export interface InstallmentPayment { id: string; date: string; amount: number; currency: string; }
export interface InstallmentAllocation { paymentId: string; obligationId: string; amount: number; }

/** Fixed contractual totals only. Independent payments can span obligations;
 * multiple payments may cover one obligation. No schedule mutation or accrual. */
export function reconcileInstallments(obligations: readonly InstallmentObligation[], payments: readonly InstallmentPayment[], currency: string, asOf: string, explicit: readonly InstallmentAllocation[] = []) {
  if (!validBatchDate(asOf)) throw new Error('Invalid reporting date.');
  for (const rows of [obligations, payments]) {
    const ids = new Set<string>();
    for (const row of rows) {
      if (!row.id || ids.has(row.id)) throw new Error('Duplicate or missing record identity.');
      ids.add(row.id);
      if (row.currency !== currency) throw new Error('Currencies must be reconciled separately.');
      if (!Number.isFinite(row.amount) || row.amount < 0) throw new Error('Amounts must be finite and nonnegative. Reversals require explicit handling.');
      if (!validBatchDate('dueDate' in row ? row.dueDate : row.date)) throw new Error('Invalid ledger date.');
    }
  }
  const ordered = obligations.map((row, index) => ({ ...row, index, paid: 0 })).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.index - b.index);
  const explicitKeys = new Set<string>();
  for (const allocation of explicit) {
    const key = JSON.stringify([allocation.paymentId, allocation.obligationId]);
    if (explicitKeys.has(key)) throw new Error('Duplicate payment allocation.');
    explicitKeys.add(key);
    if (!payments.some(row => row.id === allocation.paymentId) || !ordered.some(row => row.id === allocation.obligationId)) throw new Error('Allocation refers to a missing payment or obligation.');
    if (!Number.isFinite(allocation.amount) || allocation.amount <= 0) throw new Error('Allocation amount must be positive.');
  }
  const eligible = payments.map((row, index) => ({ ...row, index })).filter(row => row.date <= asOf).sort((a, b) => a.date.localeCompare(b.date) || a.index - b.index);
  const allocations: { paymentId: string; obligationId: string; amount: number }[] = [];
  let unappliedCredit = 0;
  for (const payment of eligible) {
    let remaining = payment.amount;
    const manual = explicit.filter(row => row.paymentId === payment.id);
    if (manual.length) {
      for (const allocation of manual) {
        const obligation = ordered.find(row => row.id === allocation.obligationId)!;
        if (allocation.amount - remaining > 0.0000001 || allocation.amount - (obligation.amount - obligation.paid) > 0.0000001) throw new Error('Allocation exceeds the payment or obligation remainder.');
        remaining -= allocation.amount; obligation.paid += allocation.amount;
        allocations.push({ ...allocation });
      }
      unappliedCredit += Math.max(0, remaining);
      continue;
    }
    for (const obligation of ordered) {
      const amount = Math.min(remaining, Math.max(0, obligation.amount - obligation.paid));
      if (amount <= 0) continue;
      obligation.paid += amount;
      remaining -= amount;
      allocations.push({ paymentId: payment.id, obligationId: obligation.id, amount });
      if (remaining <= 0) break;
    }
    unappliedCredit += remaining;
  }
  const rows = ordered.map(({ index: _index, ...row }) => ({ ...row, remaining: Math.max(0, row.amount - row.paid), status: row.paid >= row.amount ? 'paid' : row.paid > 0 ? 'partial' : row.dueDate <= asOf ? 'overdue' : 'scheduled' }));
  const contractualTotal = obligations.reduce((sum, row) => sum + row.amount, 0);
  const actualPaid = eligible.reduce((sum, row) => sum + row.amount, 0);
  if (!Number.isFinite(contractualTotal) || !Number.isFinite(actualPaid)) throw new Error('Ledger totals exceed supported numeric values.');
  const scheduledDue = obligations.filter(row => row.dueDate <= asOf).reduce((sum, row) => sum + row.amount, 0);
  const overdue = rows.filter(row => row.dueDate <= asOf).reduce((sum, row) => sum + row.remaining, 0);
  const advance = rows.filter(row => row.dueDate > asOf).reduce((sum, row) => sum + row.paid, 0) + unappliedCredit;
  let cumulativeScheduled = 0, cumulativePaid = 0;
  const events = [
    ...obligations.map((row, index) => ({ id: row.id, date: row.dueDate, description: row.description, kind: 'obligation' as const, amount: row.amount, index })),
    ...payments.map((row, index) => ({ id: row.id, date: row.date, description: 'Payment', kind: 'payment' as const, amount: row.amount, index })),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? a.index - b.index : a.kind === 'obligation' ? -1 : 1)).map(event => {
    if (event.kind === 'obligation') cumulativeScheduled += event.amount;
    else if (event.date <= asOf) cumulativePaid += event.amount;
    return { ...event, future: event.date > asOf, cumulativeScheduled, cumulativePaid, actualRemaining: Math.max(0, contractualTotal - cumulativePaid), scheduledRemaining: Math.max(0, contractualTotal - cumulativeScheduled), pending: cumulativeScheduled - cumulativePaid };
  });
  return { currency, asOf, contractualTotal, actualPaid, scheduledDue, actualRemaining: Math.max(0, contractualTotal - actualPaid), scheduledRemaining: Math.max(0, contractualTotal - scheduledDue), overdue, advance, unappliedCredit, rows, allocations, events, dueCount: rows.filter(row => row.dueDate <= asOf).length, futureCount: rows.filter(row => row.dueDate > asOf).length, lastDueDate: rows.at(-1)?.dueDate ?? null, futurePaymentCount: payments.length - eligible.length };
}

export function installmentMonthlySummary(report: ReturnType<typeof reconcileInstallments>) {
  const months = [...report.events.map(row => row.date.slice(0, 7)), report.asOf.slice(0, 7)].sort();
  const number = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
  const first = number(months[0]), last = number(months.at(-1)!);
  const start = Math.max(first, last - 1199);
  const rows = [];
  for (let index = start; index <= last; index++) {
    const month = `${Math.floor(index / 12).toString().padStart(4, '0')}-${String(index % 12 + 1).padStart(2, '0')}`;
    const future = month > report.asOf.slice(0, 7);
    const scheduled = report.events.filter(row => row.kind === 'obligation' && row.date.startsWith(month)).reduce((sum, row) => sum + row.amount, 0);
    const actual = report.events.filter(row => row.kind === 'payment' && !row.future && row.date.startsWith(month)).reduce((sum, row) => sum + row.amount, 0);
    const paidToDate = report.events.filter(row => row.kind === 'payment' && !row.future && row.date.slice(0, 7) <= month).reduce((sum, row) => sum + row.amount, 0);
    const dueToDate = report.events.filter(row => row.kind === 'obligation' && row.date.slice(0, 7) <= month).reduce((sum, row) => sum + row.amount, 0);
    rows.push({ month, scheduled, actual: future ? null : actual, actualRemaining: future ? null : Math.max(0, report.contractualTotal - paidToDate), scheduledRemaining: Math.max(0, report.contractualTotal - dueToDate) });
  }
  return { rows, truncated: start > first };
}
