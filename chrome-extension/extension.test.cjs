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
  await vm.runInContext('(async () => { const renderPriceChart = () => {}; ' + code + '\n})()', ctx);
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
    fetch: async url => { urls.push(url); return { ok: true, json: async () => url.includes('/priceHistory.') ? { QNBK: [{ price: 12.34, date: '2026-10-01' }] } : null }; },
    chrome: { alarms: { onAlarm: { addListener() {} } }, runtime: { onInstalled: { addListener() {} }, onStartup: { addListener() {} }, onMessage: { addListener(fn) { handler = fn; } } } },
  });
  vm.runInContext(read('background.js').replace(/import\s+[\s\S]*?from\s+'[^']+';/g, ''), ctx);
  const response = await new Promise(resolve => handler({ type: 'GET_PUSHED_DATA', filters: {} }, {}, resolve));
  assert.equal(response.ok, true); assert.equal(response.rows[0].price, 12.34);
  assert.equal(urls.length, 4);
  await new Promise(resolve => handler({ type: 'GET_PUSHED_DATA' }, {}, resolve));
  assert.equal(urls.length, 4, 'Pagination reuses the snapshot');
});

test('Page defaults to Firebase data and places the table before Test scrape', async () => {
  const { JSDOM } = require('../webapp/node_modules/jsdom');
  const document = new JSDOM(read('options.html')).window.document;
  let requested;
  const ctx = vm.createContext({ document, console, Date, JSON, Number,
    mountConfig: async () => {}, mountControls: async () => {},
    sendWorkerMessage: async message => { requested = message; return { ok: true, total: 1, rows: [{ ticker: 'QIBK', price: 21, capturedAt: Date.now(), source: 'Firebase history', stored: { price: 21 } }] }; },
    queryAudit: async () => { throw new Error('Must query Firebase by default'); },
    chrome: { storage: { onChanged: { addListener() {} } } },
  });
  await vm.runInContext('(async () => { const renderPriceChart = () => {}; ' + read('options.js').replace(/^import .*;\r?\n/gm, '') + '\n})()', ctx);
  assert.equal(requested.type, 'GET_PUSHED_DATA');
  assert.match(document.getElementById('dataRows').textContent, /QIBK/);
  assert.match(document.getElementById('dataRows').textContent, /Stored in Firebase/);
  assert.equal(document.getElementById('strategyFilter').disabled, true);
  assert.ok(document.getElementById('dataRows').compareDocumentPosition(document.getElementById('testBtn')) & 4);
  assert.equal(document.querySelector('.top-sections').children.length, 2);
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
    priceCachePath: ticker => `stockData/QSE/prices/${ticker}`,
    priceHistoryPath: ticker => `stockData/QSE/priceHistory/${ticker}`,
    getAuth: async () => ({ uid: 'user', idToken: 'token', expiresAt: Date.now() + 60000 }),
    RTDB_BASE_URL: 'https://database.example',
    fetch: async (url, options = {}) => {
      const key = url.includes('/priceHistory/') ? 'history' : 'price';
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
  const row = { id: 'history:QNBK:2', kind: 'history', key: '2', ticker: 'QNBK', price: 25, priceKey: 'lastPrice', capturedAt: Date.now(), deltaPct: 25, previousPrice: 20, outlier: true, source: 'Firebase history', stored: { time: '2026-10-04' } };
  const ctx = vm.createContext({ document, window: { confirm: text => { preview = text; return true; } }, console, Date, JSON, Number,
    mountConfig: async () => {}, mountControls: async () => {},
    sendWorkerMessage: async message => {
      if (message.type === 'MUTATE_PUSHED_DATA') { mutation = message; return { ok: true, results: [{ id: row.id, ok: true }] }; }
      return { ok: true, total: 1, rows: [row], tickers: ['QIBK', 'QNBK'] };
    },
    chrome: { storage: { onChanged: { addListener() {} } } },
  });
  await vm.runInContext('(async () => { const renderPriceChart = () => {}; ' + read('options.js').replace(/^import .*;\r?\n/gm, '') + '\n})()', ctx);
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
