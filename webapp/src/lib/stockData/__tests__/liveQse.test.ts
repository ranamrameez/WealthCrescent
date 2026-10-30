import { expect,it } from 'vitest';
import { applyLiveQse } from '../liveQse';
import { createEmptyWorkbook } from '../../../store/defaultWorkbook';
it('reacts to newer shared quotes and preserves manual history and persisted workbook',()=>{
 const wb=createEmptyWorkbook();wb.marketPrices.QFLS=10;wb.priceHistory.QFLS=[{date:'2026-10-12',time:'2026-10-12T08:00:00Z',price:10}];
 const shared={QFLS:[{date:'2026-10-12',time:'2026-10-12T08:01:00Z',price:12}]};
 const view=applyLiveQse(wb,shared);expect(view.marketPrices.QFLS).toBe(12);expect(view.priceHistory.QFLS).toHaveLength(2);expect(wb.marketPrices.QFLS).toBe(10);expect(wb.priceHistory.QFLS).toHaveLength(1);
 expect(applyLiveQse(wb,{QFLS:[{...shared.QFLS[0],price:13}]}).marketPrices.QFLS).toBe(13);
 expect(applyLiveQse(wb,{}).marketPrices.QFLS).toBe(10);
});
it('keeps newer manual prices and rejects invalid shared points',()=>{
 const wb=createEmptyWorkbook();wb.marketPrices.QFLS=15;wb.priceHistory.QFLS=[{date:'2026-10-12',time:'2026-10-12T09:00:00Z',price:15}];
 expect(applyLiveQse(wb,{QFLS:[{date:'2026-10-12',time:'2026-10-12T08:00:00Z',price:12}]}).marketPrices.QFLS).toBe(15);
 expect(applyLiveQse(wb,{QFLS:[{date:'bad',price:100}]}).marketPrices.QFLS).toBe(15);
});

it('compares a date-only manual point as a local calendar day, not midnight UTC',()=>{
 const wb=createEmptyWorkbook();
 wb.priceHistory.QFLS=[{date:'2026-10-30',price:10}];
 const view=applyLiveQse(wb,{QFLS:[{date:'2026-10-30',time:'2026-10-29T22:15:00.000Z',price:14}]});
 expect(view.marketPrices.QFLS).toBe(14);
 expect(view.priceHistory.QFLS.map(point=>point.price)).toEqual([10,14]);
});
it('keeps a manual point from a later calendar day ahead of an older live quote',()=>{
 const wb=createEmptyWorkbook();
 wb.marketPrices.QFLS=15;
 wb.priceHistory.QFLS=[{date:'2026-10-31',price:15}];
 const view=applyLiveQse(wb,{QFLS:[{date:'2026-10-30',time:'2026-10-30T10:00:00.000Z',price:14}]});
 expect(view.marketPrices.QFLS).toBe(15);
 expect(view.priceHistory.QFLS.map(point=>point.price)).toEqual([14,15]);
});
