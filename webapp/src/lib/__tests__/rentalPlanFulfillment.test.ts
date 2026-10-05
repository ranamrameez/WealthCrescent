import { beforeEach, expect, it } from 'vitest';
import { fulfillRentalPlan } from '../rentalPlanFulfillment';
import { useRentalsWorkbookStore as rentals } from '../../store/rentalsWorkbookStore';
import { usePlannedRentalsWorkbookStore as plans } from '../../store/plannedRentalsWorkbookStore';
import { useCashWorkbookStore as cash } from '../../store/cashWorkbookStore';
import { useInterEntityTransfersStore as links } from '../../store/interEntityTransfersStore';

beforeEach(()=>{
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
