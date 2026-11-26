const secondaryUrl = 'https://www.psxinvestors.pk/api/v1/psx-stocks/';
const symbolPattern = /^[A-Z0-9][A-Z0-9-]{0,15}$/;

function normalizeQuotes(rows, source, getTime, now) {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap(row => {
    const symbol = typeof row?.symbol === 'string' ? row.symbol.trim().toUpperCase() : '';
    const price = Number(row?.price);
    const time = row && getTime(row);
    if (!symbolPattern.test(symbol) || !Number.isFinite(price) || price <= 0
      || !Number.isFinite(time) || time <= 0 || time > now + 60_000) return [];
    return [{ symbol, price, time: new Date(time).toISOString(), source }];
  });
}

async function publishPsxPrices(db, key, primary, fetcher, enabled = process.env.PSX_INVESTORS_FALLBACK === 'true') {
  const now = Date.now();
  const cache = db.ref('PSX/api/' + key);
  const existing = (await cache.once('value')).val();
  let previous;
  try { previous = JSON.parse(existing?.payload); } catch { /* no valid prior snapshot */ }

  let selected = 'psxdata';
  let quotes = [];
  let secondaryStatus;
  if (primary) {
    const payload = JSON.parse(primary.payload);
    quotes = normalizeQuotes(payload.data, selected, () => Date.parse(payload.meta.timestamp), now);
  }
  if (!quotes.length && enabled) {
    selected = 'psx-investors';
    const cooldown = (await db.ref('PSX/syncStatus').once('value')).val()?.prices?.retryAfter;
    if (cooldown > now) secondaryStatus = { retryAfter: cooldown };
    else try {
      const response = await fetcher(secondaryUrl, { signal: AbortSignal.timeout(25_000), redirect: 'error' });
      if (response.status === 429 || response.status === 503) {
        const retry = response.headers.get('Retry-After');
        const time = retry && /^\d+$/.test(retry) ? now + Number(retry) * 1000 : Date.parse(retry);
        secondaryStatus = { status: response.status, retryAfter: Number.isFinite(time) ? Math.max(now + 60_000, time) : now + 60_000 };
      } else if (response.ok) {
        const value = await response.json();
        if (value?.success === true) quotes = normalizeQuotes(value.data?.stocks, selected, row => {
          const time = row.lastUpdated;
          return typeof time === 'number' && time < 1e12 ? time * 1000 : time;
        }, now);
        if (!quotes.length) secondaryStatus = { error: 'No valid PSX quotes returned.' };
      } else secondaryStatus = { status: response.status };
    } catch {
      secondaryStatus = { error: 'Fallback provider unavailable.' };
    }
  }

  // Keep symbols missing from a partial fallback and reject any older replacement.
  if (quotes.length) {
    const latest = new Map();
    for (const row of [...(Array.isArray(previous?.data) ? previous.data : []), ...quotes]) {
      if (!latest.has(row.symbol) || row.time >= latest.get(row.symbol).time) latest.set(row.symbol, row);
    }
    const timestamp = quotes.reduce((max, row) => row.time > max ? row.time : max, '');
    const stale = now - Date.parse(timestamp) > 15 * 60_000;
    await cache.set({
      path: '/prices',
      fetchedAt: now,
      payload: JSON.stringify({ data: [...latest.values()], meta: { timestamp, source: selected }, stale }),
    });
    return { source: selected, received: quotes.length, retained: latest.size, stale };
  }
  return { received: 0, retained: previous?.data?.length || 0, stale: true, ...secondaryStatus };
}

module.exports = { publishPsxPrices };
