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
  await vm.runInContext('(async () => {' + code + '\n})()', ctx);
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
