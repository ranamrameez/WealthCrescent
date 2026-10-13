const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { JSDOM } = require('../webapp/node_modules/jsdom');
const read = name => fs.readFileSync(path.join(__dirname,name),'utf8');
const source = name => read(name).split(String.fromCharCode(10)).filter(line => !line.startsWith('import ')).join(String.fromCharCode(10));
const tick = () => new Promise(resolve => setImmediate(resolve));
const feedbackModule = () => import('data:text/javascript;base64,' + Buffer.from(read('notifications.js')).toString('base64'));

test('Feedback has one current type, suppresses stale gated errors, and uses the actual manual outcome', async () => {
  const { resolveActionFeedback } = await feedbackModule();
  const gated = resolveActionFeedback({ scrapeState:'Outside time window', syncState:'Outside time window', lastError:'Scrape failed: old connection error' });
  assert.equal(gated.type,'warning'); assert.doesNotMatch(gated.message,/Action complete|old connection/);
  assert.equal(resolveActionFeedback({ scrapeState:'Stopped' }).type,'stopped');
  assert.equal(resolveActionFeedback({ actionError:'Write denied' }).type,'error');
  assert.equal(resolveActionFeedback({ syncState:'Synced' }).type,'success');
  const manual = resolveActionFeedback({ actionCompletedAt:123, lastActionType:'PUSH_NOW', lastActionScrapeState:'Watching prices', lastActionSyncState:'Synced', scrapeState:'Outside time window', syncState:'Outside time window' });
  const local = resolveActionFeedback({ actionCompletedAt:124, lastActionType:'SCRAPE_NOW_MANUAL', lastActionScrapeState:'Watching prices', lastActionSyncState:'Stopped', scrapeState:'Stopped',syncState:'Stopped' });
  assert.equal(local.type,'success'); assert.match(local.message,/saved locally/);
  assert.equal(manual.type,'success'); assert.match(manual.message,/synced/);
});

test('Statistics information stays open and stale errors are identified as history', async () => {
  const dom = new JSDOM('<div id="stats"></div>'), document = dom.window.document;
  let listener, refreshTimer;
  const ctx = vm.createContext({ document, window:dom.window, Date,
    getActivity:async()=>({ daily:{ scrapeCount:1, scrapedRows:1, syncedRows:0, syncCount:0, syncAttempts:0, syncFailures:0, scrapeFailures:0, testCount:0 }, lastSyncError:'Previous sync failure' }),
    getStatus:async()=>({ scrapeState:'Outside time window', syncState:'Outside time window', lastError:'Scrape failed: old error', lastScrapeError:'Old page connection failed' }),
    getSyncConfig:async()=>({ scrapingEnabled:true }), summarizeAuditToday:async()=>({ scrapeCount:1,rowCount:1,syncedRows:0 }), qatarDate:()=> '2026-10-12',
    chrome:{ storage:{ local:{ get:async()=>({}) }, onChanged:{ addListener:fn=>{listener=fn}, removeListener(){} } } },
    setInterval:fn=>{refreshTimer=fn;return 1},clearInterval(){},
  });
  vm.runInContext(source('stats-ui.js').replace(/export /g,''),ctx);
  await vm.runInContext('mountStats(document.getElementById("stats"))',ctx);
  const info = document.querySelector('.statistics-info'); info.open=true;
  await refreshTimer(); await tick();
  assert.equal(document.querySelector('.statistics-info'),info); assert.equal(info.open,true);
  listener({status:{}},'local'); await tick(); assert.equal(info.open,true);
  assert.doesNotMatch(document.querySelector('#stats > .error').textContent,/old error|Previous sync failure/);
  assert.match(info.textContent,/Previous scrape error: Old page connection failed/);
  assert.ok(info.classList.contains('wc-info-wrap')); dom.window.close();
});

