const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');

test('Qatar schedule boundaries, overnight windows and configuration validation', async () => {
  const storage = {};
  global.chrome = { storage: { local: { get: async key => ({ [key]: storage[key] }), set: async patch => Object.assign(storage, patch) } } };
  const common = await import('data:text/javascript;base64,' + Buffer.from(read('common.js')).toString('base64'));
  const config = await common.getSyncConfig();
  for (const [time, expected] of [['06:29', false], ['06:30', true], ['09:59', true], ['10:00', false], ['10:10', true], ['10:15', false]]) {
    assert.equal(common.withinScrapingWindow(config, new Date(`2026-10-04T${time}:00Z`)), expected, time);
  }
  assert.equal(common.withinScrapingWindow({ timeWindows: [{ start: '23:00', end: '01:00' }] }, new Date('2026-10-04T21:00:00Z')), true);
  await assert.rejects(common.setSyncConfig({ timeWindows: [] }));
  await assert.rejects(common.setSyncConfig({ timeWindows: [{ start: '09:30', end: '09:30' }] }));
  await common.setSyncConfig({ scrapingEnabled: false });
  assert.equal((await common.getSyncConfig()).scrapingEnabled, false);
});

function cell(value, key) { return { textContent: value, getAttribute: name => name === 'col-id' ? key : null }; }
function context(document) {
  return vm.createContext({ document, chrome: { runtime: { onMessage: { addListener() {} } } } });
}

test('AG Grid price uses lastPrice and preserves raw volume and price text', () => {
  const cells = { askVolume: cell('123,456', 'askVolume'), lastPrice: cell(' 12.340 ', 'lastPrice'), name: cell('Company', 'name') };
  const row = { getAttribute: () => 'QNBK', querySelector: selector => cells[selector.match(/"(.*?)"/)[1]], querySelectorAll: () => Object.values(cells) };
  const ctx = context({ querySelectorAll: () => [row] }); vm.runInContext(read('content.js'), ctx);
  const result = JSON.parse(vm.runInContext('JSON.stringify({ rows: scrapeAgGrid(), audit: auditRows })', ctx));
  assert.equal(result.rows[0].price, 12.34);
  assert.equal(result.rows[0].priceKey, 'lastPrice');
  assert.deepEqual(result.audit[0].raw[0], { key: 'askVolume', value: '123,456' });
  assert.equal(result.audit[0].selected.price, ' 12.340 ');
});

test('Configured invalid and zero prices remain in audit but are not pushed', () => {
  const rows = ['bad', '0', '4.5'].map(value => {
    const cells = { '.ticker': cell('QNBK'), '.price': cell(value) };
    return { querySelector: selector => cells[selector], querySelectorAll: () => Object.values(cells) };
  });
  const ctx = context({ querySelectorAll: () => rows }); vm.runInContext(read('content.js'), ctx);
  const result = JSON.parse(vm.runInContext(`JSON.stringify({ rows: scrapeWithConfig({ rowSelector: '.row', tickerSelector: '.ticker', priceSelector: '.price' }), audit: auditRows })`, ctx));
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.audit.map(row => row.accepted), [false, false, true]);
  assert.equal(result.audit[0].selected.price, 'bad');
});

test('Stopped and out-of-window automatic cycles never access the market tab; stopping clears alarm', async () => {
  let config = { scrapingEnabled: false };
  let queried = 0, cleared = 0, scheduled = 0, handler;
  const ctx = vm.createContext({
    console,
    getSyncConfig: async () => config,
    setSyncConfig: async patch => { config = { ...config, ...patch }; },
    withinScrapingWindow: () => false,
    randInt: () => 60,
    COLLECT_MIN_SECONDS: 45, COLLECT_MAX_SECONDS: 90,
    chrome: {
      tabs: { query: async () => { queried++; return []; } },
      alarms: { create: () => scheduled++, clear: async () => cleared++, onAlarm: { addListener() {} } },
      runtime: { onInstalled: { addListener() {} }, onStartup: { addListener() {} }, onMessage: { addListener(fn) { handler = fn; } } },
    },
  });
  const code = read('background.js').replace(/import\s+[\s\S]*?from\s+'[^']+';/g, '');
  vm.runInContext(code, ctx);
  await vm.runInContext('runCycle()', ctx);
  assert.equal(queried, 0); assert.equal(scheduled, 0);
  config.scrapingEnabled = true;
  await vm.runInContext('runCycle()', ctx);
  assert.equal(queried, 0); assert.ok(scheduled > 0);
  const response = await new Promise(resolve => handler({ type: 'STOP_SCRAPING' }, {}, resolve));
  assert.equal(response.ok, true); assert.equal(config.scrapingEnabled, false); assert.ok(cleared > 0);
});

test('Test scrape saves legacy worker results and renders them in the table', async () => {
  const { JSDOM } = require('../webapp/node_modules/jsdom');
  const dom = new JSDOM(read('options.html'));
  const document = dom.window.document;
  let saved = [], changed;
  const ctx = vm.createContext({
    document, console, Date, JSON, Number,
    mountConfig: async container => { container.innerHTML = '<form>' + ['targetUrl', 'rowSelector', 'tickerSelector', 'priceSelector', 'changeSelector', 'nameSelector'].map(key => `<input name="${key}" value="">`).join('') + '</form>'; },
    mountControls: async () => {},
    sendWorkerMessage: async () => ({ ok: true, rows: [{ ticker: 'QNBK', price: 12.34 }], auditRows: [], strategy: 'heuristic' }),
    saveAudit: async result => { saved = result.rows.map(row => ({ ...row, accepted: true, capturedAt: Date.now(), source: 'test', strategy: result.strategy })); },
    queryAudit: async () => ({ rows: saved, total: saved.length }),
    chrome: { storage: { onChanged: { addListener(fn) { changed = fn; } } } },
  });
  const code = read('options.js').replace(/^import .*;\r?\n/gm, '');
  await vm.runInContext('(async () => { const renderPriceChart = () => {}; const mountStats = async () => {}; const getChartFavourites = async () => []; const setChartFavourites = async () => {}; const qatarDate = () => "2026-10-11"; const dateRange = period => period === "all" ? { from: "", to: "" } : { from: "2026-10-05", to: "2026-10-11" }; ' + code + '\n})()', ctx);
  document.getElementById('tickerFilter').value = 'OTHER';
  await document.getElementById('testBtn').onclick();
  assert.equal(saved.length, 1);
  assert.equal(document.getElementById('dataRows').children.length, 1);
  assert.match(document.getElementById('dataRows').textContent, /QNBK/);
  assert.equal(document.getElementById('tickerFilter').value, '');
  assert.equal(typeof changed, 'function');
});

