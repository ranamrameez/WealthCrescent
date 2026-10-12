const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname,name),'utf8');
function databaseContext(seed = {}) {
  const db = structuredClone(seed), calls = []; let version = 1;
  const get = path => path.split('/').reduce((value,key) => value?.[key],db) ?? null;
  function put(path,value) { const parts=path.split('/'),key=parts.pop(); let parent=db; for(const p of parts) parent=parent[p] ||= {}; parent[key]=value; version++; }
  const ctx = vm.createContext({ console, Date, Intl, encodeURIComponent,
    RTDB_BASE_URL:'https://db.example', SHARED_LAST_UPDATED_PATH:'QSE/pricesUpdatedAt',
    priceCachePath:t=>'QSE/prices/'+t,priceHistoryPath:t=>'QSE/priceHistory/'+t,tickerNamePath:t=>'QSE/tickerNames/'+t,
    getAuth:async()=>({uid:'user',idToken:'token',expiresAt:Date.now()+60000}),
    qatarDate: date => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Qatar',year:'numeric',month:'2-digit',day:'2-digit'}).format(date),
    priceDeviation:()=>({}), saveExtensionConfigs:async()=>{}, patchStatus:async()=>{},
    fetch:async(url,options={})=>{
      const path=new URL(url).pathname.slice(1,-5), method=options.method || 'GET';calls.push({path,method});
      if(method==='PUT') { if(options.headers?.['if-match'] && options.headers['if-match']!==String(version)) return {ok:false,status:412}; put(path,JSON.parse(options.body)); }
      if(method==='PATCH') for(const [key,value] of Object.entries(JSON.parse(options.body))) put(path+'/'+key,value);
      const tag=String(version);return {ok:true,status:200,headers:{get:()=>tag},json:async()=>structuredClone(get(path))};
    },
    chrome:{alarms:{onAlarm:{addListener(){}}},runtime:{onInstalled:{addListener(){}},onStartup:{addListener(){}},onMessage:{addListener(){}}}},
  });
  vm.runInContext(read('ticker-data.js').replace(/export /g,''),ctx);
  vm.runInContext(read('background.js').replace(/import\s+[\s\S]*?from\s+'[^']+';/g,''),ctx);
  return {ctx,db,calls,get};
}
test('Ticker migration retains all old prices and extrema; incremental sync never downloads history',async()=>{
  const old={price:10,dayHigh:15,dayLow:8,date:'2026-10-01',time:'2026-10-01T12:00:00Z'};
  const {ctx,get,calls}=databaseContext({QSE:{priceHistory:{QFLS:{0:old}},prices:{QFLS:10}}});
  ctx.point={price:11,dayHigh:12,dayLow:9,date:'2026-10-02',time:'2026-10-02T12:00:00Z',highLowKey:'highLow',highLowRaw:['12','9']};
  await vm.runInContext('syncTickerPoint("QFLS",point,{idToken:"token"})',ctx);
  const root='QSE/tickers/QFLS';
  assert.equal(get(root+'/allTimeBounds/high'),15);assert.equal(get(root+'/allTimeBounds/low'),8);
  assert.equal(get(root+'/dayToDayBounds/2026-10-01/high'),15);
  assert.equal(get(root+'/dayToDayBounds/2026-10-02/low'),9);
  assert.equal(Object.keys(get(root+'/allPrices')).length,2);
  assert.equal(get(root+'/latest/dayHigh'),12);
  calls.length=0;ctx.point={...ctx.point,dayHigh:13,time:'2026-10-02T12:01:00Z'};
  await vm.runInContext('syncTickerPoint("QFLS",point,{idToken:"token"})',ctx);
  assert.equal(Object.keys(get(root+'/allPrices')).length,3);
  assert.equal(get(root+'/dayToDayBounds/2026-10-02/high'),13);
  assert.deepEqual([...new Set(calls.filter(c=>c.method==='GET').map(c=>c.path))].sort(),[root+'/latest',root+'/dayToDayBounds/2026-10-02',root+'/allTimeBounds'].sort());
  assert.deepEqual(get(root+'/latest'),get('QSE/priceHistory/QFLS/'+Date.parse(ctx.point.time)));
  await vm.runInContext('syncTickerPoint("QFLS",point,{idToken:"token"})',ctx);
  assert.equal(Object.keys(get(root+'/allPrices')).length,3);
});
test('Deleting an outlier rebuilds ticker summaries and preserves remaining daily bounds',async()=>{
  const history={0:{price:10,dayHigh:12,dayLow:9,time:'2026-10-01T12:00:00Z',date:'2026-10-01'},1:{price:100,time:'2026-10-02T12:00:00Z',date:'2026-10-02'}};
  const {ctx,get}=databaseContext({QSE:{priceHistory:{QFLS:history},prices:{QFLS:100}}});
  const result=await vm.runInContext('mutatePushedData([{id:"h1",ticker:"QFLS",kind:"history",key:"1",price:100}],"delete")',ctx);
  assert.equal(result[0].ok,true);
  assert.equal(get('QSE/tickers/QFLS/allTimeBounds/high'),12);
  assert.equal(get('QSE/tickers/QFLS/latest/price'),10);
  assert.equal(get('QSE/tickers/QFLS/dayToDayBounds/2026-10-02'),null);
});
test('pushRows writes the same daily bounds alongside canonical and compatible history prices',async()=>{
  const {ctx,get}=databaseContext({QSE:{prices:{QFLS:10}}});
  const result=await vm.runInContext('pushRows([{ticker:"QFLS",price:11,dayHigh:13,dayLow:9,highLowKey:"highLow",highLowRaw:["13","9"]}])',ctx);
  assert.equal(result.pushed,1);assert.equal(result.errors.length,0);
  const latest=get('QSE/tickers/QFLS/latest');
  assert.equal(latest.dayHigh,13);assert.equal(latest.dayLow,9);assert.equal(latest.highLowKey,'highLow');
  assert.equal(get('QSE/tickers/QFLS/dayToDayBounds/'+latest.date+'/high'),13);
  assert.deepEqual(get('QSE/tickers/QFLS/allPrices/'+Date.parse(latest.time)),latest);
});
function configContext() {
  const local={chartFavourites:['QFLS'],syncConfig:{minPushIntervalMinutes:0}},cloud={},calls=[];let fail=false;
  const ctx=vm.createContext({Date,JSON,encodeURIComponent,RTDB_BASE_URL:'https://db.example',DEFAULT_SCRAPE_CONFIG:{targetUrl:'https://market.example'},DEFAULT_SYNC_CONFIG:{minPushIntervalMinutes:2},
    chrome:{storage:{local:{get:async()=>structuredClone(local),set:async patch=>Object.assign(local,structuredClone(patch))}}},
    fetch:async(url,options={})=>{const uid=new URL(url).pathname.split('/')[2];calls.push({uid,method:options.method || 'GET',body:options.body});if(fail) return {ok:false,status:403};if(options.method==='PUT') cloud[uid]=JSON.parse(options.body);if(options.method==='PATCH') cloud[uid]={...(cloud[uid] || {}),...JSON.parse(options.body)};return {ok:true,json:async()=>structuredClone(cloud[uid] || null)};},
  });
  vm.runInContext(read('cloud-config.js').replace(/^import .*;\r?\n/gm,'').replace(/export /g,''),ctx);
  return {ctx,local,cloud,calls,setFailure:value=>fail=value};
}
test('Account configs include favourites and timeframes, exclude credentials and stay isolated by user',async()=>{
  const {ctx,local,cloud}=configContext();local.auth={idToken:'secret'};local.favouriteTimeframes={QFLS:'1Y'};
  await vm.runInContext('restoreExtensionConfigs({uid:"alice",idToken:"token"})',ctx);
  assert.deepEqual(cloud.alice.chartFavourites,['QFLS']);assert.equal(cloud.alice.favouriteTimeframes.QFLS,'1Y');assert.equal(cloud.alice.syncConfig.minPushIntervalMinutes,0);
  assert.equal(cloud.alice.auth,undefined);
  await vm.runInContext('restoreExtensionConfigs({uid:"bob",idToken:"token"})',ctx);
  assert.deepEqual(local.chartFavourites,[]);assert.equal(cloud.bob.syncConfig.minPushIntervalMinutes,2);
  await vm.runInContext('restoreExtensionConfigs({uid:"alice",idToken:"token"})',ctx);
  assert.deepEqual(local.chartFavourites,['QFLS']);assert.equal(local.favouriteTimeframes.QFLS,'1Y');
});
test('Failed configuration writes remain pending and retry without losing local favourites',async()=>{
  const {ctx,local,cloud,setFailure}=configContext();
  await vm.runInContext('restoreExtensionConfigs({uid:"alice",idToken:"token"})',ctx);
  local.chartFavourites=['QNBK'];setFailure(true);
  await assert.rejects(vm.runInContext('saveExtensionConfigs(async()=>({uid:"alice",idToken:"token"}),true)',ctx),/retained locally/);
  assert.equal(local.extensionConfigProfiles.alice.pending,true);assert.deepEqual(local.chartFavourites,['QNBK']);
  setFailure(false);await vm.runInContext('saveExtensionConfigs(async()=>({uid:"alice",idToken:"token"}))',ctx);
  assert.deepEqual(cloud.alice.chartFavourites,['QNBK']);assert.equal(local.extensionConfigProfiles.alice.pending,false);
});

test('Favourite timeframe filters independently of table dates and persists its selection',async()=>{
  const {JSDOM}=require('../webapp/node_modules/jsdom');
  const document=new JSDOM(read('options.html')).window.document;
  const requests=[],storage={favouriteTimeframes:{QFLS:'7d'}};
  const row={id:'one',ticker:'QFLS',price:10,capturedAt:Date.now(),origin:'firebase',syncStatus:'Synced'};
  const ctx=vm.createContext({document,Date,Number,JSON,
    qatarDate:()=> '2026-10-11', dateRange:period=>({from:period==='all'?'':period==='7d'?'2026-10-05':'2026-10-11',to:period==='all'?'':'2026-10-11'}),
    getChartFavourites:async()=>['QFLS'],setChartFavourites:async()=>{},renderPriceChart:()=>{},mountConfig:async()=>{},mountControls:async()=>{},mountStats:async()=>{},
    sendWorkerMessage:async message=>{requests.push(message);return {rows:[row],chartRows:[row],total:1,tickers:['QFLS']};},
    chrome:{storage:{local:{get:async()=>storage,set:async patch=>Object.assign(storage,patch)},onChanged:{addListener(){}}}},
  });
  await vm.runInContext('(async()=>{'+read('options.js').replace(/^import .*;\r?\n/gm,'')+'\n})()',ctx);
  const tableRequest=requests.find(r=>r.type==='GET_ALL_DATA'&&!r.filters.ticker);
  const favouriteRequest=requests.find(r=>r.type==='GET_ALL_DATA'&&r.filters.ticker==='QFLS');
  assert.equal(tableRequest.filters.from,'2026-10-11');assert.equal(favouriteRequest.filters.from,'2026-10-05');
  await document.querySelector('#favouriteChartList [data-favourite-period="all"]').onclick();
  assert.equal(storage.favouriteTimeframes.QFLS,'all');
  assert.equal(requests.filter(r=>r.filters?.ticker==='QFLS').at(-1).filters.from,'');
  assert.equal(document.getElementById('fromDate').value,'2026-10-11');
  assert.equal(document.querySelectorAll('#favouriteChartList [data-favourite-period]').length,7);
});

test('Current-price corrections also update allPrices and bounds; deleting current clears latest',async()=>{
  const {ctx,get}=databaseContext({QSE:{prices:{QFLS:10}}});
  const result=await vm.runInContext('mutatePushedData([{id:"current",ticker:"QFLS",kind:"current",price:10}],"edit",11)',ctx);
  assert.equal(result[0].ok,true);
  assert.equal(get('QSE/tickers/QFLS/latest/price'),11);
  assert.equal(get('QSE/tickers/QFLS/allTimeBounds/high'),11);
  assert.equal(Object.keys(get('QSE/tickers/QFLS/allPrices')).length,1);
  const deleted=await vm.runInContext('mutatePushedData([{id:"current",ticker:"QFLS",kind:"current",price:11}],"delete")',ctx);
  assert.equal(deleted[0].ok,true);assert.equal(get('QSE/tickers/QFLS/latest'),null);
});
test('Worker restart restores remote configs before a normal price sync can overwrite them',async()=>{
  const {ctx,local,cloud,calls}=configContext();local.extensionConfigOwner='alice';
  cloud.alice={chartFavourites:['QNBK'],syncConfig:{minPushIntervalMinutes:7}};
  await vm.runInContext('saveExtensionConfigs(async()=>({uid:"alice",idToken:"token"}))',ctx);
  assert.deepEqual(local.chartFavourites,['QNBK']);assert.equal(local.syncConfig.minPushIntervalMinutes,7);
  assert.equal(calls.filter(c=>c.method==='PUT').length,0);
});

test('Offline account switching clears another account settings and reports the load failure',async()=>{
  const {ctx,local,setFailure}=configContext();
  await vm.runInContext('restoreExtensionConfigs({uid:"alice",idToken:"token"})',ctx);
  setFailure(true);
  await assert.rejects(vm.runInContext('restoreExtensionConfigs({uid:"bob",idToken:"token"})',ctx),/Cannot load/);
  assert.deepEqual(local.chartFavourites,[]);assert.equal(local.syncConfig.minPushIntervalMinutes,2);
  assert.equal(local.extensionConfigOwner,'bob');assert.match(local.configSyncStatus.error,/Cannot load/);
});

test('Root QSE migration preserves old history and existing root values without user-scoped market data',async()=>{
  const point={price:10,time:'2026-10-01T12:00:00Z',date:'2026-10-01'};
  const {ctx,get,calls}=databaseContext({stockData:{QSE:{prices:{QFLS:10,QNBK:12},priceHistory:{QFLS:{0:point}},tickerNames:{QFLS:'Legacy'}}},QSE:{prices:{QFLS:11}}});
  await vm.runInContext('ensureQseRoot({idToken:"token"})',ctx);
  assert.equal(get('QSE/prices/QFLS'),11);assert.equal(get('QSE/prices/QNBK'),12);
  assert.deepEqual(get('QSE/priceHistory/QFLS/0'),point);assert.equal(get('QSE/migrationVersion'),2);
  assert.equal(get('stockData/QSE/prices/QFLS'),10);
  assert.ok(calls.filter(c=>c.method!=='GET').every(c=>c.path==='QSE'));
  calls.length=0;await vm.runInContext('ensureQseRoot({idToken:"other-user"})',ctx);
  assert.equal(calls.length,0);
});

test('Saving extension timing preserves favourite changes made in the webapp',async()=>{
 const {ctx,local,cloud,calls}=configContext();await vm.runInContext('restoreExtensionConfigs({uid:"alice",idToken:"token"})',ctx);
 cloud.alice.chartFavourites=['QNBK'];local.syncConfig={minPushIntervalMinutes:9};
 await vm.runInContext('saveExtensionConfigs(async()=>({uid:"alice",idToken:"token"}),true)',ctx);
 assert.deepEqual(cloud.alice.chartFavourites,['QNBK']);assert.equal(cloud.alice.syncConfig.minPushIntervalMinutes,9);
 const body=JSON.parse(calls.at(-1).body);assert.equal(body.chartFavourites,undefined);
});
