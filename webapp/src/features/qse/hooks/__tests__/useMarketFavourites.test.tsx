import { act,cleanup,renderHook,waitFor } from '@testing-library/react';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
const state=vi.hoisted(()=>({uid:'alice',fail:false,configs:{alice:{chartFavourites:['QFLS'],syncConfig:{minPushIntervalMinutes:2}},bob:{chartFavourites:[],syncConfig:{minPushIntervalMinutes:5}}} as Record<string,{chartFavourites:string[];syncConfig:{minPushIntervalMinutes:number}}>,writes:[] as Array<{path:string;patch:{chartFavourites:string[]}}> }));
vi.mock('../../../../lib/firebase/client',()=>({db:{}}));
vi.mock('../../../../lib/firebase/useAuthState',()=>({useAuthState:()=>({user:state.uid?{uid:state.uid}:null,authResolved:true})}));
vi.mock('firebase/database',()=>({ref:(_db:unknown,path:string)=>path,onValue:(path:string,success:(snap:{val:()=>unknown})=>void)=>{success({val:()=>Reflect.get(state.configs[path.split('/')[1]]||{},path.split('/').at(-1)!) || null});return ()=>{};},update:async(path:string,patch:{chartFavourites:string[]})=>{state.writes.push({path,patch});if(state.fail)throw new Error('Denied');Object.assign(state.configs[path.split('/')[1]],patch);}}));
import { useMarketFavourites } from '../useMarketFavourites';
beforeEach(()=>{localStorage.clear();state.uid='alice';state.fail=false;state.writes=[];state.configs.alice.chartFavourites=['QFLS'];state.configs.bob.chartFavourites=[];});
afterEach(cleanup);
it('keeps PSX cloud favourites separate from QSE and accepts longer PSX symbols',async()=>{
 Reflect.deleteProperty(state.configs.alice,'psxChartFavourites');
 const {result}=renderHook(()=>useMarketFavourites('psx'));
 expect([...result.current.favourites]).toEqual([]);
 await act(async()=>result.current.toggle('OGDC-DEC'));
 expect(state.writes[0]).toEqual({path:'users/alice/extensionConfigs',patch:{psxChartFavourites:['OGDC-DEC']}});
 expect(state.configs.alice.chartFavourites).toEqual(['QFLS']);
});
it('adds/removes QSE favourites in extension configs without changing sync settings',async()=>{
 const {result}=renderHook(()=>useMarketFavourites());
 expect([...result.current.favourites]).toEqual(['QFLS']);
 await act(async()=>result.current.toggle('QNBK'));
 expect(state.writes[0]).toEqual({path:'users/alice/extensionConfigs',patch:{chartFavourites:['QFLS','QNBK']}});
 expect(state.configs.alice.syncConfig.minPushIntervalMinutes).toBe(2);
 await act(async()=>result.current.toggle('QFLS'));expect([...result.current.favourites]).toEqual(['QNBK']);
});
it('clears favourites on account switches and keeps guest choices local',async()=>{
 const {result,rerender}=renderHook(()=>useMarketFavourites());expect(result.current.favourites.has('QFLS')).toBe(true);
 state.uid='bob';rerender();expect([...result.current.favourites]).toEqual([]);
 state.uid='';rerender();await act(async()=>result.current.toggle('QIBK'));expect(result.current.favourites.has('QIBK')).toBe(true);expect(state.writes).toHaveLength(0);
});
it('retains failed writes per account and retries the pending favourite on a later mount',async()=>{
 const hook=renderHook(()=>useMarketFavourites());state.fail=true;
 await act(async()=>hook.result.current.toggle('QNBK'));expect(hook.result.current.favourites.has('QNBK')).toBe(true);expect(hook.result.current.error).toContain('Denied');
 hook.unmount();state.fail=false;
 const retry=renderHook(()=>useMarketFavourites());await waitFor(()=>expect(state.configs.alice.chartFavourites).toEqual(['QFLS','QNBK']));expect(retry.result.current.favourites.has('QNBK')).toBe(true);
});
