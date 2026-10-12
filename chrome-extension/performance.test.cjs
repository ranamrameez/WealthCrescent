const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('../webapp/node_modules/jsdom');
const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const source = name => read(name).split(String.fromCharCode(10)).filter(line => !line.startsWith('import ')).join(String.fromCharCode(10));
const tick = () => new Promise(resolve => setImmediate(resolve));
const loadChart = () => import('data:text/javascript;base64,' + Buffer.from(read('price-chart.js')).toString('base64'));

test('Audit queries share one cursor scan and classification, then invalidate after a write', async () => {
  let version = 1, scans = 0, classifications = 0;
  const rows = [{ id: 1, ticker: 'QFLS', price: 10, capturedAt: 1000, accepted: true }];
  const db = { close() {}, transaction() { scans++; const tx = { objectStore() { return { openCursor() {
    const request = {}; let index = 0;
    const next = () => queueMicrotask(() => { if (index === rows.length) { request.result = null; request.onsuccess(); tx.oncomplete(); return; } request.result = { value: { ...rows[index++] }, continue: next }; request.onsuccess(); }); next(); return request;
  } }; } }; return tx; } };
  const ctx = vm.createContext({ Date, priceDeviation: () => ({}), qatarDate: () => '2026-10-12',
    flagPriceOutliers: rows => { classifications++; return rows.map(row => ({ ...row, outlier: false })); },
    chrome: { storage: { local: { get: async () => ({ auditUpdatedAt: version }) } } },
    indexedDB: { open() { const request = {}; queueMicrotask(() => { request.result = db; request.onsuccess(); }); return request; } },
  });
  vm.runInContext(source('audit.js').replace(/export /g, ''), ctx);
  await Promise.all([vm.runInContext('queryAudit({})', ctx), vm.runInContext('queryAudit({ ticker: "QFLS" })', ctx)]);
  assert.equal(scans, 1); assert.equal(classifications, 1);
  version++; await vm.runInContext('queryAudit({})', ctx);
  assert.equal(scans, 2); assert.equal(classifications, 2);
});

test('Large charts use a bounded sample while retaining endpoints and isolated extremes', async () => {
  const { sampleChartPoints, renderPriceChart } = await loadChart();
  const rows = Array.from({ length: 20000 }, (_, index) => ({ ticker: 'QFLS', price: 10, capturedAt: index + 1 }));
  rows[1234].price = 1000; rows[1234].outlier = true; rows[9876].price = 0;
  const points = sampleChartPoints(rows);
  assert.ok(points.length <= 500);
  assert.ok(points.includes(rows[0]) && points.includes(rows.at(-1)) && points.includes(rows[1234]) && points.includes(rows[9876]));
  const dom = new JSDOM('<div id="chart"></div>');
  renderPriceChart(dom.window.document.getElementById('chart'), rows, 'QFLS');
  assert.ok(dom.window.document.querySelectorAll('circle').length <= 500);
  assert.match(dom.window.document.getElementById('chart').textContent, /of 20000 samples/);
  dom.window.close();
});

test('All-ticker charts disclose omitted tickers and load more on demand', async () => {
  const { renderPriceChart } = await loadChart();
  const dom = new JSDOM('<div id="chart"></div>'), chart = dom.window.document.getElementById('chart');
  renderPriceChart(chart, Array.from({ length: 12 }, (_, index) => ({ ticker: 'T' + index, price: 10, capturedAt: 1000 })), '');
  assert.equal(chart.querySelectorAll('svg').length, 6);
  assert.match(chart.textContent, /Showing 6 of 12/);
  const more = [...chart.querySelectorAll('button')].find(button => button.textContent === 'Show more ticker charts'); more.click();
  assert.equal(chart.querySelectorAll('svg').length, 12); assert.equal(more.hidden, true);
  dom.window.close();
});

function pageHarness({ failRefresh = false, closed = false, pendingConfig = false } = {}) {
  const dom = new JSDOM(read('options.html')), document = dom.window.document;
  if (closed) for (const id of ['chartCard','favouriteCharts']) { const card = document.getElementById(id), details = document.createElement('details'); details.className = 'collapsible-section'; card.before(details); details.append(card); }
  let reads = 0, renders = 0, fail = false, resolveConfig;
  const config = new Promise(resolve => { resolveConfig = resolve; });
  const normal = { id: 'normal', ticker: 'QFLS', price: 10, capturedAt: 1000, origin: 'firebase' };
  const outlier = { ...normal, id: 'bad', price: 1000, outlier: true, referencePrice: 10, referenceCount: 4, outlierDeltaPct: 9900 };
  const requests = [];
  const ctx = vm.createContext({ document, Date, Number, JSON,
    qatarDate: () => '2026-10-12', getChartFavourites: async () => ['QFLS'], setChartFavourites: async () => {}, renderPriceChart() { renders++; }, mountConfig: async () => {}, mountControls: async () => {}, mountStats: async () => {},
    sendWorkerMessage: async message => { requests.push(message); if (message.type === 'LOAD_EXTENSION_CONFIGS') return pendingConfig ? config : {}; reads++; if (fail) throw new Error('Network unavailable'); return { rows: [normal, outlier], chartRows: [normal, outlier], total: 2, tickers: ['QFLS'], outlierRows: [outlier] }; },
    chrome: { storage: { onChanged: { addListener() {} } } },
  });
  return { dom, document, ctx, requests, start: () => vm.runInContext('(async () => {' + source('options.js') + '})()', ctx), get reads() { return reads; }, get renders() { return renders; }, fail: () => { fail = true; }, resolveConfig };
}

test('Initial UI does not wait for cloud settings and closed charts are not rendered', async () => {
  const p = pageHarness({ closed: true, pendingConfig: true });
  await p.start();
  assert.equal(p.reads, 1, 'Pinned Table dates charts reuse the main query');
  assert.equal(p.renders, 0);
  assert.equal(p.document.querySelectorAll('#dataRows tr').length, 2);
  p.resolveConfig({}); p.dom.window.close();
});

test('Failed refresh preserves loaded records and disables stale-preview deletion', async () => {
  const p = pageHarness(); await p.start();
  const before = p.document.getElementById('dataRows').textContent;
  p.document.getElementById('selectPreviewOutliers').onclick();
  p.fail(); await p.document.getElementById('refreshData').onclick();
  assert.equal(p.document.getElementById('dataRows').textContent, before);
  assert.match(p.document.getElementById('dataMessage').textContent, /Previous results remain visible/);
  assert.match(p.document.getElementById('outlierPreviewMessage').textContent, /outdated/);
  assert.equal(p.document.getElementById('deleteOutliers').disabled, true);
  p.dom.window.close();
});

test('Outlier preview starts unselected and explicit deselection survives refresh', async () => {
  const p = pageHarness(); await p.start();
  assert.equal(p.document.querySelectorAll('#outlierPreviewRows tr').length, 1);
  assert.equal(p.document.querySelector('#outlierPreviewRows input').checked, false);
  p.document.getElementById('selectPreviewOutliers').onclick(); assert.equal(p.document.getElementById('deleteOutliers').disabled, false);
  p.document.getElementById('clearPreviewOutliers').onclick(); await p.document.getElementById('refreshData').onclick();
  assert.equal(p.document.getElementById('deleteOutliers').disabled, true);
  assert.equal(p.document.querySelector('#outlierPreviewRows input').checked, false);
  p.dom.window.close();
});
