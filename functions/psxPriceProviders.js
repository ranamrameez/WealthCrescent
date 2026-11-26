const secondaryUrl = 'https://www.psxinvestors.pk/api/v1/psx-stocks/';
const lensUrl = 'https://api.psxlens.com/v1/screener?limit=500';
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

async function publishPsxPrices(db, key, primary, fetcher, enabled = process.env.PSX_INVESTORS_FALLBACK === 'true',
  lensEnabled = process.env.PSX_LENS_FALLBACK === 'true') {
  const now = Date.now();
  const cache = db.ref('PSX/api/' + key);
  const existing = (await cache.once('value')).val();
  let previous;
  try { previous = JSON.parse(existing?.payload); } catch { /* no valid prior snapshot */ }

  let selected = 'psxdata';
  let quotes = [];
  let secondaryStatus;
  const previousStatus = (await db.ref('PSX/syncStatus').once('value')).val()?.prices;
  let lensStatus;
  const retryAfter = response => {
    const retry = response.headers.get('Retry-After');
    const time = retry && /^\d+$/.test(retry) ? now + Number(retry) * 1000 : Date.parse(retry);
    return Number.isFinite(time) ? Math.max(now + 60_000, time) : now + 60_000;
  };
  if (primary) {
    const payload = JSON.parse(primary.payload);
    quotes = normalizeQuotes(payload.data, selected, () => Date.parse(payload.meta.timestamp), now);
  }
  if (!quotes.length && enabled) {
    selected = 'psx-investors';
    const cooldown = previousStatus?.secondary?.retryAfter;
    if (cooldown > now) secondaryStatus = { retryAfter: cooldown };
    else try {
      const response = await fetcher(secondaryUrl, { signal: AbortSignal.timeout(25_000), redirect: 'error' });
      if (response.status === 429 || response.status === 503) {
        secondaryStatus = { status: response.status, retryAfter: retryAfter(response) };
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

  if (!quotes.length && lensEnabled) {
    selected = 'psx-lens';
    const cooldown = previousStatus?.lens?.retryAfter;
    if (cooldown > now) lensStatus = { retryAfter: cooldown };
    else try {
      let url = lensUrl;
      // The documented page ceiling is 500. Cap each scheduled run at two pages.
      for (let page = 0; page < 2; page++) {
        const response = await fetcher(url, { signal: AbortSignal.timeout(25_000), redirect: 'error' });
        if (!response.ok) {
          lensStatus = { status: response.status };
          if (response.status === 429 || response.status === 503) lensStatus.retryAfter = retryAfter(response);
          break;
        }
        const value = await response.json();
        quotes.push(...normalizeQuotes(value?.matches, selected, row =>
          /^\d{4}-\d{2}-\d{2}$/.test(row.last_traded) ? Date.parse(row.last_traded + 'T00:00:00+05:00') : NaN, now));
        if (!/^\d{1,8}$/.test(value?.next_cursor)) break;
        url = lensUrl + '&cursor=' + value.next_cursor;
      }
    } catch {
      lensStatus = { error: 'Delayed fallback provider unavailable.' };
    }
  }

  const providerStatus = {
    secondary: secondaryStatus ?? previousStatus?.secondary ?? null,
    lens: lensStatus ?? previousStatus?.lens ?? null,
  };
  // Keep symbols missing from a partial fallback and reject any older replacement.
  if (quotes.length) {
    const latest = new Map();
    for (const row of [...(Array.isArray(previous?.data) ? previous.data : []), ...quotes]) {
      if (!latest.has(row.symbol) || row.time >= latest.get(row.symbol).time) latest.set(row.symbol, row);
    }
    const timestamp = quotes.reduce((max, row) => row.time > max ? row.time : max, '');
    const stale = selected === 'psx-lens' || now - Date.parse(timestamp) > 15 * 60_000;
    await cache.set({
      path: '/prices',
      fetchedAt: now,
      payload: JSON.stringify({ data: [...latest.values()], meta: { timestamp, source: selected }, stale }),
    });
    return { source: selected, received: quotes.length, retained: latest.size, stale, ...providerStatus };
  }
  return { received: 0, retained: previous?.data?.length || 0, stale: true, ...providerStatus };
}

module.exports = { publishPsxPrices };
