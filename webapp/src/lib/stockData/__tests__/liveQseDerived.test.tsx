import { act, renderHook, cleanup } from '@testing-library/react';
import { afterEach,expect,it } from 'vitest';
import { useQSEDerived } from '../../../features/qse/hooks/useQSEDerived';
import { useQseFeed } from '../../../features/qse/hooks/useLiveQseWorkbook';
import { useWorkbookStore } from '../../../store/workbookStore';
import { createEmptyWorkbook } from '../../../store/defaultWorkbook';
afterEach(()=>{cleanup();useQseFeed.setState({points:{}});});
it('recalculates positions, prices and chart history without changing private storage',()=>{
 const wb=createEmptyWorkbook();wb.transactions=[{date:'2026-10-12',ticker:'QFLS',action:'BUY',shares:10,price:10}];wb.marketPrices.QFLS=10;
 useWorkbookStore.setState({workbook:wb});
 const {result}=renderHook(()=>useQSEDerived());expect(result.current.rows[0].value).toBe(100);
 act(()=>useQseFeed.setState({points:{QFLS:[{date:'2026-10-12',time:'2026-10-12T09:00:00Z',price:12}]}}));
 expect(result.current.rows[0].value).toBe(120);expect(result.current.workbook.priceHistory.QFLS).toHaveLength(1);
 expect(useWorkbookStore.getState().workbook).toBe(wb);expect(wb.marketPrices.QFLS).toBe(10);
 act(()=>useQseFeed.setState({points:{QFLS:[{date:'2026-10-12',time:'2026-10-12T09:01:00Z',price:13}]}}));
 expect(result.current.rows[0].value).toBe(130);
});
