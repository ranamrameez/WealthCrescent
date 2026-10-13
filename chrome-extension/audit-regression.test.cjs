const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('../webapp/node_modules/jsdom');
const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function worker({ push, tabs, scrape } = {}) {
  let handler;
  const status = {}, events = [], alarms = [];
  let config = { scrapingEnabled: true, minPushIntervalMinutes: 0, scrapeIntervalSeconds: 0, respectTimeWindows: false, scrapeOnPriceChange: true };
  const ctx = vm.createContext({ console, Date, URL, URLSearchParams,
    getAuth: async () => ({ uid: 'user', idToken: 'token', expiresAt: Date.now() + 60000 }),
    getScrapeConfig: async () => ({ targetUrl: 'https://market.example/market' }),
    getSyncConfig: async () => config, setSyncConfig: async patch => { config = { ...config, ...patch }; },
    getStatus: async () => ({ ...status }), patchStatus: async patch => Object.assign(status, patch),
    recordActivity: async event => events.push(event), saveAudit: async () => 1, markAuditSynced: async () => {},
    withinScrapingWindow: () => true, pushDelayMs: () => 0,
    chrome: { tabs: { query: async () => tabs ?? [{ id: 1, url: 'https://market.example/market' }], sendMessage: (id, message, cb) => cb(scrape ?? { ok: true, rows: [{ ticker: 'QFLS', price: 10 }] }) },
      alarms: { create: (name, options) => alarms.push({ name, ...options }), clear: async () => {}, onAlarm: { addListener() {} } },
      runtime: { onInstalled: { addListener() {} }, onStartup: { addListener() {} }, onMessage: { addListener(fn) { handler = fn; } } } },
    fakePush: push || (async () => ({ pushed: 1, namesPushed: 0, total: 1, errors: [], syncedTickers: ['QFLS'] })),
  });
  vm.runInContext(read('background.js').replace(/import\s+[\s\S]*?from\s+'[^']+';/g, ''), ctx);
  vm.runInContext('pushRows = fakePush', ctx);
  return { ctx, status, events, alarms, send: (type, fields = {}) => new Promise(resolve => handler({ type, ...fields }, {}, resolve)) };
}

test('Action response waits for completion, exposes busy status and rejects conflicting requests', async () => {
  const hold = deferred(); let responded = false;
  const w = worker({ push: async () => { await hold.promise; return { pushed: 1, namesPushed: 0, total: 1, errors: [], syncedTickers: ['QFLS'] }; } });
  const first = w.send('PUSH_NOW').then(response => { responded = true; return response; });
  await tick();
  assert.equal(responded, false);
  assert.equal(w.status.actionBusy, true);
  assert.equal(w.status.syncState, 'Syncing');
  const second = await w.send('TEST_SCRAPE');
  assert.equal(second.ok, false);
  assert.match(second.error, /Wait for completion/);
  assert.equal(w.status.actionBusy, true);
  hold.resolve();
  const result = await first;
  assert.equal(result.ok, true);
  assert.equal(result.status.actionBusy, false);
  assert.equal(result.status.cycleBusy, false);
  assert.equal(w.status.actionBusy, false);
  assert.equal(w.status.cycleBusy, false);
  assert.equal(w.status.syncState, 'Synced');
});

test('Manual actions report missing market tabs and zero rows as failures', async () => {
  for (const setup of [{ tabs: [] }, { scrape: { ok: true, rows: [] } }]) {
    const w = worker(setup);
    const response = await w.send('SCRAPE_NOW_MANUAL');
    assert.equal(response.ok, false);
    assert.ok(response.error);
    assert.equal(w.status.actionBusy, false);
  }
});

test('Partial sync reports an action failure once and retains a scheduled retry', async () => {
  const w = worker({ push: async () => ({ pushed: 0, namesPushed: 0, total: 1, errors: ['Write denied'], syncedTickers: [] }) });
  const response = await w.send('PUSH_NOW');
  assert.equal(response.ok, false);
  assert.match(response.error, /Write denied/);
  assert.equal(w.events.filter(event => event.type === 'sync').length, 1);
  assert.equal(w.status.syncState, 'Retrying');
  assert.equal(w.status.lastPushAt, undefined);
  assert.ok(w.alarms.some(alarm => alarm.name === 'sync-retry'));
});

test('Stop waits for in-flight sync and leaves the final worker state stopped', async () => {
  const hold = deferred();
  const w = worker({ push: async () => { await hold.promise; return { pushed: 1, namesPushed: 0, total: 1, errors: [], syncedTickers: ['QFLS'] }; } });
  const first = w.send('PUSH_NOW'); await tick();
  let stopped = false;
  const stop = w.send('STOP_SCRAPING').then(response => { stopped = true; return response; });
  await tick(); assert.equal(stopped, false);
  hold.resolve(); await Promise.all([first, stop]);
  assert.equal(w.status.scrapeState, 'Stopped');
  assert.equal(w.status.syncState, 'Stopped');
});

test('Page URL matching excludes unrelated tabs and prefix lookalikes', async () => {
  const w = worker({ tabs: [{ id: 1, url: 'https://market.example/market-extra' }, { id: 2, url: 'https://market.example/account' }] });
  assert.equal((await w.send('SCRAPE_NOW_MANUAL')).ok, false);
});

test('Shared action UI blocks conflicting clicks, shows phase changes and unlocks after completion', async () => {
  const dom = new JSDOM('<h1>Extension</h1><button class="scrape-control">Scrape</button><button class="push-control">Sync</button>');
  const document = dom.window.document;
  let listener, stored = { status: {}, syncConfig: { scrapingEnabled: true } }, clicks = 0;
  document.querySelector('.push-control').onclick = () => clicks++;
  const ctx = vm.createContext({ document, MutationObserver: dom.window.MutationObserver, resolveActionFeedback: (await import('data:text/javascript;base64,' + Buffer.from(read('notifications.js')).toString('base64'))).resolveActionFeedback,
    chrome: { storage: { local: { get: async () => stored }, onChanged: { addListener(fn) { listener = fn; } } } },
  });
  vm.runInContext(read('action-ui.js').replace(/^import .*;\r?\n/gm, ''), ctx); await tick();
  document.dispatchEvent(new dom.window.CustomEvent('extension-action', { detail: { key: 'worker-message', busy: true } }));
  const button = document.querySelector('.push-control');
  assert.equal(button.disabled, true);
  button.disabled = false; button.click(); assert.equal(clicks, 0);
  stored = { ...stored, status: { cycleBusy: true, syncState: 'Syncing' } };
  listener({ status: {} }, 'local'); await tick();
  assert.match(document.querySelector('.action-status').textContent, /Syncing prices/);
  stored = { ...stored, status: { cycleBusy: false, syncState: 'Synced', actionCompletedAt: Date.now() } };
  listener({ status: {} }, 'local');
  document.dispatchEvent(new dom.window.CustomEvent('extension-action', { detail: { key: 'worker-message', busy: false } }));
  await tick();
  assert.equal(button.disabled, false);
  button.click(); assert.equal(clicks, 1);
  assert.match(document.querySelector('.action-status').textContent, /Prices collected and synced/);
  dom.window.close();
});

test('Combined filters consistently select table and chart records', async () => {
  const { paginatePushed } = await import('data:text/javascript;base64,' + Buffer.from(read('pushed-data.js')).toString('base64'));
  const rows = [
    { id: '1', ticker: 'QFLS', price: 10, capturedAt: Date.parse('2026-10-12T10:00:00Z'), origin: 'local', accepted: true, strategy: 'heuristic', source: 'automatic', outlier: true },
    { id: '2', ticker: 'QFLS', price: 11, capturedAt: Date.parse('2026-10-12T11:00:00Z'), origin: 'local', accepted: false, strategy: 'heuristic', source: 'test', outlier: true },
    { id: '3', ticker: 'QNBK', price: 12, capturedAt: Date.parse('2026-10-12T10:00:00Z'), origin: 'firebase', kind: 'history' },
  ];
  const result = paginatePushed(rows, { ticker: 'QFLS', from: '2026-10-12', to: '2026-10-12', source: 'automatic', strategy: 'heuristic', accepted: 'true', outliers: 'true' });
  assert.equal(result.total, 1);
  assert.equal(result.rows[0].id, '1');
  assert.equal(result.chartRows.length, 1);
  assert.equal(result.chartRows[0].price, 10);
  assert.equal(paginatePushed(rows, { ticker: 'QNBK', accepted: 'true' }).total, 1);
});

test('Saved charts load on demand and use only the shared date and outlier filters', async () => {
  const dom = new JSDOM(read('options.html')), document = dom.window.document;
  const requests = [], rows = [{ id: '1', ticker: 'QFLS', price: 10, capturedAt: Date.now(), origin: 'firebase' }];
  const ctx = vm.createContext({ document, Date, Number, JSON,
    qatarDate: () => '2026-10-12', dateRange: period => ({ from: period === '7d' ? '2026-10-06' : '', to: period === '7d' ? '2026-10-12' : '' }),
    getChartFavourites: async () => ['QFLS'], setChartFavourites: async () => {}, renderPriceChart() {}, mountConfig: async () => {}, mountControls: async () => {}, mountStats: async () => {},
    sendWorkerMessage: async message => { requests.push(message); return { rows, chartRows: rows, total: 1, tickers: ['QFLS'] }; },
    chrome: { storage: { local: { get: async () => ({}), set: async () => {} }, onChanged: { addListener() {} } } },
  });
  await vm.runInContext('(async () => {' + read('options.js').replace(/^import .*;\r?\n/gm, '') + '})()', ctx);
  assert.equal(requests.filter(request => request.filters).at(-1).filters.from, '2026-10-12');
  document.getElementById('outlierFilter').value = 'true';
  document.getElementById('outlierFilter').dispatchEvent(new dom.window.Event('change'));
  await tick();
  assert.equal(requests.filter(request => request.filters).at(-1).filters.outliers, 'true');
  document.getElementById('loadFavouriteCharts').onclick();
  assert.equal(document.querySelectorAll('[data-favourite-period]').length, 0);
  await document.querySelector('[data-period="7d"]').onclick();
  assert.equal(requests.filter(request => request.filters).at(-1).filters.from, '2026-10-06');
  assert.equal(document.getElementById('fromDate').value, '2026-10-06');
  assert.equal(requests.filter(request => request.filters).at(-1).filters.outliers, 'true');
  dom.window.close();
});


test('A stale filter response cannot overwrite the latest table or chart selection', async () => {
  const dom = new JSDOM(read('options.html')), document = dom.window.document;
  const hold = deferred();
  const record = price => ({ id: String(price), ticker: 'QFLS', price, capturedAt: Date.now(), origin: 'firebase' });
  const result = price => ({ rows: [record(price)], chartRows: [record(price)], total: 1, tickers: ['QFLS'] });
  const ctx = vm.createContext({ document, Date, Number, JSON,
    qatarDate: () => '2026-10-12', getChartFavourites: async () => [], setChartFavourites: async () => {}, renderPriceChart() {}, mountConfig: async () => {}, mountControls: async () => {}, mountStats: async () => {},
    sendWorkerMessage: async message => message.filters?.from === '2026-10-01' ? hold.promise : result(message.filters?.from === '2026-10-05' ? 20 : 10),
    chrome: { storage: { onChanged: { addListener() {} } } },
  });
  await vm.runInContext('(async () => {' + read('options.js').replace(/^import .*;\r?\n/gm, '') + '})()', ctx);
  const from = document.getElementById('fromDate');
  from.value = '2026-10-01'; from.dispatchEvent(new dom.window.Event('change')); await tick();
  from.value = '2026-10-05'; from.dispatchEvent(new dom.window.Event('change')); await tick();
  const latest = document.getElementById('dataRows').textContent;
  assert.match(latest, /20/);
  hold.resolve(result(99)); await tick();
  assert.equal(document.getElementById('dataRows').textContent, latest);
  dom.window.close();
});

test('Background configuration changes preserve unsaved timing edits', async () => {
  const dom = new JSDOM('<div id="config"></div>'), document = dom.window.document;
  let listener, sent;
  const ctx = vm.createContext({ document, URL,
    getScrapeConfig: async () => ({ targetUrl: 'https://webd.thegroup.com.qa/en/markets/qatar' }),
    getSyncConfig: async () => ({ minPushIntervalMinutes: 0, pushTimingMode: 'constant', scrapeIntervalSeconds: 0, scrapeOnPriceChange: true, respectTimeWindows: false, timeWindows: [{ start: '09:30', end: '13:00' }] }),
    sendWorkerMessage: async message => { sent = message; },
    chrome: { storage: { onChanged: { addListener(fn) { listener = fn; } } } },
  });
  vm.runInContext(read('config-ui.js').replace(/^import .*;\r?\n/gm, '').replace(/export /g, ''), ctx);
  await vm.runInContext('mountConfig(document.getElementById("config"))', ctx);
  const input = document.querySelector('[name="scrapeIntervalSeconds"]');
  input.value = '7'; input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await listener({ syncConfig: {} }, 'local');
  assert.equal(input.value, '7');
  await document.querySelector('form').onsubmit({ preventDefault() {} });
  assert.equal(sent.type, 'SAVE_CONFIGS');
  assert.equal(sent.sync.scrapeIntervalSeconds, 7);
  dom.window.close();
});

test('Transient authentication service failure does not sign the user out', async () => {
  const w = worker(); let cleared = false;
  w.ctx.SECURE_TOKEN_BASE = "https://auth.example"; w.ctx.FIREBASE_API_KEY = "test";
  w.ctx.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
  w.ctx.clearAuth = async () => { cleared = true; };
  await assert.rejects(vm.runInContext('refreshAuth({ refreshToken: "refresh", email: "user@example.com" })', w.ctx), /Authentication service unavailable/);
  assert.equal(cleared, false);
});

test('Concurrent Firebase data queries reuse the same in-flight snapshot read', async () => {
  const w = worker(), hold = deferred(); let reads = 0;
  w.ctx.RTDB_BASE_URL = 'https://database.example';
  w.ctx.fetch = async () => { reads++; await hold.promise; return { ok: true, json: async () => ({}) }; };
  w.ctx.pushedRecords = () => [];
  w.ctx.paginatePushed = rows => ({ rows, total: rows.length });
  vm.runInContext('ensureQseRoot = async () => {}', w.ctx);
  const first = vm.runInContext('queryPushedData({})', w.ctx);
  const second = vm.runInContext('queryPushedData({})', w.ctx);
  await tick(); assert.equal(reads, 4);
  hold.resolve(); await Promise.all([first, second]);
  assert.equal(reads, 4);
});


test('Manual collection and sync bypass time windows and the stopped automatic state', async () => {
  let pushes = 0;
  const w = worker({ push: async () => { pushes++; return { pushed: 1, namesPushed: 0, total: 1, errors: [], syncedTickers: ['QFLS'] }; } });
  w.ctx.withinScrapingWindow = () => false;
  await vm.runInContext('runCycle()', w.ctx);
  assert.equal(w.events.length, 0);
  assert.equal(w.status.scrapeState, 'Outside time window');
  assert.equal((await w.send('SCRAPE_NOW_MANUAL')).ok, true);
  assert.equal((await w.send('PUSH_NOW')).ok, true);
  assert.equal(pushes, 1);
  await w.send('STOP_SCRAPING');
  assert.equal((await w.send('SCRAPE_NOW_MANUAL')).ok, true);
  assert.equal((await w.send('PUSH_NOW')).ok, true);
  assert.equal(pushes, 2);
  assert.equal((await w.send('START_SCRAPING')).ok, true);
  assert.equal(pushes, 3, 'Start takes an immediate sample outside the schedule');
});
