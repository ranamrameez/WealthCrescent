import { CreditCardPositionSummary } from './CreditCardPositionSummary';
import { useCreditCardWorkbookStore } from '../store/creditCardWorkbookStore';
import { usePlannedCashWorkbookStore } from '../store/plannedCashWorkbookStore';
import type { PlannedCreditCardTransaction } from '../types/plannedCreditCard';
import { CashAccountSummary, filterCashEntries } from '../features/cash/pages/CashPage';
import { BankingScopeSummary } from '../features/bank/pages/BankPage';
import { RentalAccountSummary, filterRentalEntries } from '../features/rentals/pages/RentalsPage';
import { useCashWorkbookStore } from '../store/cashWorkbookStore';
import { useBankWorkbookStore } from '../store/bankWorkbookStore';
import { useRentalsWorkbookStore } from '../store/rentalsWorkbookStore';
import { useCategoryStore } from '../store/categoryStore';
import type { TransactionPageFilters } from '../hooks/useUrlTransactionFilters';
import type { PlanRecord } from '../lib/financePlans';
import type { PlannedCashEntry } from '../types/plannedCash';
import type { PlannedBankTransaction } from '../types/plannedBank';
import type { PlannedRentalEntry } from '../types/plannedRentals';

/** Reuses the account summaries so actual and expected figures follow the same rules. */
export function PlanningPositionSummary({ filters, scope }: { filters: TransactionPageFilters; scope?: PlanRecord[] }) {
  const cards = useCreditCardWorkbookStore(s=>s.workbook.cards);
  const allCashPlans = usePlannedCashWorkbookStore(s=>s.workbook.entries);
  const cash = useCashWorkbookStore(s=>s.workbook.entries);
  const accounts = useBankWorkbookStore(s=>s.workbook.settings.accounts);
  const rentals = useRentalsWorkbookStore(s=>s.workbook);
  const categories = useCategoryStore(s=>s.workbook.categories);
  const cashPlans = scope?.filter(row=>row.module==='cash').map(row=>row.plan as PlannedCashEntry);
  const bankPlans = scope?.filter(row=>row.module==='bank').map(row=>row.plan as PlannedBankTransaction);
  const rentalPlans = scope?.filter(row=>row.module==='rentals').map(row=>row.plan as PlannedRentalEntry);
  const codes = [...new Set(scope ? cashPlans?.map(plan=>plan.currencyCode) : [...cash.map(entry=>entry.currencyCode),...allCashPlans.map(plan=>plan.currencyCode)])];
  const bankAccounts = scope ? accounts.filter(account=>bankPlans?.some(plan=>plan.accountId===account.id)) : accounts;
  const properties = scope ? rentals.settings.properties.filter(property=>rentalPlans?.some(plan=>plan.propertyId===property.id)) : rentals.settings.properties;
  const cardPlans=scope?.filter(row=>row.module==='creditCard').map(row=>row.plan as PlannedCreditCardTransaction);
  const scopedCards=scope?cards.filter(card=>cardPlans?.some(plan=>plan.cardId===card.id)):cards;
  return <div className="stack-lg">
    {codes.map(code=><div key={code}><h3>Cash · {code}</h3><CashAccountSummary currency={code} entries={cash} visible={filterCashEntries(cash,filters,categories)} filters={filters} plansOverride={cashPlans} /></div>)}
    {!!bankAccounts.length && <div><h3>Bank accounts</h3><BankingScopeSummary accounts={bankAccounts} filters={filters} plansOverride={bankPlans} includeCards={false} /></div>}
    {scopedCards.map(card=><div key={card.id}><h3>{card.name} ? {card.currencyCode}</h3><CreditCardPositionSummary card={card} filters={filters} plansOverride={cardPlans} /></div>)}
    {!!properties.length && <div><h3>Rental income</h3><RentalAccountSummary properties={properties} entries={rentals.entries} visible={filterRentalEntries(rentals.entries,filters,categories)} filters={filters} plansOverride={rentalPlans} /></div>}
  </div>;
}
