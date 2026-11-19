import { useMemo } from 'react';
import { CalculationEngine } from '../../lib/calc/CalculationEngine';
import { useEMIWorkbookStore } from '../../store/emiWorkbookStore';
import { todayISODate } from '../../lib/datetime';

/** Native repayments own actual balances; schedules remain explicit estimates. */
export function useEmiSummaryReadModel() {
  const workbook = useEMIWorkbookStore(state => state.workbook);
  const asOf = todayISODate();
  return useMemo(() => new Map(workbook.entries.map(loan => [loan.id,
    CalculationEngine.emi.emiRepaymentSummary(loan, workbook.repayments, asOf),
  ])), [workbook, asOf]);
}

export type EmiSummaryViewModel = ReturnType<typeof CalculationEngine.emi.emiRepaymentSummary>;
export function getEmiPeriodSummary(...input: Parameters<typeof CalculationEngine.emi.emiPeriodSummary>) {
  return CalculationEngine.emi.emiPeriodSummary(...input);
}
export function getEmiSummaryTotals(models: ReadonlyMap<string, EmiSummaryViewModel>, loans: readonly { id: string; currencyCode: string }[]) {
  const totals: Record<string, { monthlyInstallment: number; outstanding: number; paidSoFar: number }> = {};
  for (const loan of loans) {
    const summary = models.get(loan.id);
    if (!summary) continue;
    const row = totals[loan.currencyCode] ??= { monthlyInstallment: 0, outstanding: 0, paidSoFar: 0 };
    row.monthlyInstallment += summary.emi;
    row.outstanding += summary.outstanding;
    row.paidSoFar += summary.paidSoFar;
  }
  return totals;
}
