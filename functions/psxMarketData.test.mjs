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

test('price failover keeps missing and newer cached symbols and preserves individual timestamps', async () => {
  const { publishPsxPrices } = await import('./psxPriceProviders.js').then(module => module.default);
  const now = Date.now(), key = psxCacheKey('/prices');
  const prior = { symbol: 'KEEP', price: 51, time: new Date(now - 1000).toISOString(), source: 'psxdata' };
  const db = fakeDb({ ['PSX/api/' + key]: { payload: JSON.stringify({ data: [prior] }) } });
  const state = await publishPsxPrices(db, key, undefined, async url => {
    assert.equal(url, 'https://www.psxinvestors.pk/api/v1/psx-stocks/');
    return Response.json({ success: true, data: { stocks: [
      { symbol: 'keep', price: 11, lastUpdated: now - 5000 },
      { symbol: 'new', price: 20, lastUpdated: Math.floor(now / 1000) - 1 },
      { symbol: 'bad', price: 0, lastUpdated: now },
    ] } });
  }, true);
  assert.equal(state.source, 'psx-investors');
  const rows = JSON.parse(db.values.get('PSX/api/' + key).payload).data;
  assert.deepEqual(rows[0], prior);
  assert.equal(rows[1].symbol, 'NEW');
  assert.match(rows[1].time, /Z$/);
});

test('secondary cooldown and provider failures leave the previous price cache intact', async () => {
  const { publishPsxPrices } = await import('./psxPriceProviders.js').then(module => module.default);
  const key = psxCacheKey('/prices'), previous = { payload: '{"data":[]}' }, now = Date.now();
  const db = fakeDb({ ['PSX/api/' + key]: previous, 'PSX/syncStatus': { prices: { secondary: { retryAfter: now + 120_000 } } } });
  const skipped = await publishPsxPrices(db, key, undefined, async () => assert.fail('cooldown must skip network'), true);
  assert.equal(skipped.secondary.retryAfter, now + 120_000);
  db.values.delete('PSX/syncStatus');
  const result = await publishPsxPrices(db, key, undefined, async () => new Response('', { status: 429, headers: { 'Retry-After': '180' } }), true);
  assert.equal(result.secondary.status, 429);
  assert.ok(result.secondary.retryAfter >= now + 180_000);
  assert.equal(db.values.get('PSX/api/' + key), previous);
});

test('primary screener publishes to the price cache before fallback is needed', async () => {
  const db = fakeDb();
  await worker.refreshPsxMarketData(db, async url => {
    const path = new URL(url).pathname;
    assert.equal(new URL(url).hostname, 'psxdata-api.fastapicloud.dev');
    if (path !== '/screener') return new Response('', { status: 503 });
    return Response.json({ data: datasets[path], meta: { timestamp: new Date().toISOString() } });
  }, async () => {});
  const result = JSON.parse(db.values.get('PSX/api/' + psxCacheKey('/prices')).payload);
  assert.equal(result.data[0].price, 100);
  assert.equal(result.meta.source, 'psxdata');
});

test('PSX Lens fallback preserves the trade date and paginates within its request budget', async () => {
  const { publishPsxPrices } = await import('./psxPriceProviders.js').then(module => module.default);
  const db = fakeDb(), key = psxCacheKey('/prices');
  const calls = [];
  const state = await publishPsxPrices(db, key, undefined, async url => {
    calls.push(url);
    return Response.json({ matches: [{ symbol: calls.length === 1 ? 'OGDC' : 'HBL', price: 100, last_traded: '2026-10-22' }], next_cursor: '500' });
  }, false, true);
  assert.equal(calls.length, 2);
  assert.match(calls[1], /cursor=500$/);
  assert.equal(state.source, 'psx-lens');
  assert.equal(state.stale, true);
  const rows = JSON.parse(db.values.get('PSX/api/' + key).payload).data;
  assert.equal(rows[0].time, '2026-10-21T19:00:00.000Z');
  assert.equal(rows[1].symbol, 'HBL');
});
