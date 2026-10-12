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
