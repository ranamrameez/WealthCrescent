import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get:vi.fn(),update:vi.fn(),set:vi.fn() }));
vi.mock('firebase/database', () => ({get:mocks.get,ref:(_db:unknown,path:string)=>path,update:mocks.update,set:mocks.set}));
vi.mock('../../firebase/client', () => ({db:{}}));
vi.mock('../qseSeed', () => ({ QSE_TICKER_NAMES:{QFLS:'Seed'},QSE_FUNDAMENTALS:{} }));
import { fetchQSEStockData, seedQSEStockData } from '../reader';
beforeEach(() => {vi.clearAllMocks();});
it('reads metadata leaves without downloading market history', async () => {
  mocks.get.mockImplementation(async (path:string) => ({exists:()=>true,val:()=>path.endsWith('tickerNames')?{QFLS:'Shared'}:{}}));
  expect((await fetchQSEStockData()).tickerNames.QFLS).toBe('Shared');
  expect(mocks.get.mock.calls.map(([path])=>path).sort()).toEqual(['QSE/fundamentals','QSE/tickerNames']);
});
it('uses legacy metadata while a root leaf is absent',async()=>{
  mocks.get.mockImplementation(async(path:string)=>({exists:()=>!path.startsWith('QSE/'),val:()=>path.endsWith('tickerNames')?{QFLS:'Legacy'}:{}}));
  expect((await fetchQSEStockData()).tickerNames.QFLS).toBe('Legacy');
  expect(mocks.get).toHaveBeenCalledWith('stockData/QSE/tickerNames');
});
it('seeding patches metadata without replacing ticker prices',async()=>{
  await seedQSEStockData();
  expect(mocks.update).toHaveBeenCalledWith('QSE',{tickerNames:{QFLS:'Seed'},fundamentals:{}});
  expect(mocks.set).not.toHaveBeenCalled();
});
