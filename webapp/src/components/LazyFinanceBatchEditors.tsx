import { lazy, Suspense, type ComponentProps, type ReactNode } from 'react';
import type * as Editors from './FinanceBatchEditors';

const BankTransactions = lazy(() => import('./FinanceBatchEditors').then(module => ({ default: module.BankTransactionsBatchEditor })));
const BankPlans = lazy(() => import('./FinanceBatchEditors').then(module => ({ default: module.BankPlansBatchEditor })));
const LoanPayments = lazy(() => import('./FinanceBatchEditors').then(module => ({ default: module.LoanPaymentsBatchEditor })));
const LoanPlans = lazy(() => import('./FinanceBatchEditors').then(module => ({ default: module.LoanPlansBatchEditor })));

function Loading({ children }: { children: ReactNode }) {
  return <Suspense fallback={<p role="status">Loading batch editor…</p>}>{children}</Suspense>;
}
export function BankTransactionsBatchEditor(props: ComponentProps<typeof Editors.BankTransactionsBatchEditor>) {
  return <Loading><BankTransactions {...props} /></Loading>;
}
export function BankPlansBatchEditor(props: ComponentProps<typeof Editors.BankPlansBatchEditor>) {
  return <Loading><BankPlans {...props} /></Loading>;
}
export function LoanPaymentsBatchEditor(props: ComponentProps<typeof Editors.LoanPaymentsBatchEditor>) {
  return <Loading><LoanPayments {...props} /></Loading>;
}
export function LoanPlansBatchEditor(props: ComponentProps<typeof Editors.LoanPlansBatchEditor>) {
  return <Loading><LoanPlans {...props} /></Loading>;
}