test('Old workers receive an actionable reload error', async () => {
  global.chrome.runtime = { sendMessage: async () => ({ ok: false, error: 'Unknown message type: STOP_SCRAPING' }) };
  const common = await import('data:text/javascript;base64,' + Buffer.from(read('common.js')).toString('base64'));
  await assert.rejects(common.sendWorkerMessage({ type: 'STOP_SCRAPING' }), /chrome:\/\/extensions/);
});

test('Firebase history normalizes arrays and keyed points, filters Qatar dates and paginates', async () => {
  const module = await import('data:text/javascript;base64,' + Buffer.from(read('pushed-data.js')).toString('base64'));
  const rows = module.pushedRecords({ history: { QNBK: [{ time: '2026-10-03T22:00:00Z', price: 12 }, { time: '2026-10-04T10:00:00Z', price: 13 }], QIBK: { abc: { date: '2026-10-02', price: 20 }, bad: null } }, prices: { QNBK: 13, NEW: 7 }, names: { QNBK: 'Qatar National Bank' }, updatedAt: '2026-10-04T11:00:00Z' });
  assert.equal(rows.length, 4);
  assert.equal(rows.find(row => row.ticker === 'NEW').source, 'Firebase current price');
  assert.equal(rows.find(row => row.ticker === 'QNBK').name, 'Qatar National Bank');
  const first = module.paginatePushed(rows, { from: '2026-10-04', to: '2026-10-04', ticker: 'qnb', pageSize: 1 });
  const second = module.paginatePushed(rows, { from: '2026-10-04', to: '2026-10-04', ticker: 'QNB', page: 2, pageSize: 1 });
  assert.equal(first.total, 2);
  assert.equal(first.rows[0].price, 13);
  assert.equal(second.rows[0].price, 12);
  assert.deepEqual(module.paginatePushed(module.pushedRecords({ history: null, prices: null })), { rows: [], total: 0, tickers: [], chartRows: [], outlierRows: [] });
});

