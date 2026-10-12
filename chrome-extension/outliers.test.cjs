const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const load = () => import('data:text/javascript;base64,' + Buffer.from(read('pushed-data.js')).toString('base64'));
const base = Date.parse('2026-10-12T09:00:00Z');
const samples = prices => prices.map((price, index) => ({ id: String(index), ticker: 'QFLS', price, capturedAt: base + index * 10000 }));

test('Only isolated spikes are flagged; normal prices after them remain normal', async () => {
  const { flagPriceOutliers } = await load();
  const rows = flagPriceOutliers(samples([10, 10.01, 1000, 9.99, 10]));
  assert.deepEqual(rows.filter(row => row.outlier).map(row => row.price), [1000]);
  assert.equal(rows[2].referencePrice, 10);
  assert.equal(rows[2].referenceCount, 4);
});

test('Zero and negative prices can be removed using nearby positive consensus', async () => {
  const { flagPriceOutliers } = await load();
  for (const invalid of [0, -1]) {
    const rows = flagPriceOutliers(samples([5, 5.01, invalid, 4.99, 5]));
    assert.deepEqual(rows.filter(row => row.outlier).map(row => row.price), [invalid]);
  }
});

test('Ten-percent boundaries are retained and larger deviations are flagged', async () => {
  const { flagPriceOutliers } = await load();
  for (const [price, expected] of [[9, false], [11, false], [8.99, true], [11.01, true]]) {
    const rows = flagPriceOutliers(samples([10, 10, 10, price]));
    assert.equal(rows.at(-1).outlier, expected, String(price));
  }
});

test('Sparse, distant, unrelated or split-cluster prices are not enough evidence', async () => {
  const { flagPriceOutliers } = await load();
  const sparse = samples([10, 1000, 10]);
  const distant = samples([10, 10, 10, 1000]); distant.at(-1).capturedAt = base + 3600000;
  const otherTicker = samples([10, 10, 10, 1000]); otherTicker.at(-1).ticker = 'QNBK';
  const split = samples([5, 5, 10, 10, 1000]);
  for (const rows of [sparse, distant, otherTicker, split]) assert.equal(flagPriceOutliers(rows).some(row => row.outlier), false);
});

test('Realistic gradual price movement stays unflagged', async () => {
  const { flagPriceOutliers } = await load();
  assert.equal(flagPriceOutliers(samples([10, 10.2, 10.4, 10.6, 10.8, 11, 11.2])).some(row => row.outlier), false);
});

test('Mirrored local and Firebase observations do not fabricate supporting samples', async () => {
  const { flagPriceOutliers } = await load();
  const rows = [...Array.from({ length: 5 }, (_, index) => ({ id: String(index), ticker: 'QFLS', price: 10, capturedAt: base })), { id: 'bad', ticker: 'QFLS', price: 1000, capturedAt: base + 1000 }];
  assert.equal(flagPriceOutliers(rows).some(row => row.outlier), false);
});

test('History classification uses surrounding observations before the outlier filter', async () => {
  const { pushedRecords, paginatePushed } = await load();
  const history = samples([10, 10.01, 1000, 9.99, 10]).map(row => ({ price: row.price, time: new Date(row.capturedAt).toISOString() }));
  const rows = pushedRecords({ history: { QFLS: history } });
  const filtered = paginatePushed(rows, { outliers: 'true', from: '2026-10-12', to: '2026-10-12' });
  assert.equal(filtered.total, 1);
  assert.equal(filtered.rows[0].price, 1000);
  assert.equal(filtered.chartRows[0].referenceCount, 4);
});

test('Remove flagged outliers submits only flagged records, even when a normal row is selected', async () => {
  const { JSDOM } = require('../webapp/node_modules/jsdom');
  const dom = new JSDOM(read('options.html')), document = dom.window.document;
  const normal = { id: 'normal', ticker: 'QFLS', price: 10, capturedAt: base, origin: 'firebase', kind: 'history', key: 'normal', stored: { time: new Date(base).toISOString() } };
  const bad = { ...normal, id: 'bad', key: 'bad', price: 1000, outlier: true, referencePrice: 10, referenceCount: 4, outlierDeltaPct: 9900 };
  let deleted = false, mutation;
  const ctx = vm.createContext({ document, Date, JSON, Number, window: { confirm: () => true },
    qatarDate: () => '2026-10-12', getChartFavourites: async () => [], setChartFavourites: async () => {}, renderPriceChart() {}, mountConfig: async () => {}, mountControls: async () => {}, mountStats: async () => {},
    sendWorkerMessage: async message => {
      if (message.type === 'MUTATE_PUSHED_DATA') { mutation = message; deleted = true; return { results: message.entries.map(entry => ({ id: entry.id, ok: true })) }; }
      const rows = deleted ? [normal] : [normal, bad]; return { rows, chartRows: rows, total: rows.length, tickers: ['QFLS'], outlierRows: deleted ? [] : [bad] };
    }, chrome: { storage: { onChanged: { addListener() {} } } },
  });
  await vm.runInContext('(async () => {' + read('options.js').split(String.fromCharCode(10)).filter(line => !line.startsWith('import ')).join(String.fromCharCode(10)) + '})()', ctx);
  const normalCheckbox = document.querySelector('#dataRows input'); normalCheckbox.checked = true; normalCheckbox.onchange();
  document.getElementById('selectPreviewOutliers').onclick();
  await document.getElementById('deleteOutliers').onclick();
  assert.equal(mutation.operation, 'delete');
  assert.deepEqual(Array.from(mutation.entries, row => row.id), ['bad']);
  assert.equal(document.getElementById('deleteOutliers').disabled, true);
  assert.equal(document.querySelectorAll('#dataRows tr').length, 1);
  dom.window.close();
});


