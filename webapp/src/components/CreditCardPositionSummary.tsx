import { BalanceSummaryCards } from './BalanceSummaryCards';
import { useCreditCardWorkbookStore } from '../store/creditCardWorkbookStore';
import { usePlannedCreditCardWorkbookStore } from '../store/plannedCreditCardWorkbookStore';
import { useCategoryStore } from '../store/categoryStore';
import { categoryName } from '../lib/categories';
import { outstandingBalanceByCard } from '../lib/calc/creditCardModule';
import { planOccurrences } from '../lib/calc/planOccurrences';
import type { CreditCard } from '../types/creditCard';
import type { PlannedCreditCardTransaction } from '../types/plannedCreditCard';
import type { TransactionPageFilters } from '../hooks/useUrlTransactionFilters';

export function CreditCardPositionSummary({ card, filters, plansOverride }: { card: CreditCard; filters: TransactionPageFilters; plansOverride?: PlannedCreditCardTransaction[] }) {
  const transactions=useCreditCardWorkbookStore(s=>s.workbook.transactions);
  const plans=usePlannedCreditCardWorkbookStore(s=>s.workbook.entries);
  const categories=useCategoryStore(s=>s.workbook.categories);
  const inPeriod=(date:string)=>(!filters.fromDate||date>=filters.fromDate)&&(!filters.toDate||date<=filters.toDate);
  const matches=(payment:boolean)=>filters.direction==='all'||(filters.direction==='in'?payment:!payment);
  const rows=transactions.filter(tx=>tx.cardId===card.id&&inPeriod(tx.date)&&matches(tx.kind==='payment')&&(filters.source==='all'||(tx.source??'manual')===filters.source)&&(filters.category==='all'||categoryName(tx.categoryID,categories)===filters.category));
  const planned=planOccurrences(plansOverride??plans,filters.fromDate,filters.toDate,new Date(),null).filter(plan=>plan.cardId===card.id&&!plan.executed&&matches(plan.kind==='payment')&&filters.source!=='statement-import'&&(filters.category==='all'||plan.category===filters.category));
  return <BalanceSummaryCards kind="creditCard" currency={card.currencyCode} summary={{
    start:outstandingBalanceByCard(card,transactions.filter(tx=>filters.fromDate&&tx.date<filters.fromDate)),
    current:outstandingBalanceByCard(card,transactions.filter(tx=>!filters.toDate||tx.date<=filters.toDate)),
    inflow:rows.filter(tx=>tx.kind!=='payment').reduce((sum,tx)=>sum+tx.amount,0),outflow:-rows.filter(tx=>tx.kind==='payment').reduce((sum,tx)=>sum+tx.amount,0),
    pendingInflow:0,pendingOutflow:0,
    plannedInflow:planned.filter(plan=>plan.kind!=='payment').reduce((sum,plan)=>sum+plan.amount,0),plannedOutflow:-planned.filter(plan=>plan.kind==='payment').reduce((sum,plan)=>sum+plan.amount,0),
  }} />;
}
