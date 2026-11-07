import { expect, it, vi } from 'vitest';
import { getNavigationItems, toggleNavigationFavorite } from './navigationService';
import { useEMIWorkbookStore } from '../store/emiWorkbookStore';
const session = vi.hoisted(() => ({signedIn:true}));
vi.mock('../lib/firebase/client', () => ({auth:{get currentUser(){return session.signedIn ? {uid:'test'} : null;}},db:null,firebaseReady:false}));
it('indexes native items by section, omits archived entries, and updates only their existing favorite field', () => {
  const store = useEMIWorkbookStore.getState(), original = store.workbook;
  const loan = {id:'car', name:'Car loan', lender:'Lender', currencyCode:'QAR',principal:100,tenureMonths:12,startDate:'2026-01-01',repaymentMode:'fixedTotal' as const,totalToReturn:120};
  try {
    store.setWorkbook({...original,entries:[loan,{...loan,id:'archived',isActive:false}]});
    const items = getNavigationItems().find(section => section.title === 'EMI loans')!.items;
    expect(items).toHaveLength(1); expect(items[0]).toMatchObject({value:'emi:car',url:'/emi-loans?loan=car'});
    expect(getNavigationItems()).toBe(getNavigationItems());
    toggleNavigationFavorite('emi:car');
    expect(useEMIWorkbookStore.getState().workbook.entries[0]).toEqual({...loan,isFavorite:true});
    session.signedIn=false; expect(() => toggleNavigationFavorite('emi:car')).toThrow('Sign in');
  } finally {session.signedIn=true;store.setWorkbook(original);}
});