test('Pushed-data handler reads Firebase and returns previous history without scraping', async () => {
  let handler; const urls = [];
  const ctx = vm.createContext({ console, Date, encodeURIComponent,
    pushedRecords: ({ history }) => history.QNBK,
    paginatePushed: rows => ({ rows, total: rows.length }),
    getAuth: async () => ({ uid: 'user', idToken: 'token', expiresAt: Date.now() + 60000 }),
    RTDB_BASE_URL: 'https://database.example',
    fetch: async url => { urls.push(url); return { ok: true, headers:{get:()=> 'v1'}, json: async () => url.includes('/migrationVersion.') ? 2 : url.includes('/priceHistory.') ? { QNBK: [{ price: 12.34, date: '2026-10-01' }] } : null }; },
    chrome: { alarms: { onAlarm: { addListener() {} } }, runtime: { onInstalled: { addListener() {} }, onStartup: { addListener() {} }, onMessage: { addListener(fn) { handler = fn; } } } },
  });
  vm.runInContext(read('background.js').replace(/import\s+[\s\S]*?from\s+'[^']+';/g, ''), ctx);
  const response = await new Promise(resolve => handler({ type: 'GET_PUSHED_DATA', filters: {} }, {}, resolve));
  assert.equal(response.ok, true); assert.equal(response.rows[0].price, 12.34);
  assert.equal(urls.length, 5);
  await new Promise(resolve => handler({ type: 'GET_PUSHED_DATA' }, {}, resolve));
  assert.equal(urls.length, 5, 'Pagination reuses the snapshot');
});

test('Page defaults to combined data and today, with working chart date presets', async () => {
  const { JSDOM } = require('../webapp/node_modules/jsdom');
  const document = new JSDOM(read('options.html')).window.document;
  let requested;
  const ctx = vm.createContext({ document, console, Date, JSON, Number,
    mountConfig: async () => {}, mountControls: async () => {},
    sendWorkerMessage: async message => { requested = message; return { ok: true, total: 1, rows: [{ ticker: 'QIBK', price: 21, capturedAt: Date.now(), origin: 'firebase', syncStatus: 'Synced', source: 'Firebase history', stored: { price: 21 } }] }; },
    queryAudit: async () => { throw new Error('Must query combined data by default'); },
    chrome: { storage: { onChanged: { addListener() {} } } },
  });
  await vm.runInContext('(async () => { const renderPriceChart = () => {}; const mountStats = async () => {}; const getChartFavourites = async () => []; const setChartFavourites = async () => {}; const qatarDate = () => "2026-10-11"; const dateRange = period => period === "all" ? { from: "", to: "" } : { from: "2026-10-05", to: "2026-10-11" }; ' + read('options.js').replace(/^import .*;\r?\n/gm, '') + '\n})()', ctx);
  assert.equal(requested.type, 'GET_ALL_DATA');
  assert.equal(requested.filters.from, '2026-10-11');
  assert.equal(requested.filters.to, '2026-10-11');
  assert.equal(document.getElementById('chartTicker').value, '');
  await document.querySelector('[data-period="7d"]').onclick();
  assert.equal(requested.filters.from, '2026-10-05');
  await document.querySelector('[data-period="all"]').onclick();
  assert.equal(requested.filters.from, '');
  assert.equal(requested.filters.to, '');
  assert.match(document.getElementById('dataRows').textContent, /QIBK/);
  assert.match(document.getElementById('dataRows').textContent, /Synced/);
  assert.equal(document.getElementById('strategyFilter').disabled, true);
  assert.ok(document.getElementById('dataRows').compareDocumentPosition(document.getElementById('testBtn')) & 4);
  assert.equal(document.querySelector('.top-sections').children.length, 2);
  assert.ok(document.getElementById('activityStats').compareDocumentPosition(document.querySelector('.top-sections')) & 4);
});

test('Outliers flag changes beyond 10 percent in either direction, with source keys retained', async () => {
  const module = await import('data:text/javascript;base64,' + Buffer.from(read('pushed-data.js')).toString('base64'));
  assert.equal(module.priceDeviation(110, 100).outlier, false);
  assert.equal(module.priceDeviation(90, 100).outlier, false);
  assert.equal(module.priceDeviation(111, 100).outlier, true);
  assert.equal(module.priceDeviation(89, 100).outlier, true);
  assert.equal(module.priceDeviation(10, null).outlier, false);
  const rows = module.pushedRecords({ history: { QNBK: [{ date: '2026-10-01', price: 10 }, { date: '2026-10-02', price: 12, priceKey: 'lastPrice', raw: [{ key: 'lastPrice', value: '12' }] }] } });
  assert.equal(rows[0].outlier, true);
  assert.equal(rows[0].priceKey, 'lastPrice');
  assert.equal(rows[0].key, '1');
  assert.equal(module.paginatePushed(rows, { outliers: 'true' }).total, 1);
});

function mutationContext(initial, conflict = false) {
  const state = structuredClone(initial);
  const writes = [];
  const ctx = vm.createContext({ console, Date, encodeURIComponent,
    priceCachePath: ticker => `QSE/prices/${ticker}`,
    priceHistoryPath: ticker => `QSE/priceHistory/${ticker}`,
    getAuth: async () => ({ uid: 'user', idToken: 'token', expiresAt: Date.now() + 60000 }),
    RTDB_BASE_URL: 'https://database.example',
    fetch: async (url, options = {}) => {
      const key = url.includes('/tickers/') ? 'projection' : url.includes('/priceHistory/') ? 'history' : 'price';
      if (options.method === 'PUT') {
        assert.equal(options.headers['if-match'], 'v1');
        writes.push({ key, value: JSON.parse(options.body) });
        if (conflict) return { ok: false, status: 412 };
        state[key] = JSON.parse(options.body); return { ok: true };
      }
      return { ok: true, headers: { get: () => 'v1' }, json: async () => structuredClone(state[key]) };
    },
    chrome: { alarms: { onAlarm: { addListener() {} } }, runtime: { onInstalled: { addListener() {} }, onStartup: { addListener() {} }, onMessage: { addListener() {} } } },
  });
  vm.runInContext(read('background.js').replace(/import\s+[\s\S]*?from\s+'[^']+';/g, ''), ctx);
  vm.runInContext('ensureQseRoot = async () => {}', ctx);
  vm.runInContext(read('ticker-data.js').replace(/export /g, ''), ctx);
  return { ctx, state, writes };
}

test('Deleting latest history keeps stable keys and restores latest remaining current price', async () => {
  const { ctx, state } = mutationContext({ history: [{ price: 10, time: '2026-10-01' }, { price: 20, time: '2026-10-02' }], price: 20 });
  const results = await vm.runInContext(`mutatePushedData([{id:'history:QNBK:1',kind:'history',ticker:'QNBK',key:'1',price:20}], 'delete')`, ctx);
  assert.equal(results[0].ok, true);
  assert.equal(state.history[1], null);
  assert.equal(state.history[0].price, 10);
  assert.equal(state.price, 10);
});

test('Batch edit preserves original raw data and current price; version conflicts reject changes', async () => {
  const initial = { history: [{ price: 20, time: '2026-10-02', priceKey: 'lastPrice', raw: [{ key: 'lastPrice', value: '20' }] }], price: 20 };
  const { ctx, state } = mutationContext(initial);
  const results = await vm.runInContext(`mutatePushedData([{id:'history:QNBK:0',kind:'history',ticker:'QNBK',key:'0',price:20}], 'edit', 12)`, ctx);
  assert.equal(results[0].ok, true);
  assert.equal(state.history[0].originalPrice, 20);
  assert.equal(state.history[0].raw[0].value, '20');
  assert.equal(state.price, 12);
  const conflicting = mutationContext(initial, true);
  const failure = await vm.runInContext(`mutatePushedData([{id:'history:QNBK:0',kind:'history',ticker:'QNBK',key:'0',price:20}], 'delete')`, conflicting.ctx);
  assert.equal(failure[0].ok, false);
  assert.match(failure[0].error, /changed/);
  assert.equal(conflicting.state.history[0].price, 20);
});

test('Table populates ticker dropdown and selected-row edit sends the expected correction', async () => {
  const { JSDOM } = require('../webapp/node_modules/jsdom');
  const document = new JSDOM(read('options.html')).window.document;
  let mutation, preview;
  const row = { id: 'history:QNBK:2', kind: 'history', key: '2', ticker: 'QNBK', price: 25, priceKey: 'lastPrice', capturedAt: Date.now(), deltaPct: 25, previousPrice: 20, outlier: true, origin: 'firebase', syncStatus: 'Synced', source: 'Firebase history', stored: { time: '2026-10-04' } };
  const ctx = vm.createContext({ document, window: { confirm: text => { preview = text; return true; } }, console, Date, JSON, Number,
    mountConfig: async () => {}, mountControls: async () => {},
    sendWorkerMessage: async message => {
      if (message.type === 'MUTATE_PUSHED_DATA') { mutation = message; return { ok: true, results: [{ id: row.id, ok: true }] }; }
      return { ok: true, total: 1, rows: [row], tickers: ['QIBK', 'QNBK'] };
    },
    chrome: { storage: { onChanged: { addListener() {} } } },
  });
  await vm.runInContext('(async () => { const renderPriceChart = () => {}; const mountStats = async () => {}; const getChartFavourites = async () => []; const setChartFavourites = async () => {}; const qatarDate = () => "2026-10-11"; const dateRange = period => period === "all" ? { from: "", to: "" } : { from: "2026-10-05", to: "2026-10-11" }; ' + read('options.js').replace(/^import .*;\r?\n/gm, '') + '\n})()', ctx);
  assert.equal(document.getElementById('tickerFilter').options.length, 3);
  assert.match(document.getElementById('dataRows').textContent, /lastPrice/);
  assert.match(document.getElementById('dataRows').textContent, /FLAG 25.00%/);
  const checkbox = document.querySelector('#dataRows input');
  assert.equal(checkbox.checked, true, 'Outliers are selected automatically');
  checkbox.checked = false; checkbox.onchange();
  await document.getElementById('refreshData').onclick();
  assert.equal(document.querySelector('#dataRows input').checked, false, 'Manual deselection survives refresh');
  const refreshed = document.querySelector('#dataRows input'); refreshed.checked = true; refreshed.onchange();
  document.getElementById('batchPrice').value = '20';
  await document.getElementById('editSelected').onclick();
  assert.match(preview, /1 selected record/);
  assert.equal(mutation.price, 20);
  assert.equal(mutation.entries[0].key, '2');
  assert.equal(mutation.entries[0].price, 25);
  assert.equal(document.querySelector('.pager #nextPage').id, 'nextPage');
  assert.equal(document.getElementById('configCard').nextElementSibling.tagName, 'SCRIPT');
  assert.equal(document.querySelector('#configCard input[name="priceSelector"]'), null);
});

test('Price chart renders chronological prices, outlier markers and single-price histories', async () => {
  const { JSDOM } = require('../webapp/node_modules/jsdom');
  const module = await import('data:text/javascript;base64,' + Buffer.from(read('price-chart.js')).toString('base64'));
  const document = new JSDOM('<div id="chart"></div>').window.document;
  const container = document.getElementById('chart');
  const rows = [{ ticker: 'QNBK', price: 12, capturedAt: 2000, outlier: true, deltaPct: 20 }, { ticker: 'QNBK', price: 10, capturedAt: 1000 }, { ticker: 'QIBK', price: 50, capturedAt: 1500 }];
  module.renderPriceChart(container, rows, 'QNBK');
  assert.equal(container.querySelectorAll('circle').length, 2);
  assert.equal(container.querySelectorAll('circle[fill="#b91c1c"]').length, 1);
  assert.match(container.querySelector('svg').getAttribute('aria-label'), /QNBK/);
  assert.match(container.querySelector('circle:last-of-type title').textContent, /Flag: 20.00%/);
  module.renderPriceChart(container, rows, 'QIBK');
  assert.equal(container.querySelectorAll('circle').length, 1);
  assert.doesNotMatch(container.innerHTML, /NaN|Infinity/);
  module.renderPriceChart(container, rows, 'NONE');
  assert.match(container.textContent, /No dated prices/);
});

test('Chart includes all filtered pages and automatic outlier selection is capped at 100', async () => {
  const module = await import('data:text/javascript;base64,' + Buffer.from(read('pushed-data.js')).toString('base64'));
  const rows = Array.from({ length: 125 }, (_, index) => ({ id: String(index), ticker: 'QNBK', price: 10 + index, outlier: true, capturedAt: index + 1 }));
  const result = module.paginatePushed(rows, { pageSize: 25 });
  assert.equal(result.rows.length, 25);
  assert.equal(result.chartRows.length, 125);
  assert.equal(result.outlierRows.length, 100);
});

test('Audit cursor returns complete totals, charts and second-page results without a total variable', async () => {
  const sample = [10, 11, 13].map((price, index) => ({ id: index + 1, ticker: 'QNBK', price, accepted: true, source: 'automatic', capturedAt: Date.parse('2026-10-11T09:00:00Z') + index * 60000 }));
  const db = { close() {}, transaction() {
    const tx = { objectStore() { return { openCursor() {
      const request = {}; let index = 0;
      const next = () => queueMicrotask(() => {
        if (index >= sample.length) { request.result = null; request.onsuccess(); tx.oncomplete(); return; }
        request.result = { value: structuredClone(sample[index++]), continue: next };
        try { request.onsuccess(); } catch (error) { tx.error = error; tx.onabort(); }
      });
      next(); return request;
    } }; } };
    return tx;
  } };
  const ctx = vm.createContext({
    indexedDB: { open() { const request = {}; queueMicrotask(() => { request.result = db; request.onsuccess(); }); return request; } },
    priceDeviation: (price, previousPrice) => ({ previousPrice, deltaPct: previousPrice ? (price - previousPrice) / previousPrice * 100 : null, outlier: previousPrice ? Math.abs(price / previousPrice - 1) > .1 + 1e-9 : false }),
  });
  vm.runInContext(read('audit.js').replace(/^import .*;\r?\n/gm, '').replace(/export /g, ''), ctx);
  const result = await vm.runInContext('queryAudit({ page: 2, pageSize: 1 })', ctx);
  assert.equal(result.total, 3);
  assert.equal(result.rows[0].price, 11);
  assert.equal(result.chartRows.length, 3);
  assert.equal(result.outlierRows.length, 1);
});

test('Activity counts scrapes and syncs, persists last-sync time and resets at Qatar midnight', async () => {
  const source = read('activity.js').replace(/^import .*;\r?\n/gm, '');
  const module = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const now = Date.parse('2026-10-11T20:59:00Z');
  let activity = module.updateActivity({}, { type: 'scrape', success: true, count: 50 }, now);
  activity = module.updateActivity(activity, { type: 'scrape', success: true, count: 2, source: 'test' }, now);
  activity = module.updateActivity(activity, { type: 'scrape', success: false }, now);
  activity = module.updateActivity(activity, { type: 'sync', success: true, count: 50 }, now);
  activity = module.updateActivity(activity, { type: 'sync', success: false, count: 10 }, now);
  activity = module.updateActivity(activity, { type: 'sync', success: false, count: 0 }, now + 1000);
  assert.equal(activity.daily.scrapeCount, 2);
  assert.equal(activity.daily.scrapedRows, 52);
  assert.equal(activity.daily.testCount, 1);
  assert.equal(activity.daily.scrapeFailures, 1);
  assert.equal(activity.daily.syncCount, 2);
  assert.equal(activity.daily.syncAttempts, 3);
  assert.equal(activity.daily.syncFailures, 2);
  assert.equal(activity.daily.syncedRows, 60);
  assert.equal(activity.lastSyncAt, now, 'A wholly failed sync does not reset elapsed time');
  const tomorrow = module.dailyActivity(activity, Date.parse('2026-10-11T21:00:00Z'));
  assert.equal(tomorrow.daily.date, '2026-10-12');
  assert.equal(tomorrow.daily.scrapeCount, 0);
  assert.equal(tomorrow.daily.syncCount, 0);
  assert.equal(tomorrow.lastSyncAt, now);
});

test('Shared statistics show elapsed sync time and today counts even when signed out', async () => {
  const { JSDOM } = require('../webapp/node_modules/jsdom');
  const dom = new JSDOM('<div id="stats"></div>');
  const ctx = vm.createContext({
    Date, window: dom.window, setInterval: () => 1, clearInterval() {},
    qatarDate: () => '2026-10-11',
    summarizeAuditToday: async () => ({ scrapeCount: 4, rowCount: 200 }),
    sendWorkerMessage: async () => ({ historyPointsToday: 8 }),
    getActivity: async () => ({ trackingStartedAt: Date.now(), daily: { scrapeCount: 4, scrapedRows: 200, syncCount: 2, syncedRows: 100, syncAttempts: 3, syncFailures: 1, scrapeFailures: 0, testCount: 1 }, lastSyncAt: Date.now() - 120000 }),
    getStatus: async () => ({}), getSyncConfig: async () => ({ scrapingEnabled: false }),
    chrome: { storage: { onChanged: { addListener() {}, removeListener() {} } } },
    container: dom.window.document.getElementById('stats'),
  });
  vm.runInContext(read('stats-ui.js').replace(/^import .*;\r?\n/gm, '').replace(/export /g, ''), ctx);
  await vm.runInContext('mountStats(container)', ctx);
  const text = ctx.container.textContent;
  const panels = ctx.container.querySelectorAll('.activity-sections section');
  assert.equal(panels.length,2);
  assert.match(panels[0].textContent,/Local scrape/);
  assert.match(panels[0].textContent,/Scrapes counted today4/);
  assert.match(panels[1].textContent,/DB sync/);
  assert.match(panels[1].textContent,/Syncs counted today2/);
  assert.match(text, /Since last sync2m/);
  assert.match(text, /Scrapes counted today4/);
  assert.match(text, /Syncs counted today2/);
  assert.match(text, /Next sync dueStopped/);
  assert.ok(read('popup.html').includes('id="activityStats"'));
  const page = new JSDOM(read('options.html')).window.document;
  assert.equal(page.getElementById('signedInView').contains(page.getElementById('activityStats')), false);
});

test('Statistics remain local and show recorded evidence without unavailable placeholders', async () => {
  const { JSDOM } = require('../webapp/node_modules/jsdom');
  const dom = new JSDOM('<div id="stats"></div>');
  const ctx = vm.createContext({ Date, window: dom.window, setInterval: () => 1, clearInterval() {},
    qatarDate: () => '2026-10-11',
    summarizeAuditToday: async () => ({ scrapeCount: 13, rowCount: 13 }),
    sendWorkerMessage: async () => ({ historyPointsToday: 2 }),
    getActivity: async () => ({ daily: { scrapeCount: 0, scrapedRows: 0, syncCount: 0, syncedRows: 0, syncAttempts: 0, syncFailures: 0, scrapeFailures: 0, testCount: 0 } }),
    getStatus: async () => ({ lastPushCount: 1, lastPushAt: Date.now() - 20000, lastScrapeAt: Date.now() - 46000 }),
    getSyncConfig: async () => ({ scrapingEnabled: true }),
    chrome: { storage: { onChanged: { addListener() {}, removeListener() {} } } },
    container: dom.window.document.getElementById('stats'),
  });
  vm.runInContext(read('stats-ui.js').replace(/^import .*;\r?\n/gm, '').replace(/export /g, ''), ctx);
  await vm.runInContext('mountStats(container)', ctx);
  const text = ctx.container.textContent;
  assert.match(text, /Local scrapes recorded today13 \(13 raw rows\)/);
  assert.match(text, /Confirmed synced audit rows today0/);
  assert.match(text, /Syncs counted today0/);
  assert.match(text, /reload the extension/i);
  assert.doesNotMatch(text, /Unavailable/);
});

test('Stored audit summary counts scrape batches rather than individual ticker rows', async () => {
  const activity = await import('data:text/javascript;base64,' + Buffer.from(read('activity.js').replace(/^import .*;\r?\n/gm, '')).toString('base64'));
  const sample = [
    { ticker: 'QFLS', capturedAt: Date.parse('2026-10-10T21:01:00Z'), source: 'automatic', url: 'market' },
    { ticker: 'QNBK', capturedAt: Date.parse('2026-10-10T21:01:00Z'), source: 'automatic', url: 'market' },
    { ticker: 'QFLS', capturedAt: Date.parse('2026-10-11T09:00:00Z'), source: 'test', url: 'market' },
    { ticker: 'QFLS', capturedAt: Date.parse('2026-10-10T20:59:00Z'), source: 'automatic', url: 'market' },
  ];
  const db = { close() {}, transaction() {
    const tx = { objectStore() { return { openCursor() {
      const request = {}; let index = 0;
      const next = () => queueMicrotask(() => {
        request.result = index < sample.length ? { value: sample[index++], continue: next } : null;
        request.onsuccess(); if (!request.result) tx.oncomplete();
      }); next(); return request;
    } }; } }; return tx;
  } };
  const ctx = vm.createContext({ qatarDate: activity.qatarDate,
    indexedDB: { open() { const request = {}; queueMicrotask(() => { request.result = db; request.onsuccess(); }); return request; } },
  });
  vm.runInContext(read('audit.js').replace(/^import .*;\r?\n/gm, '').replace(/export /g, ''), ctx);
  const result = await vm.runInContext(`summarizeAuditToday(${Date.parse('2026-10-11T10:00:00Z')})`, ctx);
  assert.equal(result.scrapeCount, 2);
  assert.equal(result.rowCount, 3);
});

test('Date presets use Qatar today and clamp calendar month/year boundaries', async () => {
  const activity = await import('data:text/javascript;base64,' + Buffer.from(read('activity.js').replace(/^import .*;\r?\n/gm, '')).toString('base64'));
  const source = read('date-ranges.js').replace(/^import .*;\r?\n/gm, `const qatarDate = ${activity.qatarDate.toString()};\n`);
  const module = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const now = Date.parse('2026-10-10T22:00:00Z');
  assert.deepEqual(module.dateRange('1d', now), { from: '2026-10-11', to: '2026-10-11' });
  assert.deepEqual(module.dateRange('7d', now), { from: '2026-10-05', to: '2026-10-11' });
  for (const [period, from] of [['1M', '2026-09-11'], ['3M', '2026-07-11'], ['6M', '2026-04-11'], ['1Y', '2025-10-11']]) assert.equal(module.dateRange(period, now).from, from);
  assert.equal(module.dateRange('1M', Date.parse('2026-03-31T09:00:00Z')).from, '2026-02-28');
  assert.equal(module.dateRange('1Y', Date.parse('2024-02-29T09:00:00Z')).from, '2023-02-28');
  assert.deepEqual(module.dateRange('all', now), { from: '', to: '' });
});

test('Combined data includes synced and pending rows without ID collisions or invented sync proof', async () => {
  const module = await import('data:text/javascript;base64,' + Buffer.from(read('combined-data.js')).toString('base64'));
  const records = module.combineRecords([{ id: 'history:QFLS:0', ticker: 'QFLS', price: 10, capturedAt: 200 }], [
    { id: 1, ticker: 'QFLS', price: 10, capturedAt: 100, accepted: true },
    { id: 2, ticker: 'QFLS', price: 11, capturedAt: 300, accepted: true },
    { id: 3, ticker: 'QFLS', price: 10, capturedAt: 400, accepted: true },
    { id: 4, ticker: 'QFLS', price: 15, capturedAt: 500, accepted: true, syncedAt: 600 },
  ]);
  assert.equal(records.length, 5);
  assert.equal(records.find(row => row.id === 'local:1').syncStatus, 'Synced (stored price match)');
  assert.equal(records.find(row => row.id === 'local:2').syncStatus, 'Pending / unverified');
  assert.equal(records.find(row => row.id === 'local:3').syncStatus, 'Pending / unverified');
  assert.equal(records.find(row => row.id === 'local:4').syncStatus, 'Synced');
  assert.equal(records.find(row => row.id === 'local:1').auditId, 1);
  assert.equal(records.find(row => row.id === 'history:QFLS:0').origin, 'firebase');
});

test('All-ticker price history renders a separate chart for every matching ticker', async () => {
  const { JSDOM } = require('../webapp/node_modules/jsdom');
  const module = await import('data:text/javascript;base64,' + Buffer.from(read('price-chart.js')).toString('base64'));
  const document = new JSDOM('<div id="chart"></div>').window.document;
  const chart = document.getElementById('chart');
  module.renderPriceChart(chart, [{ ticker: 'QFLS', price: 10, capturedAt: 100 }, { ticker: 'QNBK', price: 15, capturedAt: 200 }], '');
  assert.equal(chart.querySelectorAll('svg').length, 2);
  assert.match(chart.textContent, /QFLS/);
  assert.match(chart.textContent, /QNBK/);
});

test('Successful push marks only accepted records from its own scrape batch as synced', async () => {
  const sample = [{ ticker: 'QFLS', capturedAt: 100, accepted: true }, { ticker: 'QFLS', capturedAt: 99, accepted: true }, { ticker: 'QNBK', capturedAt: 100, accepted: true }, { ticker: 'QFLS', capturedAt: 100, accepted: false }];
  const db = { close() {}, transaction() {
    const tx = { objectStore() { return { openCursor() {
      const request = {}; let index = 0;
      const next = () => queueMicrotask(() => {
        if (index < sample.length) { const position = index++; request.result = { value: sample[position], update: value => { sample[position] = value; }, continue: next }; }
        else request.result = null;
        request.onsuccess(); if (!request.result) tx.oncomplete();
      }); next(); return request;
    } }; } }; return tx;
  } };
  const ctx = vm.createContext({ chrome: { storage: { local: { set: async () => {} } } }, indexedDB: { open() { const request = {}; queueMicrotask(() => { request.result = db; request.onsuccess(); }); return request; } } });
  vm.runInContext(read('audit.js').replace(/^import .*;\r?\n/gm, '').replace(/export /g, ''), ctx);
  await vm.runInContext('markAuditSynced(100, ["QFLS"])', ctx);
  assert.ok(sample[0].syncedAt);
  assert.equal(sample.filter(row => row.syncedAt).length, 1);
});

test('A successful price write is counted even when its history write fails', async () => {
  const qatarDate = () => '2026-10-11';
  const ctx = vm.createContext({ console, Date, encodeURIComponent, qatarDate, saveExtensionConfigs: async () => {}, patchStatus: async () => {},
    getAuth: async () => ({ uid: 'user', idToken: 'token', expiresAt: Date.now() + 60000 }),
    RTDB_BASE_URL: 'https://database.example',
    priceCachePath: ticker => `prices/${ticker}`,
    priceHistoryPath: ticker => `history/${ticker}`,
    tickerNamePath: ticker => `names/${ticker}`,
    SHARED_LAST_UPDATED_PATH: 'updatedAt',
    priceDeviation: () => ({}),
    fetch: async (url, options = {}) => {
      if (url.includes('/history/')) return { ok: false, status: 403 };
      return { ok: true, json: async () => 10 };
    },
    chrome: { alarms: { onAlarm: { addListener() {} } }, runtime: { onInstalled: { addListener() {} }, onStartup: { addListener() {} }, onMessage: { addListener() {} } } },
  });
  vm.runInContext(read('background.js').replace(/import\s+[\s\S]*?from\s+'[^']+';/g, ''), ctx);
  vm.runInContext('ensureQseRoot = async () => {}', ctx);
  const result = await vm.runInContext('pushRows([{ticker:"QFLS", price:11}])', ctx);
  assert.equal(result.pushed, 1);
  assert.equal(result.syncedTickers[0], 'QFLS');
  assert.match(result.errors[0], /current price synced; history failed/);
});

test('Activity preserves sync failure reason across subsequent scrapes', async () => {
  const module = await import('data:text/javascript;base64,' + Buffer.from(read('activity.js').replace(/^import .*;\r?\n/gm, '')).toString('base64'));
  const failed = module.updateActivity({}, { type: 'sync', success: false, count: 0, error: 'Sign in on the extension page to sync prices.' });
  const afterScrape = module.updateActivity(failed, { type: 'scrape', success: true, count: 57 });
  assert.match(afterScrape.lastSyncError, /Sign in/);
  const success = module.updateActivity(afterScrape, { type: 'sync', success: true, count: 57 });
  assert.equal(success.lastSyncError, '');
});

test('Failed sync keeps its error and schedules a retry rather than retrying every scrape', async () => {
  const status = {}; const events = [];
  const ctx = vm.createContext({ console, Date,
    getAuth: async () => null,
    getScrapeConfig: async () => ({ targetUrl: 'https://market.example/' }),
    getSyncConfig: async () => ({ scrapingEnabled: true, minPushIntervalMinutes: 2 }),
    getStatus: async () => status,
    patchStatus: async patch => Object.assign(status, patch),
    recordActivity: async event => events.push(event), saveAudit: async () => 1,
    withinScrapingWindow: () => true, randInt: () => 60, COLLECT_MIN_SECONDS: 45, COLLECT_MAX_SECONDS: 90,
    chrome: {
      tabs: { query: async () => [{ id: 1, url: 'https://market.example/' }], sendMessage: (id, message, respond) => respond({ ok: true, rows: [{ ticker: 'QFLS', price: 10 }] }) },
      alarms: { create() {}, onAlarm: { addListener() {} } },
      runtime: { onInstalled: { addListener() {} }, onStartup: { addListener() {} }, onMessage: { addListener() {} } },
    }, URL,
  });
  vm.runInContext(read('background.js').replace(/import\s+[\s\S]*?from\s+'[^']+';/g, ''), ctx);
  await vm.runInContext('runCycle({ manual: true })', ctx);
  assert.match(status.lastSyncError, /Sign in/);
  assert.ok(status.nextPushAt > Date.now() + 110000);
  assert.equal(events.filter(event => event.type === 'sync').length, 1);
  await vm.runInContext('runCycle({ manual: true })', ctx);
  assert.equal(events.filter(event => event.type === 'sync').length, 1);
  assert.match(status.lastSyncError, /Sign in/);
});

test('Push timing supports random, constant and zero intervals without clamping zero', async () => {
  const common = await import('data:text/javascript;base64,' + Buffer.from(read('common.js')).toString('base64'));
  assert.equal(common.pushDelayMs({ minPushIntervalMinutes: 3, pushTimingMode: 'constant' }, () => .9), 180000);
  assert.equal(common.pushDelayMs({ minPushIntervalMinutes: 3, pushTimingMode: 'random' }, () => 0), 180000);
  assert.equal(common.pushDelayMs({ minPushIntervalMinutes: 3, pushTimingMode: 'random' }, () => 1), 360000);
  for (const pushTimingMode of ['random', 'constant']) {
    await common.setSyncConfig({ minPushIntervalMinutes: 0, pushTimingMode });
    assert.equal((await common.getSyncConfig()).minPushIntervalMinutes, 0);
    assert.equal(common.pushDelayMs(await common.getSyncConfig()), 0);
  }
  await assert.rejects(common.setSyncConfig({ pushTimingMode: 'invalid' }));
});

test('Extension page controls offer separate Scrape and Push actions and timing selection', async () => {
  const { JSDOM } = require('../webapp/node_modules/jsdom');
  const document = new JSDOM('<div id="config"></div><div id="controls"></div>').window.document;
  const messages = []; let saved;
  const ctx = vm.createContext({ document,
    getScrapeConfig: async () => ({ targetUrl: 'https://webd.thegroup.com.qa/en/markets/qatar' }),
    getSyncConfig: async () => ({ minPushIntervalMinutes: 0, pushTimingMode: 'constant', scrapingEnabled: true, timeWindows: [{ start: '09:30', end: '13:00' }] }),
    setSyncConfig: async config => { saved = config; }, setScrapeConfig: async () => {},
    sendWorkerMessage: async message => messages.push(message.type),
    chrome: { storage: { onChanged: { addListener() {} } } }, URL,
  });
  vm.runInContext(read('config-ui.js').replace(/^import .*;\r?\n/gm, '').replace(/export /g, ''), ctx);
  await vm.runInContext('mountConfig(document.getElementById("config"))', ctx);
  await vm.runInContext('mountControls(document.getElementById("controls"), { manualActions: true })', ctx);
  assert.equal(document.querySelector('[name=minPushIntervalMinutes]').min, '0');
  assert.equal(document.querySelector('[name=pushTimingMode]').value, 'constant');
  await document.querySelector('form').onsubmit({ preventDefault() {} });
  assert.equal(saved.minPushIntervalMinutes, 0);
  assert.equal(saved.pushTimingMode, 'constant');
  await document.querySelector('.scrape-control').onclick();
  await document.querySelector('.push-control').onclick();
  assert.deepEqual(messages, ['SCRAPE_NOW_MANUAL', 'PUSH_NOW']);
});

test('Chart favourite and fullscreen controls invoke their actions', async () => {
  const { JSDOM } = require('../webapp/node_modules/jsdom');
  const module = await import('data:text/javascript;base64,' + Buffer.from(read('price-chart.js')).toString('base64'));
  const document = new JSDOM('<div id="chart"></div>').window.document;
  const chart = document.getElementById('chart'); let favourite, fullscreen = 0;
  chart.requestFullscreen = async () => fullscreen++;
  module.renderPriceChart(chart, [{ ticker: 'QFLS', price: 10, capturedAt: 100 }], 'QFLS', { favourites: new Set(['QFLS']), onFavourite: async ticker => { favourite = ticker; } });
  assert.equal(chart.querySelector('.chart-favourite').getAttribute('aria-pressed'), 'true');
  await chart.querySelector('.chart-favourite').onclick();
  assert.equal(favourite, 'QFLS');
  await chart.querySelector('.chart-fullscreen').onclick();
  assert.equal(fullscreen, 1);
});

test('Favourites persist and pinned charts appear before the table', async () => {
  const { JSDOM } = require('../webapp/node_modules/jsdom');
  const charts = await import('data:text/javascript;base64,' + Buffer.from(read('price-chart.js')).toString('base64'));
  const document = new JSDOM(read('options.html')).window.document;
  let saved = ['QFLS'];
  const rows = ['QFLS', 'QNBK'].map((ticker, index) => ({ id: ticker, ticker, price: 10 + index, capturedAt: 100 + index, origin: 'firebase', syncStatus: 'Synced' }));
  const ctx = vm.createContext({ document, Date, Number, JSON,
    renderPriceChart: charts.renderPriceChart,
    dateRange: period => ({ from: period === 'all' ? '' : '2026-10-11', to: period === 'all' ? '' : '2026-10-11' }), qatarDate: () => '2026-10-11', mountConfig: async () => {}, mountControls: async () => {}, mountStats: async () => {},
    getChartFavourites: async () => saved, setChartFavourites: async tickers => { saved = tickers; },
    sendWorkerMessage: async () => ({ rows, chartRows: rows, total: rows.length, tickers: rows.map(row => row.ticker) }),
    chrome: { storage: { onChanged: { addListener() {} } } },
  });
  await vm.runInContext('(async () => {' + read('options.js').replace(/^import .*;\r?\n/gm, '') + '\n})()', ctx);
  assert.equal(document.querySelectorAll('#favouriteChartList svg').length, 1);
  assert.ok(document.getElementById('favouriteCharts').compareDocumentPosition(document.getElementById('dataRows')) & 4);
  await document.querySelector('#priceChart button[aria-label="Favourite QNBK"]').onclick();
  assert.deepEqual([...saved].sort(), ['QFLS', 'QNBK']);
  assert.equal(document.querySelectorAll('#favouriteChartList svg').length, 2);
  await document.querySelector('#favouriteChartList button[aria-label="Unfavourite QFLS"]').onclick();
  assert.deepEqual([...saved], ['QNBK']);
});

test('Zero interval syncs every automatic scrape and manual scrape-only does not push', async () => {
  const status = { nextPushAt: Date.now() + 3600000 }; let pushes = 0;
  const ctx = vm.createContext({ console, Date, URL,
    getScrapeConfig: async () => ({ targetUrl: 'https://market.example/' }),
    getSyncConfig: async () => ({ scrapingEnabled: true, minPushIntervalMinutes: 0, pushTimingMode: 'constant' }),
    getStatus: async () => status, patchStatus: async patch => Object.assign(status, patch),
    recordActivity: async () => {}, saveAudit: async () => 1, markAuditSynced: async () => {},
    withinScrapingWindow: () => true, randInt: () => 60, pushDelayMs: () => 0, COLLECT_MIN_SECONDS: 45, COLLECT_MAX_SECONDS: 90,
    chrome: { tabs: { query: async () => [{ id: 1, url: 'https://market.example/' }], sendMessage: (id, message, respond) => respond({ ok: true, rows: [{ ticker: 'QFLS', price: 10 }] }) },
      alarms: { create() {}, onAlarm: { addListener() {} } }, runtime: { onInstalled: { addListener() {} }, onStartup: { addListener() {} }, onMessage: { addListener() {} } } },
    fakePush: async () => { pushes++; return { pushed: 1, namesPushed: 0, total: 1, errors: [], syncedTickers: ['QFLS'] }; },
  });
  vm.runInContext(read('background.js').replace(/import\s+[\s\S]*?from\s+'[^']+';/g, ''), ctx);
  vm.runInContext('pushRows = fakePush', ctx);
  await vm.runInContext('runCycle()', ctx); await vm.runInContext('runCycle()', ctx);
  assert.equal(pushes, 2);
  await vm.runInContext('runCycle({ manual: true, scrapeOnly: true })', ctx);
  assert.equal(pushes, 2);
});

test('Extension modules resolve every local import', () => {
  for (const file of fs.readdirSync(__dirname).filter(name => name.endsWith('.js'))) {
    for (const match of read(file).matchAll(/(?:from\s+|import\s*)['"](\.\/[^'"]+)['"]/g)) {
      assert.ok(fs.existsSync(path.resolve(__dirname, match[1])), `${file}: missing ${match[1]}`);
    }
  }
});

 test('Combined High/Low spans preserve daily extrema and raw provenance', () => {
  const { JSDOM } = require('../webapp/node_modules/jsdom');
  for (const [high, low, valid] of [['0.971','0.941',true],['0.9','1.0',false],['bad','0.941',false]]) {
    const dom = new JSDOM('<div role="row" class="ag-row" row-id="QFLS"><div col-id="lastPrice">0.956</div><div col-id="highLow"><div><span>'+high+'</span><span>'+low+'</span></div></div></div>');
    const ctx = context(dom.window.document); vm.runInContext(read('content.js'), ctx);
    const result = JSON.parse(vm.runInContext('JSON.stringify({ rows: scrapeAgGrid(), audit: auditRows })', ctx));
    assert.equal(result.rows[0].price, .956);
    assert.equal(result.rows[0].dayHigh, valid ? .971 : null);
    assert.equal(result.rows[0].dayLow, valid ? .941 : null);
    assert.deepEqual(result.audit[0].highLowRaw, [high,low]);
    assert.equal(result.audit[0].highLowKey, 'highLow');
    assert.equal(!!result.audit[0].rangeError, !valid);
  }
});
 test('History saves changing daily bounds and new dates despite an unchanged last price', async () => {
  const point = { price: .956, dayHigh: .971, dayLow: .941, date: '2026-10-11', time:'2026-10-11T09:00:00Z' };
  for (const [patch, appended] of [[{},false],[{dayHigh:.98},true],[{dayLow:.93},true],[{date:'2026-10-12'},true]]) {
    const { ctx, state } = mutationContext({history:[point],price:.956});
    ctx.point = {...point,...patch};
    const result = await vm.runInContext('appendHistoryPointSafely("QFLS",point,"token")',ctx);
    assert.equal(result.appended, appended);
    if(appended) assert.deepEqual(state.history[1], {...point,...patch});
  }
});
 test('Daily bounds survive Firebase filtering and appear in chart ranges', async () => {
  const { JSDOM } = require('../webapp/node_modules/jsdom');
  const data = await import('data:text/javascript;base64,' + Buffer.from(read('pushed-data.js')).toString('base64'));
  const rows = data.pushedRecords({history:{QFLS:[{price:.956,dayHigh:.971,dayLow:.941,time:'2026-10-11T09:00:00Z',highLowKey:'highLow',highLowRaw:['0.971','0.941']}]}});
  const chartRows = data.paginatePushed(rows).chartRows;
  assert.equal(chartRows[0].dayHigh,.971); assert.equal(chartRows[0].dayLow,.941);
  assert.deepEqual(rows[0].highLowRaw,['0.971','0.941']);
  const chart = await import('data:text/javascript;base64,' + Buffer.from(read('price-chart.js')).toString('base64'));
  const dom = new JSDOM('<div id="chart"></div>');const container=dom.window.document.getElementById('chart');
  chart.renderPriceChart(container,chartRows,'QFLS');
  assert.equal(container.querySelectorAll('[data-role="daily-range"]').length,1);
  assert.match(container.textContent,/day high: 0.971; day low: 0.941/);
  assert.match(container.textContent,/Extrema time unknown/);
});


test('Live price observer sends changes, ignores unchanged prices and honors Stop', async () => {
  const { JSDOM } = require('../webapp/node_modules/jsdom');
  const dom = new JSDOM('<div role="row" class="ag-row" row-id="QFLS"><div col-id="lastPrice">10</div></div>');
  let observer, storageListener, pending, config = { scrapingEnabled: true, scrapeIntervalSeconds: 0, scrapeOnPriceChange: true };
  const messages = [];
  const ctx = vm.createContext({ document: dom.window.document, console,
    MutationObserver: class { constructor(fn) { observer = fn; } observe() {} },
    setTimeout: fn => { pending = fn; return 1; }, clearTimeout: () => { pending = undefined; },
    setInterval: () => { throw new Error('Zero must not create a timer'); }, clearInterval() {},
    chrome: { runtime: { onMessage: { addListener() {} }, sendMessage: async message => messages.push(message) },
      storage: { local: { get: async () => ({ syncConfig: config }) }, onChanged: { addListener: fn => { storageListener = fn; } } } },
  });
  vm.runInContext(read('content.js'), ctx);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(messages.length, 1);
  observer(); pending();
  assert.equal(messages.length, 1);
  dom.window.document.querySelector('[col-id]').textContent = '11';
  observer(); pending();
  assert.equal(messages.length, 2);
  assert.equal(messages[1].reason, 'price');
  config = { ...config, scrapingEnabled: false };
  storageListener({ syncConfig: {} }, 'local');
  await new Promise(resolve => setImmediate(resolve));
  dom.window.document.querySelector('[col-id]').textContent = '12'; observer();
  assert.equal(pending, undefined);
  assert.equal(messages.length, 2);
});

test('Scrape interval validation and all-day window override', async () => {
  const common = await import('data:text/javascript;base64,' + Buffer.from(read('common.js')).toString('base64'));
  await common.setSyncConfig({ scrapeIntervalSeconds: 0, scrapeOnPriceChange: true });
  assert.equal((await common.getSyncConfig()).scrapeIntervalSeconds, 0);
  await assert.rejects(common.setSyncConfig({ scrapeIntervalSeconds: -1 }));
  await assert.rejects(common.setSyncConfig({ scrapeIntervalSeconds: 0, scrapeOnPriceChange: false }));
  assert.equal(common.withinScrapingWindow({ respectTimeWindows: false, timeWindows: [] }), true);
});