test('Local outlier-only queries classify against the complete neighboring audit records', async () => {
  const { flagPriceOutliers, priceDeviation } = await load();
  const data = samples([10, 10.01, 1000, 9.99, 10]).map(row => ({ ...row, accepted: true, source: 'automatic' }));
  const db = { close() {}, transaction() {
    const tx = { objectStore() { return { openCursor() {
      const request = {}; let index = 0;
      const advance = () => queueMicrotask(() => {
        if (index === data.length) { request.result = null; request.onsuccess(); tx.oncomplete(); return; }
        request.result = { value: { ...data[index++] }, continue: advance }; request.onsuccess();
      }); advance(); return request;
    } }; } }; return tx;
  } };
  const ctx = vm.createContext({ flagPriceOutliers, priceDeviation, qatarDate: () => '2026-10-12',
    indexedDB: { open() { const request = {}; queueMicrotask(() => { request.result = db; request.onsuccess(); }); return request; } },
  });
  const source = read('audit.js').split(String.fromCharCode(10)).filter(line => !line.startsWith('import ')).join(String.fromCharCode(10)).replace(/export /g, '');
  vm.runInContext(source, ctx);
  const result = await vm.runInContext('queryAudit({ outliers: "true", page: 1, pageSize: 25 })', ctx);
  assert.equal(result.total, 1);
  assert.equal(result.rows[0].price, 1000);
  assert.equal(result.chartRows[0].referencePrice, 10);
});


test('Early wrong batches are flagged against later trusted prices across dates', async () => {
  const { flagPriceOutliers } = await load();
  const early = samples([1000, 1000, 1000, 1000]);
  const later = samples([10, 10.01, 9.99, 10, 10.01, 9.99, 10, 10]).map(row => ({ ...row, id: 'trusted-' + row.id, capturedAt: row.capturedAt + 86400000, priceKey: 'lastPrice' }));
  const result = flagPriceOutliers([...early, ...later]);
  assert.equal(result.slice(0, early.length).every(row => row.outlier), true);
  assert.equal(result.slice(early.length).some(row => row.outlier), false);
  assert.equal(result[0].outlierMethod, 'historical-consensus');
  assert.ok(result[0].outlierEvidence.some(item => item.method === 'historical-forward'));
  assert.ok(result[0].outlierEvidence.some(item => item.method === 'historical-both'));
  assert.ok(result[0].outlierEvidence.some(item => item.method === 'historical-sampled'));
  assert.deepEqual(flagPriceOutliers([...early, ...later]), result);
});

test('Historical fallback does not flag ordinary drift or an uncorroborated starting value', async () => {
  const { flagPriceOutliers } = await load();
  const later = samples([10, 10.01, 9.99, 10, 10.01, 9.99]).map(row => ({ ...row, capturedAt: row.capturedAt + 86400000, priceKey: 'lastPrice' }));
  assert.equal(flagPriceOutliers([...samples([12]), ...later])[0].outlier, false);
  assert.equal(flagPriceOutliers([...samples([1000]), ...later.slice(0, 3)])[0].outlier, false);
  assert.equal(flagPriceOutliers([...samples([1000]), ...later.map(row => ({ ...row, priceKey: null }))])[0].outlier, false);
});

test('Near-time evidence records backward, forward, combined and sampled comparisons', async () => {
  const { flagPriceOutliers } = await load();
  const result = flagPriceOutliers(samples([10, 10, 10, 1000, 10, 10, 10]));
  assert.deepEqual(result[3].outlierEvidence.map(item => item.method), ['nearby-forward', 'nearby-backward', 'nearby-both', 'nearby-sampled']);
  assert.equal(result[3].outlier, true);
});
