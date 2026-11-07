import { afterEach, expect, it } from 'vitest';
import { removeEmiPlans, removeSubscriptionPlans } from '../planLifecycle';
import { CalculationEngine } from '../calc/CalculationEngine';
import { usePlannedCashWorkbookStore as cash } from '../../store/plannedCashWorkbookStore';
import { usePlannedBankWorkbookStore as bank } from '../../store/plannedBankWorkbookStore';
import { usePlannedCreditCardWorkbookStore as cards } from '../../store/plannedCreditCardWorkbookStore';
const originalCash=cash.getState().workbook, originalBank=bank.getState().workbook, originalCards=cards.getState().workbook;
afterEach(()=>{cash.getState().setWorkbook(originalCash);bank.getState().setWorkbook(originalBank);cards.getState().setWorkbook(originalCards);});
it('cancels future source-linked series while preserving fulfilled history in every paying module',()=>{
  const common={date:'2026-01-31',amount:10,sourceEmiLoanId:'loan',recurrence:{cycle:'monthly' as const,startDate:'2026-01-31'},completedDates:['2026-02-28']};
  cash.getState().setWorkbook({...originalCash,entries:[{...common,id:'cash',type:'OUT',currencyCode:'USD'},{...common,id:'one-off',recurrence:undefined,completedDates:undefined,type:'OUT',currencyCode:'USD'}]});
  bank.getState().setWorkbook({...originalBank,entries:[{...common,id:'bank',accountId:'account',amount:-10,description:'Loan'},{...common,id:'done',recurrence:undefined,executed:true,accountId:'account',amount:-10,description:'Fulfilled'}]});
  cards.getState().setWorkbook({...originalCards,entries:[{...common,id:'card',cardId:'card',kind:'charge',description:'Loan'}]});
  removeEmiPlans('loan');
  expect(cash.getState().workbook.entries.map(row=>row.id)).toEqual(['cash']);
  expect(bank.getState().workbook.entries.find(row=>row.id==='done')?.executed).toBe(true);
  for(const store of [cash,bank,cards]) {
    const series=store.getState().workbook.entries.find(row=>row.recurrence)!;
    expect(series).toMatchObject({cancelled:true,completedDates:['2026-02-28']});
    expect(CalculationEngine.occurrences.planOccurrences([series],'2026-01-01','2026-04-30').map(row=>row.date)).toEqual(['2026-02-28']);
  }
});
it('preserves the chosen paying source when a subscription is explicitly relinked',()=>{
  const series={id:'series',date:'2026-01-01',amount:10,type:'OUT' as const,currencyCode:'USD',sourceSubscriptionId:'sub',recurrence:{cycle:'monthly' as const,startDate:'2026-01-01'},executedThrough:'2026-02-01'};
  cash.getState().setWorkbook({...originalCash,entries:[series]});
  bank.getState().setWorkbook({...originalBank,entries:[{id:'keep',date:'2026-03-01',amount:-10,accountId:'new-account',description:'Renewal',sourceSubscriptionId:'sub'}]});
  cards.getState().setWorkbook({...originalCards,entries:[]});
  removeSubscriptionPlans('sub',{module:'bank',ref:'new-account'});
  expect(cash.getState().workbook.entries[0]).toMatchObject({cancelled:true,executedThrough:'2026-02-01'});
  expect(bank.getState().workbook.entries[0].id).toBe('keep');
});
