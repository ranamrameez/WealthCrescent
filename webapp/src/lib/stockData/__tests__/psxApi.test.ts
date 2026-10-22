import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({get:vi.fn(),transaction:vi.fn()}));
vi.mock('firebase/database',()=>({get:mocks.get,ref:(_db:unknown,path:string)=>path,runTransaction:mocks.transaction,serverTimestamp:()=>({'.sv':'timestamp'})}));
vi.mock('../../firebase/client',()=>({db:{},auth:{currentUser:{uid:'test'}}}));
beforeEach(()=>{vi.resetModules();localStorage.clear();mocks.get.mockReset();mocks.transaction.mockReset();mocks.transaction.mockResolvedValue({committed:true});});
const response={data:[{symbol:'OGDC',price:300}],meta:{timestamp:'2026-10-22T06:00:00Z'}};
it('deduplicates concurrent reads and serves fresh shared data without provider calls',async()=>{
 mocks.get.mockResolvedValue({val:()=>({payload:JSON.stringify(response),fetchedAt:Date.now()})});
 const {fetchPsx}=await import('../psxApi');
 const [a,b]=await Promise.all([fetchPsx('/screener'),fetchPsx('/screener')]);
 expect(a.data).toEqual(response.data);expect(b.data).toEqual(a.data);expect(mocks.get).toHaveBeenCalledTimes(1);
 await fetchPsx('/screener');expect(mocks.get).toHaveBeenCalledTimes(1);expect(mocks.transaction).not.toHaveBeenCalled();
});
it('retains cached data with a stale warning when shared storage is unavailable',async()=>{
 localStorage.setItem('psx-api:/screener',JSON.stringify({at:1,value:response}));
 mocks.get.mockRejectedValue(new Error('offline'));
 const {fetchPsx}=await import('../psxApi');
 expect(await fetchPsx('/screener')).toMatchObject({data:response.data,stale:true});
});
it('queues a missing dataset once without claiming it was refreshed',async()=>{
 mocks.get.mockResolvedValue({val:()=>null});
 const {fetchPsx}=await import('../psxApi');
 await expect(fetchPsx('/stocks/OGDC/quote')).rejects.toThrow('Dataset requested');
 expect(mocks.transaction).toHaveBeenCalledTimes(1);
 const update=mocks.transaction.mock.calls[0][1];
 expect(update(null)).toMatchObject({path:'/stocks/OGDC/quote'});
 expect(update({path:'/stocks/OGDC/quote',requestedAt:1})).toBeUndefined();
 await expect(fetchPsx('https://evil.test/stocks')).rejects.toThrow('Unsupported');
});
