import { afterEach, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { CreditCardPositionSummary } from '../CreditCardPositionSummary';
import { useCreditCardWorkbookStore as cards } from '../../store/creditCardWorkbookStore';
import { usePlannedCreditCardWorkbookStore as plans } from '../../store/plannedCreditCardWorkbookStore';
import { fmtMoney } from '../../lib/format';

afterEach(cleanup);
it('scopes actual and expected debt to the selected card, carrying history and excluding fulfilled plans',()=>{
  const card={id:'a',name:'First',currencyCode:'QAR',openingBalance:100};
  cards.getState().setWorkbook({cards:[card,{id:'b',name:'Second',currencyCode:'QAR',openingBalance:700}],transactions:[
    {id:'old',cardId:'a',date:'2026-09-01',kind:'charge',amount:50,description:'Prior charge'},
    {id:'later',cardId:'a',date:'2026-11-01',kind:'payment',amount:10,description:'Outside period'},
    {id:'other',cardId:'b',date:'2026-10-01',kind:'charge',amount:10,description:'Other card'},
  ]});
  plans.getState().setWorkbook({...plans.getState().workbook,entries:[
    {id:'next',cardId:'a',date:'2026-10-15',kind:'payment',amount:40,description:'Planned payment'},
    {id:'paid',cardId:'a',date:'2026-10-02',kind:'charge',amount:100,description:'Fulfilled',executed:true},
    {id:'other',cardId:'b',date:'2026-10-15',kind:'charge',amount:900,description:'Other card plan'},
  ]});
  const {container}=render(<CreditCardPositionSummary card={card} filters={{period:'custom',fromDate:'2026-10-01',toDate:'2026-10-31',accountId:'all',direction:'all',source:'all',category:'all'}} />);
  const groups=[...container.querySelectorAll('.account-summary-card')];
  const actual=groups.find(group=>group.querySelector('h4')?.textContent==='Outstanding card debt')!;
  const expected=groups.find(group=>group.querySelector('h4')?.textContent==='Expected card debt')!;
  expect(actual.textContent).toContain(fmtMoney(150,'QAR'));
  expect(expected.textContent).toContain(fmtMoney(110,'QAR'));
  expect(expected.textContent).not.toContain(fmtMoney(1010,'QAR'));
});
