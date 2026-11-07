import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getNativeMovementActivities } from '../../services/finance/dashboardService';
import { CalculationEngine } from '../calc/CalculationEngine';
import { fulfillRentalPlan } from '../rentalPlanFulfillment';
import { useRentalsWorkbookStore as rentals } from '../../store/rentalsWorkbookStore';
import { usePlannedRentalsWorkbookStore as plans } from '../../store/plannedRentalsWorkbookStore';
import { useCashWorkbookStore as cash } from '../../store/cashWorkbookStore';
import { useInterEntityTransfersStore as links } from '../../store/interEntityTransfersStore';
const session = vi.hoisted(()=>({ signedIn: true }));
const originalUpdate = plans.getState().updateEntry;
afterEach(()=>{ vi.restoreAllMocks(); plans.setState({ updateEntry: originalUpdate }); });

beforeEach(()=>{
  session.signedIn = true;
  rentals.getState().setWorkbook({settings:{properties:[{id:'r',name:'Apartment',currencyCode:'QAR'}]},entries:[]});
  plans.getState().setWorkbook({settings:{},entries:[{id:'rent',propertyId:'r',date:'2026-10-01',amount:100,type:'RENT_INCOME',finance:{module:'cash',currencyCode:'QAR'}}]});
  cash.getState().setWorkbook({settings:{defaultCurrency:'QAR'},entries:[]});
  links.getState().setWorkbook({settings:{},entries:[]});
});
it('fulfills linked rent once, retaining the property plan and both real records',()=>{
  expect(fulfillRentalPlan('rent')).toBeUndefined();
  expect(plans.getState().workbook.entries[0]).toMatchObject({propertyId:'r',executed:true});
  expect(rentals.getState().workbook.entries[0]).toMatchObject({propertyId:'r',amount:100,isDeposit:true,date:'2026-10-01'});
  expect(cash.getState().workbook.entries[0]).toMatchObject({currencyCode:'QAR',amount:100,isDeposit:true,date:'2026-10-01'});
  expect(links.getState().workbook.entries).toHaveLength(1);
  expect(fulfillRentalPlan('rent')).toMatch(/already fulfilled/);
  expect(rentals.getState().workbook.entries).toHaveLength(1);
  expect(cash.getState().workbook.entries).toHaveLength(1);
});
it('rejects an incompatible finance without partially fulfilling the rental plan',()=>{
  plans.getState().updateEntry('rent',{finance:{module:'cash',currencyCode:'USD'}});
  expect(fulfillRentalPlan('rent')).toMatch(/property currency/);
  expect(plans.getState().workbook.entries[0].executed).toBeFalsy();
  expect(rentals.getState().workbook.entries).toHaveLength(0);
  expect(cash.getState().workbook.entries).toHaveLength(0);
});
it('requires sign-in and rejects a stale reviewed plan before writing',()=>{
  session.signedIn = false;
  expect(fulfillRentalPlan('rent')).toMatch(/Sign in/);
  session.signedIn = true;
  const reviewed = plans.getState().workbook.entries[0];
  plans.getState().updateEntry('rent',{ amount: 150 });
  expect(fulfillRentalPlan('rent',reviewed)).toMatch(/changed/);
  expect(rentals.getState().workbook.entries).toHaveLength(0);
});
it('carries plan provenance into both linked records while reporting the rental event once',()=>{
  plans.getState().updateEntry('rent',{ groupId: 'tenant-plan' });
  expect(fulfillRentalPlan('rent')).toBeUndefined();
  expect(rentals.getState().workbook.entries[0].planLink).toMatchObject({ module: 'rentals', planId: 'rent', groupId: 'tenant-plan' });
  expect(cash.getState().workbook.entries[0].planLink).toEqual(rentals.getState().workbook.entries[0].planLink);
  const report = CalculationEngine.dashboard.moneyMovementReport(getNativeMovementActivities(['cash','rentals']),'2026-10-01','2026-10-31','2026-10-31','plan','actual',{'tenant-plan':'Tenant plan'});
  expect(report.rows[0].groups[0]).toMatchObject({ key: 'tenant-plan', inflow: 100, net: 100 });
  plans.getState().updateEntry('rent',{ executed: false });
  expect(fulfillRentalPlan('rent')).toMatch(/already has a ledger/);
  expect(rentals.getState().workbook.entries).toHaveLength(1);
});
it('restores the property, finance, link and plan workbooks if completion fails',()=>{
  vi.spyOn(plans.getState(),'updateEntry').mockImplementation(()=>{ throw new Error('Fixture marker failure'); });
  expect(fulfillRentalPlan('rent')).toMatch(/Fixture marker failure/);
  expect(rentals.getState().workbook.entries).toHaveLength(0);
  expect(cash.getState().workbook.entries).toHaveLength(0);
  expect(links.getState().workbook.entries).toHaveLength(0);
  expect(plans.getState().workbook.entries[0].executed).toBeFalsy();
});
it('retains unlinked expenses and rejects invalid amounts or archived properties',()=>{
  plans.getState().updateEntry('rent',{ finance: undefined, type: 'EXPENSE' });
  expect(fulfillRentalPlan('rent')).toBeUndefined();
  expect(rentals.getState().workbook.entries[0]).toMatchObject({ isDeposit: false, amount: 100, planLink: { planId: 'rent' } });
  expect(cash.getState().workbook.entries).toHaveLength(0);
  plans.getState().updateEntry('rent',{ executed: false, amount: -1 });
  expect(fulfillRentalPlan('rent')).toMatch(/positive amount/);
  plans.getState().updateEntry('rent',{ amount: 100 });
  rentals.getState().updateProperty('r',{ isActive: false });
  expect(fulfillRentalPlan('rent')).toMatch(/active property/);
});
vi.mock('../firebase/client',()=>({ auth: { get currentUser() { return session.signedIn ? { uid: 'rental-fixture' } : null; } }, db: null, firebaseReady: false }));
