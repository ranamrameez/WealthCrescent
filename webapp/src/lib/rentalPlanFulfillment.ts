import { usePlannedRentalsWorkbookStore } from '../store/plannedRentalsWorkbookStore';
import { useRentalsWorkbookStore } from '../store/rentalsWorkbookStore';
import { useBankWorkbookStore } from '../store/bankWorkbookStore';
import { createLinkedTransfer } from './linkCascade';

/** Both rental plan views use the same guarded, linked fulfillment path. */
export function fulfillRentalPlan(id: string): string | undefined {
  const store=usePlannedRentalsWorkbookStore.getState();
  const plan=store.workbook.entries.find(item=>item.id===id);
  if (!plan || plan.executed) return 'This plan is already fulfilled or was removed.';
  const property=useRentalsWorkbookStore.getState().workbook.settings.properties.find(item=>item.id===plan.propertyId);
  if (!property) return 'This property no longer exists.';
  if (plan.finance) {
    const currency=plan.finance.module==='bank' ? useBankWorkbookStore.getState().workbook.settings.accounts.find(item=>item.id===plan.finance?.ref)?.currencyCode : plan.finance.currencyCode;
    if (currency!==property.currencyCode) return 'Choose a finance in the property currency before fulfilling this plan.';
    const rental={module:'rentals' as const,ref:plan.propertyId};
    const result=createLinkedTransfer({date:plan.date,fromAmount:plan.amount,toAmount:plan.amount,from:plan.type==='RENT_INCOME' ? rental : plan.finance,to:plan.type==='RENT_INCOME' ? plan.finance : rental,note:plan.note});
    if ('error' in result) return result.error;
  } else useRentalsWorkbookStore.getState().addEntry({id:crypto.randomUUID(),propertyId:plan.propertyId,date:plan.date,isDeposit:plan.type==='RENT_INCOME',amount:plan.amount,category:plan.category,note:plan.note});
  store.updateEntry(id,{executed:true});
}
