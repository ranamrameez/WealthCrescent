import { useEffect,useState } from 'react';
import { onValue,ref,update } from 'firebase/database';
import { db } from '../../../lib/firebase/client';
import { useAuthState } from '../../../lib/firebase/useAuthState';
const clean=(value:unknown):string[]=>[...new Set((Array.isArray(value)?value:[]).filter((ticker):ticker is string=>typeof ticker==='string'&&/^[A-Z][A-Z0-9]{1,5}$/.test(ticker)))].sort();
function read(owner:string):{tickers:string[];pending:boolean} {try {const saved=JSON.parse(localStorage.getItem('qse-market-favourites:'+owner)||'{}');return {tickers:clean(saved.tickers),pending:!!saved.pending};}catch{return {tickers:[],pending:false};}}
function cache(owner:string,tickers:string[],pending:boolean){try{localStorage.setItem('qse-market-favourites:'+owner,JSON.stringify({tickers,pending}));}catch{/* The in-memory favourite remains usable. */}}
export function useMarketFavourites() {
  const {user,authResolved}=useAuthState(),owner=user?.uid || 'guest';
  const [state,setState]=useState<{owner:string;tickers:string[];ready:boolean;error:string}>({owner:'',tickers:[],ready:false,error:''});
  useEffect(()=>{
    let disposed=false;
    const saved=read(owner);setState({owner,tickers:saved.tickers,ready:!user,error:''});
    if(!db||!user||!authResolved){setState(state=>({...state,ready:true}));return;}
    let first=true;
    const stop=onValue(ref(db,'users/'+user.uid+'/extensionConfigs/chartFavourites'),snapshot=>{
      if(disposed)return;
      const pending=read(owner);
      if(pending.pending){
        setState({owner,tickers:pending.tickers,ready:true,error:''});
        if(first)void update(ref(db!,'users/'+user.uid+'/extensionConfigs'),{chartFavourites:pending.tickers}).then(()=>{if(JSON.stringify(read(owner).tickers)===JSON.stringify(pending.tickers))cache(owner,pending.tickers,false);}).catch(error=>{if(!disposed)setState(state=>({...state,error:'Favourites kept locally: '+error.message}));});
      }else {const tickers=clean(snapshot.val());cache(owner,tickers,false);setState({owner,tickers,ready:true,error:''});}
      first=false;
    },error=>{if(!disposed)setState(state=>({...state,ready:true,error:'Favourites kept locally: '+error.message}));});
    return()=>{disposed=true;stop();};
  },[owner,user?.uid,authResolved]);
  const tickers=state.owner===owner?state.tickers:[];
  const toggle=async(ticker:string)=>{
    const next=tickers.includes(ticker)?tickers.filter(value=>value!==ticker):clean([...tickers,ticker]);
    cache(owner,next,!!user);setState({owner,tickers:next,ready:true,error:''});
    if(db&&user)try{
      await update(ref(db,'users/'+user.uid+'/extensionConfigs'),{chartFavourites:next});
      if(JSON.stringify(read(owner).tickers)===JSON.stringify(next))cache(owner,next,false);
    }catch(error){setState(state=>state.owner===owner?{...state,error:'Favourites kept locally: '+(error instanceof Error?error.message:String(error))}:state);}
  };
  return {favourites:new Set(tickers),toggle,ready:state.owner===owner&&state.ready,error:state.owner===owner?state.error:''};
}