test('Shared controls have descriptive tooltips and selected chips update without disappearing', async () => {
  const dom = new JSDOM(read('options.html')), document=dom.window.document;
  const ctx=vm.createContext({document,MutationObserver:dom.window.MutationObserver});
  vm.runInContext(read('ui-controls.js'),ctx); await tick();
  for (const element of document.querySelectorAll('button,input,select,summary,a[href],th')) assert.ok(element.title,'Missing tooltip: '+element.outerHTML.slice(0,120));
  const chips=document.querySelectorAll('[data-period]'); assert.equal(document.querySelectorAll('#filterCard [data-period]').length,chips.length);
  const seven=document.querySelector('[data-period="7d"]'); seven.setAttribute('aria-pressed','true'); await tick();
  assert.ok(seven.classList.contains('is-selected')); assert.equal(seven.textContent,'Past 7 days');
  assert.match(document.getElementById('pushNowBtn')?.title || document.querySelector('#loadFavouriteCharts').title,/shared filters/);
  assert.ok(document.getElementById('deleteOutliers').classList.contains('wc-button--danger'));
  const dynamic=document.createElement('button');dynamic.textContent='Scrape now';dynamic.className='scrape-control';document.body.append(dynamic);await tick();
  assert.match(dynamic.title,/outside the automatic schedule/);assert.ok(dynamic.classList.contains('wc-button--secondary'));
  dom.window.close();
});

test('Toasts do not repeat for background collection and can be dismissed', async () => {
  const {resolveActionFeedback}=await feedbackModule();
  const dom=new JSDOM('<h1>Extension</h1>'),document=dom.window.document;
  let listener,stored={status:{},syncConfig:{scrapingEnabled:true}};
  const ctx=vm.createContext({document,resolveActionFeedback,MutationObserver:dom.window.MutationObserver,chrome:{storage:{local:{get:async()=>stored},onChanged:{addListener:fn=>{listener=fn}}}}});
  vm.runInContext(source('action-ui.js'),ctx);await tick();
  const toast=document.querySelector('.wc-toast');assert.equal(toast.hidden,true);
  stored.status={actionCompletedAt:100,lastActionType:'PUSH_NOW',syncState:'Synced'};listener({status:{}},'local');await tick();
  assert.equal(toast.dataset.type,'success');assert.match(toast.textContent,/Success: Prices collected and synced/);
  toast.querySelector('button').click();assert.equal(toast.hidden,true);
  stored.status={...stored.status,cycleBusy:true,syncState:'Syncing'};listener({status:{}},'local');await tick();assert.equal(toast.hidden,true);
  stored.status={...stored.status,cycleBusy:false,syncState:'Synced'};listener({status:{}},'local');await tick();assert.equal(toast.hidden,true);
  stored.status={actionCompletedAt:101,scrapeState:'Outside time window',syncState:'Outside time window',lastError:'Scrape failed: old error'};listener({status:{}},'local');await tick();
  assert.equal(toast.dataset.type,'warning');assert.doesNotMatch(toast.textContent,/old error|Action complete/);dom.window.close();
});


test('Top-bar filters open a modal with the original shared controls and close with Done', async () => {
  const dom = new JSDOM(read('options.html')), document = dom.window.document;
  dom.window.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function() { this.open = false; };
  const ctx = vm.createContext({ document, chrome:{ storage:{ local:{ get:async()=>({}), set:async()=>{} } } } });
  const original = document.getElementById('tickerFilter');
  await vm.runInContext('(async()=>{' + read('page-ui.js') + '})()',ctx);
  const button = document.querySelector('.extension-nav #openFilters'), dialog = document.getElementById('filterDialog');
  assert.equal(button.getAttribute('aria-haspopup'),'dialog');
  button.click(); assert.equal(dialog.open,true);
  assert.equal(dialog.querySelector('#tickerFilter'),original);
  assert.equal(document.getElementById('section-filterCard').hidden,true);
  dialog.querySelector('header button').click(); assert.equal(dialog.open,false);
  dom.window.close();
});


test('Charts have a header legend and one latest reported range per day', async () => {
  const { renderPriceChart } = await import('data:text/javascript;base64,' + Buffer.from(read('price-chart.js')).toString('base64'));
  const dom = new JSDOM('<div id="chart"></div>'), chart = dom.window.document.getElementById('chart');
  const rows = Array.from({length:50},(_,index)=>({ticker:'QNBK',price:10+index/100,capturedAt:Date.UTC(2026,9,12,7)+index*1000,dayHigh:11,dayLow:9}));
  renderPriceChart(chart,rows,'QNBK',{favourites:new Set(),onFavourite:async()=>{}});
  assert.equal(chart.querySelector('.chart-toolbar h3').textContent,'QNBK');
  assert.ok(chart.querySelector('.chart-toolbar .chart-favourite'));
  assert.equal(chart.querySelectorAll('[data-role="daily-range"]').length,1);
  assert.equal(chart.querySelectorAll('.chart-legend .legend-item').length,3);
  assert.match(chart.querySelector('.legend-range').title,/times of the extrema are unknown/);
  assert.doesNotMatch(chart.textContent,/Blue: sampled/);
  dom.window.close();
});
