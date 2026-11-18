import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { UnifiedBudgetsPanel } from '../UnifiedBudgetsPanel';
import { usePlannedCashWorkbookStore } from '../../store/plannedCashWorkbookStore';
import { useCashWorkbookStore } from '../../store/cashWorkbookStore';
import { useCategoryStore } from '../../store/categoryStore';
const session=vi.hoisted(()=>({signedIn:true}));
vi.mock('../../lib/firebase/client',()=>({auth:{get currentUser(){return session.signedIn?{uid:'budget-ui-fixture'}:null;}},db:null,firebaseReady:false}));
vi.mock('../../lib/firebase/useAuthState', () => ({ getCurrentUser: () => ({ uid: 'budget-ui-fixture' }) }));
vi.mock('../../lib/firebase/useEnsureSignedIn',()=>({useEnsureSignedIn:()=>async()=>true}));
vi.mock('react-chartjs-2',()=>({Chart:()=> <div>Budget chart</div>,Doughnut:()=>null}));
const originalPlans=usePlannedCashWorkbookStore.getState().workbook,originalCash=useCashWorkbookStore.getState().workbook,originalCategories=useCategoryStore.getState().workbook;
beforeEach(()=>{
  session.signedIn=true;vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-01-31T12:00:00Z'));
  useCategoryStore.getState().setWorkbook({categories:[{id:'food',name:'Food',scope:'custom',serialNumber:1}]});
  usePlannedCashWorkbookStore.getState().setWorkbook({...originalPlans,entries:[],budgets:[],budgetAllocations:[]});
  useCashWorkbookStore.getState().setWorkbook({settings:{defaultCurrency:'USD'},entries:[{id:'spent',date:'2026-01-02',currencyCode:'USD',amount:30,isDeposit:false,source:'manual',categoryID:'food',note:'Fixture expense'}]});
});
afterEach(()=>{cleanup();usePlannedCashWorkbookStore.getState().setWorkbook(originalPlans);useCashWorkbookStore.getState().setWorkbook(originalCash);useCategoryStore.getState().setWorkbook(originalCategories);vi.useRealTimers();});
const show=()=>render(<UnifiedBudgetsPanel fromDate="2026-01-01" toDate="2026-01-31"/>);
it('creates a category budget and changes one monthly target through service commands',async()=>{
  show();fireEvent.click(screen.getByRole('button',{name:'Add budget'}));
  fireEvent.change(screen.getByLabelText('Budget name',{exact:false}),{target:{value:'Household'}});
  fireEvent.change(screen.getByLabelText('Default monthly limit',{exact:false}),{target:{value:'100'}});
  fireEvent.click(screen.getByRole('checkbox',{name:'Food · Custom'}));
  fireEvent.click(screen.getByRole('button',{name:'Save budget'}));
  await waitFor(()=>expect(usePlannedCashWorkbookStore.getState().workbook.budgets).toHaveLength(1));
  const table=screen.getByRole('table',{name:/Monthly budget balances/});expect(table.textContent).toContain('70.00');
  fireEvent.click(screen.getByRole('button',{name:'Card options'}));fireEvent.click(screen.getByText('Modify',{exact:true}));
  fireEvent.click(screen.getByRole('button',{name:'Month limit'}));
  fireEvent.change(screen.getByLabelText('Monthly limit',{exact:true}),{target:{value:'50'}});
  fireEvent.click(screen.getByRole('button',{name:'Save month limit'}));
  await waitFor(()=>expect(table.textContent).toContain('20.00'));
  expect(usePlannedCashWorkbookStore.getState().workbook.budgets?.[0].monthlyLimit).toBe(100);
  expect(useCashWorkbookStore.getState().workbook.entries[0].amount).toBe(30);
});
it('opens the shared searchable allocation picker and preserves a partial unallocated remainder',async()=>{
  usePlannedCashWorkbookStore.getState().setWorkbook({...originalPlans,entries:[],budgetAllocations:[],budgets:[{id:'one',name:'Food one',currencyCode:'USD',startMonth:'2026-01',monthlyLimit:100,categoryIds:['food'],rollover:'none'},{id:'two',name:'Food two',currencyCode:'USD',startMonth:'2026-01',monthlyLimit:100,categoryIds:['food'],rollover:'none'}]});
  show();const unallocated=screen.getByRole('table',{name:'Cleared outflow not yet assigned to a budget'});
  fireEvent.click(within(unallocated).getByText(/Fixture expense/).closest('tr')!);
  fireEvent.click(screen.getByRole('button',{name:'Open'}));
  fireEvent.click(screen.getByRole('button',{name:'Add split'}));
  const picker=screen.getByRole('combobox',{name:'Allocation budget 1'});fireEvent.focus(picker);fireEvent.change(picker,{target:{value:'Food one'}});fireEvent.keyDown(picker,{key:'Enter'});
  fireEvent.change(screen.getByLabelText('Portion 1'),{target:{value:'20'}});fireEvent.click(screen.getByRole('button',{name:'Save allocation'}));
  await waitFor(()=>expect(usePlannedCashWorkbookStore.getState().workbook.budgetAllocations).toHaveLength(1));
  expect(unallocated.textContent).toContain('10.00');
  expect(useCashWorkbookStore.getState().workbook.entries).toHaveLength(1);
});


it('requires reviewing the CSV before saving budgets from the card menu', async () => {
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Card options' }));
  fireEvent.click(screen.getByText('Import budget definitions', { exact: true }));
  const dialog = within(screen.getByRole('dialog', { name: 'Import budget definitions' }));
  const apply = dialog.getByRole<HTMLButtonElement>('button', { name: 'Import reviewed budgets' });
  expect(apply.disabled).toBe(true);
  const file = new File([], 'budget.csv');
  Object.defineProperty(file, 'text', { value: async () =>
    'id,name,currency,monthly_limit,start_month,end_month,rollover,category_ids,plan_group_id\nnew,Food,USD,100,2026-01,,none,food,',
  });
  fireEvent.change(dialog.getByLabelText('Budget definitions CSV'), { target: { files: [file] } });
  expect(await dialog.findByRole('table', { name: 'New budget definitions' })).toBeTruthy();
  expect(usePlannedCashWorkbookStore.getState().workbook.budgets).toEqual([]);
  fireEvent.click(apply);
  expect(usePlannedCashWorkbookStore.getState().workbook.budgets).toMatchObject([{ id: 'new', currencyCode: 'USD' }]);
  expect(screen.queryByRole('dialog', { name: 'Import budget definitions' })).toBeNull();
});

it('saves a month override from the shared batch editor', async () => {
  usePlannedCashWorkbookStore.getState().setWorkbook({
    ...originalPlans,
    entries: [], budgetAllocations: [],
    budgets: [{ id: 'food-budget', name: 'Food', currencyCode: 'USD', startMonth: '2026-01', monthlyLimit: 100, rollover: 'none' }],
  });
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Card options' }));
  fireEvent.click(screen.getByText('Batch edit monthly limits', { exact: true }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Batch edit monthly budget limits' }));
  fireEvent.change(dialog.getByLabelText('Row 1, Monthly limit'), { target: { value: '80' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Save all changes' }));
  await waitFor(() => expect(usePlannedCashWorkbookStore.getState().workbook.budgets?.[0]).toMatchObject({
    monthlyLimit: 100, monthlyLimits: { '2026-01': 80 },
  }));
});
