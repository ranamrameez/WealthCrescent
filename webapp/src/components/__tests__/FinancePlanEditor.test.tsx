import { nextRecurrenceOccurrence } from '../../lib/calc/recurrence';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FinancePlanEditor } from '../FinancePlanEditor';
import { PlanFinanceEditor } from '../PlanFinanceEditor';
import { FinancePlansHierarchy } from '../FinancePlansHierarchy';
import { MemoryRouter } from 'react-router-dom';
import { usePlannedCashWorkbookStore } from '../../store/plannedCashWorkbookStore';
import { usePlannedBankWorkbookStore } from '../../store/plannedBankWorkbookStore';
import { usePlannedCreditCardWorkbookStore } from '../../store/plannedCreditCardWorkbookStore';
import { usePlannedRentalsWorkbookStore } from '../../store/plannedRentalsWorkbookStore';
import { useBankWorkbookStore } from '../../store/bankWorkbookStore';
import { planOccurrences } from '../../lib/calc/planOccurrences';
import type { TransactionPageFilters } from '../../hooks/useUrlTransactionFilters';

vi.mock('../../lib/firebase/useEnsureSignedIn', () => ({ useEnsureSignedIn: () => async () => true }));
const filters: TransactionPageFilters = { period:'custom',fromDate:'2026-10-01',toDate:'2026-12-31',direction:'all',source:'all',category:'all',accountId:'all' };
beforeEach(() => {
  for (const store of [usePlannedCashWorkbookStore,usePlannedBankWorkbookStore,usePlannedCreditCardWorkbookStore,usePlannedRentalsWorkbookStore]) { const s=store.getState(); s.setWorkbook({...s.workbook,entries:[]} as never); }
  const s=useBankWorkbookStore.getState();s.setWorkbook({...s.workbook,settings:{...s.workbook.settings,accounts:[{id:'a',name:'Account A',currencyCode:'QAR',openingBalance:0}]},transactions:[]});
});
afterEach(cleanup);
describe('Shared plan editors',()=>{
  it('links one recurring item to a finance while retaining the parent and subsequent dates',async()=>{
    usePlannedCashWorkbookStore.getState().addEntry({id:'salary',date:'2026-10-01',type:'IN',currencyCode:'QAR',amount:100,note:'Salary',recurrence:{cycle:'monthly',startDate:'2026-10-01'}});
    const onClose=vi.fn();render(<FinancePlanEditor reference={{module:'cash',id:'salary'}} occurrenceDate="2026-10-01" onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('Finance module'),{target:{value:'bank'}});
    fireEvent.change(screen.getByLabelText('Finance'),{target:{value:'a'}});
    fireEvent.change(screen.getByLabelText('Amount (QAR)'),{target:{value:'=50*3'}});
    fireEvent.click(screen.getByRole('button',{name:'Save plan'}));
    await waitFor(()=>expect(onClose).toHaveBeenCalled());
    const parent=usePlannedCashWorkbookStore.getState().workbook.entries[0];
    expect(parent.recurrence?.excludedDates).toEqual(['2026-10-01']);
    expect(nextRecurrenceOccurrence(parent.recurrence!,new Date('2026-10-01T00:00:00Z'))?.toISOString().slice(0,10)).toBe('2026-11-01');
    expect(planOccurrences([parent],filters.fromDate,filters.toDate).map(p=>p.date)).toEqual(['2026-11-01','2026-12-01']);
    expect(usePlannedBankWorkbookStore.getState().workbook.entries[0]).toMatchObject({accountId:'a',date:'2026-10-01',amount:150,seriesId:'salary'});
    expect(parent.amount).toBe(100);
  });
  it('links an entire generated plan once without changing completed history, dates or amounts',async()=>{
    const plans=[{id:'paid',date:'2026-09-01',description:'Membership',amount:-20,accountId:'a',sourceSubscriptionId:'s',executed:true},{id:'next',date:'2026-10-01',description:'Membership',amount:-20,accountId:'a',sourceSubscriptionId:'s'}];
    usePlannedBankWorkbookStore.getState().setWorkbook({...usePlannedBankWorkbookStore.getState().workbook,entries:plans});
    const stored = usePlannedBankWorkbookStore.getState().workbook.entries;
    const onClose=vi.fn();render(<PlanFinanceEditor records={stored.map(plan=>({module:'bank',plan}))} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('Finance module'),{target:{value:'cash'}});
    fireEvent.click(screen.getByRole('button',{name:'Save finance link'}));
    await waitFor(()=>expect(onClose).toHaveBeenCalled());
    expect(usePlannedBankWorkbookStore.getState().workbook.entries).toEqual([stored[0]]);
    expect(usePlannedCashWorkbookStore.getState().workbook.entries[0]).toMatchObject({id:'next',date:'2026-10-01',amount:20,type:'OUT',sourceSubscriptionId:'s'});
    expect(usePlannedCashWorkbookStore.getState().workbook.entries[0]).not.toHaveProperty('accountId');
  });
  it('keeps the Add plan FAB on the empty overview and opens parent detail with dated items',()=>{
    const rendered=render(<MemoryRouter><FinancePlansHierarchy filters={filters} controls={null} /></MemoryRouter>);
    expect(screen.getByRole('button',{name:'Add plan'})).toBeTruthy();
    rendered.unmount();
    usePlannedCashWorkbookStore.getState().addEntry({id:'salary',date:'2026-10-01',type:'IN',currencyCode:'QAR',amount:100,note:'Salary',recurrence:{cycle:'monthly',startDate:'2026-10-01'}});
    render(<MemoryRouter initialEntries={['/?plan=series%3Asalary']}><FinancePlansHierarchy filters={filters} controls={null} /></MemoryRouter>);
    expect(screen.getByRole('heading',{name:'Salary',level:1})).toBeTruthy();
    expect(screen.getAllByRole('button',{name:'Edit item / finance'})).toHaveLength(3);
    expect(screen.getByText('01-Nov-2026')).toBeTruthy();
  });
});
