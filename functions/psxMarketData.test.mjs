import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPsxReference, psxCacheKey, validPsxPath, PSX_BASE_PATHS } from './psxDataModel.mjs';
import worker from './psxMarketData.js';

test('joins padded sector codes, deduplicates symbols and preserves unclassified tickers', () => {
  const result = buildPsxReference([{ sector_code: '0804', sector_name: 'CEMENT' }], ['LUCK', 'UNCLASS', 'LUCK'], [{ symbol: 'LUCK', sector: 804 }, { symbol: 'BAD', sector: null }], '2026-10-22T06:00:00Z');
  assert.deepEqual(result.tickerGroups['804'], ['LUCK']);
  assert.deepEqual(result.tickerGroups.unknown, ['BAD', 'UNCLASS']);
  assert.equal(result.tickerSectors.LUCK, '804');
  assert.throws(() => buildPsxReference([], ['LUCK'], [], ''), /Incomplete/);
});

test('allows documented datasets and rejects arbitrary URLs, malformed dates and unsafe keys', () => {
  for (const path of [...PSX_BASE_PATHS, '/stocks/OGDC/quote', '/stocks/OGDC/fundamentals', '/stocks/OGDC/historical?start=2026-10-01', '/indices/KSE100', '/sectors/INV.%20BANKS%20%2F%20INV.%20COS./stocks', '/stocks?index=KSE100']) {
    assert.equal(validPsxPath(path), true, path);
    assert.match(psxCacheKey(path), /^[a-f0-9]+$/);
    assert.ok(psxCacheKey(path).length <= 768);
  }
  for (const path of ['https://evil.test/stocks', '//evil.test/stocks', '/stocks/../../health', '/stocks/OGDC/historical?start=2026-02-31', '/stocks/OGDC/historical?auth=secret', '/not-real', '/health#fragment']) assert.equal(validPsxPath(path), false, path);
  assert.notEqual(psxCacheKey('/stocks'), psxCacheKey('/stocks?index=KSE100'));
});

function fakeDb(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { values, ref(path) { const handle = { orderByChild() { return handle; }, limitToFirst() { return handle; }, async once() { return { val: () => values.get(path) ?? null }; }, async set(value) { values.set(path, value); }, async remove() { values.delete(path); } }; return handle; } };
}
const envelope = data => ({ data, meta: { timestamp: '2026-10-22T06:00:00Z' } });
const datasets = {
  '/sectors': [{ sector_code: '0804', sector_name: 'CEMENT' }],
  '/stocks': ['LUCK'], '/screener': [{ symbol: 'LUCK', sector: 804, price: 100 }],
};

test('scheduled sync stores arrays/nulls losslessly and processes requested datasets', async () => {
  const detail = '/stocks/LUCK/fundamentals', key = psxCacheKey(detail);
  const db = fakeDb({ 'PSX/requests': { [key]: { path: detail, requestedAt: 1 } } });
  const calls = [];
  await worker.refreshPsxMarketData(db, async url => {
    const path = new URL(url).pathname; calls.push(path);
    return new Response(JSON.stringify(envelope(datasets[path] ?? [null, { nullable: null }, []])), { status: 200 });
  }, async () => {});
  assert.ok(calls.includes(detail));
  assert.deepEqual(db.values.get('PSX/reference').tickerGroups['804'], ['LUCK']);
  assert.deepEqual(JSON.parse(db.values.get('PSX/api/' + key).payload).data, [null, { nullable: null }, []]);
  assert.equal(db.values.has('PSX/requests/' + key), false);
});

test('rate limiting retains the previous reference and stops further provider requests', async () => {
  const previous = { symbols: ['KEEP'] }, db = fakeDb({ 'PSX/reference': previous });
  let calls = 0;
  await worker.refreshPsxMarketData(db, async () => { calls++; return new Response('{}', { status: 429 }); }, async () => {});
  assert.equal(calls, 1);
  assert.deepEqual(db.values.get('PSX/reference'), previous);
});
