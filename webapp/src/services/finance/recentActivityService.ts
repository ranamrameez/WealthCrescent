import { CalculationEngine } from '../../lib/calc/CalculationEngine';
import { useCashWorkbookStore } from '../../store/cashWorkbookStore';
import { useBankWorkbookStore } from '../../store/bankWorkbookStore';
import { useRentalsWorkbookStore } from '../../store/rentalsWorkbookStore';
import { useCreditCardWorkbookStore } from '../../store/creditCardWorkbookStore';
import { usePersonalLoansWorkbookStore } from '../../store/personalLoansWorkbookStore';
import { useEMIWorkbookStore } from '../../store/emiWorkbookStore';
import { useFundsWorkbookStore } from '../../store/fundsWorkbookStore';
import { useWorkbookStore } from '../../store/workbookStore';
import { usePSXWorkbookStore } from '../../store/psxWorkbookStore';
const listeners = new Set<() => void>();
let snapshot: ReturnType<typeof CalculationEngine.recentActivity.recentTransactions> | undefined;
function invalidate() { snapshot = undefined; listeners.forEach(listener => listener()); }
for (const source of [useCashWorkbookStore, useBankWorkbookStore, useRentalsWorkbookStore, useCreditCardWorkbookStore, usePersonalLoansWorkbookStore, useEMIWorkbookStore, useFundsWorkbookStore, useWorkbookStore, usePSXWorkbookStore]) source.subscribe(invalidate);
export function subscribeRecentTransactions(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function getRecentTransactions() {
  return snapshot ??= CalculationEngine.recentActivity.recentTransactions({
    cash: useCashWorkbookStore.getState().workbook.entries, bank: useBankWorkbookStore.getState().workbook,
    rentals: useRentalsWorkbookStore.getState().workbook, cards: useCreditCardWorkbookStore.getState().workbook,
    personalLoans: usePersonalLoansWorkbookStore.getState().workbook, emi: useEMIWorkbookStore.getState().workbook,
    funds: useFundsWorkbookStore.getState().workbook, qse: useWorkbookStore.getState().workbook, psx: usePSXWorkbookStore.getState().workbook,
  });
}
