import { useEffect,useMemo,useState } from 'react';
import { endAt,onValue,orderByChild,query,ref,startAt,type QueryConstraint } from 'firebase/database';
import { db } from '../../../lib/firebase/client';
import { useAuthState } from '../../../lib/firebase/useAuthState';
import { combinedQsePrices } from '../../../lib/stockData/qsePrices';
import { marketRows,type MarketSource } from '../../../lib/stockData/marketPageModel';
import { useWorkbookStore } from '../../../store/workbookStore';
import type { PricePoint } from '../../../types/workbook';
const EMPTY_MANUAL:PricePoint[]=[];
type SharedPoint=PricePoint&{dayHigh?:number;dayLow?:number;priceKey?:string};
export function useMarketPageData(ticker:string,from:string,to:string,source:MarketSource) {
  const {user,authResolved}=useAuthState();
  const manual=useWorkbookStore(state=>state.workbook.priceHistory[ticker]);
  const key=[user?.uid,ticker,from,to,source].join('|');
  const [data,setData]=useState<{key:string;shared:Record<string,SharedPoint>;bounds:{low:number;high:number}|null;error:string;loading:boolean}>({key:'',shared:{},bounds:null,error:'',loading:false});
  useEffect(()=>{
    let disposed=false;
    setData({key,shared:{},bounds:null,error:'',loading:!!user&&source!=='manual'});
    if(!db||!authResolved||!user||!ticker||source==='manual')return;
    if(from&&to&&from>to){setData(state=>({...state,loading:false,error:'From date must precede To date.'}));return;}
    const constraints:QueryConstraint[]=[orderByChild('date')];
    // Keep a short lookback outside the visible range so price charts can
    // compare the latest session with the previous trading day's close,
    // including across a weekend. Callers still filter the displayed rows.
    if(from){const date=new Date(from+'T00:00:00Z');date.setUTCDate(date.getUTCDate()-7);constraints.push(startAt(date.toISOString().slice(0,10)));}
    if(to)constraints.push(endAt(to));
    const stopPrices=onValue(query(ref(db,'QSE/tickers/'+ticker+'/allPrices'),...constraints),snapshot=>{if(!disposed)setData(state=>({...state,shared:snapshot.val() || {},loading:false}));},error=>{if(!disposed)setData(state=>({...state,shared:{},loading:false,error:'App prices: '+error.message}));});
    const stopBounds=onValue(ref(db,'QSE/tickers/'+ticker+'/allTimeBounds'),snapshot=>{if(!disposed){const value=snapshot.val();setData(state=>({...state,bounds:Number.isFinite(value?.low)&&Number.isFinite(value?.high)?value:null}));}},error=>{if(!disposed)setData(state=>({...state,error:'App price bounds: '+error.message}));});
    return()=>{disposed=true;stopPrices();stopBounds();};
  },[key,ticker,from,to,source,user?.uid,authResolved]);
  const current=data.key===key?data:null;
  const rows=useMemo(()=>marketRows(combinedQsePrices(current?.shared || {},manual || [],'', '9999-12-31')),[current?.shared,manual]);
  return {rows,manual:manual || EMPTY_MANUAL,bounds:current?.bounds || null,error:current?.error || '',loading:current?.loading ?? (!!user&&source!=='manual'),signedIn:!!user};
}
export function useMarketCardPrices(enabled=true) {
  const {user,authResolved}=useAuthState();
  const [state,setState]=useState<{uid:string;prices:Record<string,number>;names:Record<string,string>;error:string}>({uid:'',prices:{},names:{},error:''});
  useEffect(()=>{
    setState({uid:user?.uid || '',prices:{},names:{},error:''});
    if(!db||!user||!authResolved||!enabled)return;
    const stopPrices=onValue(ref(db,'QSE/prices'),snapshot=>setState(state=>({...state,uid:user.uid,prices:snapshot.val() || {}})),error=>setState(state=>({...state,prices:{},error:'Latest App prices: '+error.message})));
    const stopNames=onValue(ref(db,'QSE/tickerNames'),snapshot=>setState(state=>({...state,uid:user.uid,names:snapshot.val() || {}})),error=>setState(state=>({...state,error:'Ticker names: '+error.message})));
    return()=>{stopPrices();stopNames();};
  },[user?.uid,authResolved,enabled]);
  return enabled&&state.uid===(user?.uid || '')?state:{uid:'',prices:{},names:{},error:''};
}
