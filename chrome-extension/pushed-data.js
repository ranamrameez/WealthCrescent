export function pushedRecords({ history = {}, prices = {}, names = {}, updatedAt = null }) {
  const rows = [];
  for (const [ticker, points] of Object.entries(history || {})) {
    let previousPrice = null;
    const ordered = Object.entries(points || {}).filter(([, point]) => point && Number.isFinite(point.price)).sort((a, b) => String(a[1].time || a[1].date || '').localeCompare(String(b[1].time || b[1].date || '')));
    for (const [key, point] of ordered) {
      if (!point || !Number.isFinite(point.price)) continue;
      const capturedAt = Date.parse(point.time || (point.date ? `${point.date}T00:00:00+03:00` : ''));
      const comparison = priceDeviation(point.price, previousPrice);
      rows.push({ id: `history:${ticker}:${key}`, key, kind: 'history', ticker, price: point.price, priceKey: point.priceKey || null, dayHigh: point.dayHigh ?? null, dayLow: point.dayLow ?? null, highLowKey: point.highLowKey || null, highLowRaw: point.highLowRaw || [], rangeError: point.rangeError || '', ...comparison, name: names?.[ticker] || null, capturedAt: Number.isFinite(capturedAt) ? capturedAt : null, date: point.date || '', source: 'Firebase history', raw: point.raw || null, stored: point });
      previousPrice = point.price;
    }
  }
  // Show current values too, including tickers whose history write never succeeded.
  for (const [ticker, price] of Object.entries(prices || {})) {
    if (!Number.isFinite(price)) continue;
    const latest = rows.filter(row => row.ticker === ticker).at(-1);
    if (latest?.price === price) continue;
    const time = Date.parse(updatedAt || '');
    rows.push({ id: `current:${ticker}`, kind: 'current', ticker, price, ...priceDeviation(price, latest?.price), name: names?.[ticker] || null, capturedAt: Number.isFinite(time) ? time : null, source: 'Firebase current price', raw: null, stored: { price, pricesUpdatedAt: updatedAt } });
  }
  return flagPriceOutliers(rows).sort((a, b) => (b.capturedAt || 0) - (a.capturedAt || 0) || a.ticker.localeCompare(b.ticker));
}

export function priceDeviation(price, previousPrice) {
  const deltaPct = Number.isFinite(previousPrice) && previousPrice > 0 ? (price - previousPrice) / previousPrice * 100 : null;
  return { previousPrice: previousPrice ?? null, deltaPct, outlier: false };
}

export function paginatePushed(rows, { from = '', to = '', ticker = '', outliers = '', strategy = '', accepted = '', source = '', page = 1, pageSize = 25 } = {}) {
  page = Math.max(1, Math.floor(Number(page) || 1));
  pageSize = Math.min(100, Math.max(1, Math.floor(Number(pageSize) || 25)));
  const filtered = rows.filter(row => {
    const parts = row.capturedAt == null ? [] : new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Qatar', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(row.capturedAt);
    const part = type => parts.find(value => value.type === type)?.value || '';
    const date = parts.length ? `${part('year')}-${part('month')}-${part('day')}` : row.date || '';
    return (!from || date >= from) && (!to || (!!date && date <= to)) && (!ticker || row.ticker.toUpperCase().includes(ticker.toUpperCase())) && (!outliers || row.outlier) && (!strategy || row.strategy === strategy) && (!source || row.source === source) && (!accepted || String(row.accepted ?? (row.origin === 'firebase' || row.kind === 'history' || row.kind === 'current')) === accepted);
  });
  return { rows: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, tickers: [...new Set(rows.map(row => row.ticker))].sort(), chartRows: filtered.map(({ ticker, price, capturedAt, outlier, deltaPct, outlierDeltaPct, referencePrice, referenceCount, dayHigh, dayLow }) => ({ ticker, price, capturedAt, outlier, deltaPct, outlierDeltaPct, referencePrice, referenceCount, dayHigh, dayLow })), outlierRows: filtered.filter(row => row.outlier).slice(0, 100).map(({ id, ticker, price, key, kind, stored, origin, auditId }) => ({ id, ticker, price, key, kind, origin, auditId, stored: { time: stored?.time } })) };
}

// A price movement is not evidence of a bad observation. Require nearby consensus.
export function flagPriceOutliers(rows, { windowMs = 5 * 60000, minPeers = 3, maxPeers = 60 } = {}) {
  const groups = new Map();
  for (const row of rows) {
    if (!row.ticker || !Number.isFinite(row.capturedAt) || !Number.isFinite(row.price)) continue;
    if (!groups.has(row.ticker)) groups.set(row.ticker, new Map());
    const key = row.capturedAt + ':' + row.price;
    if (!groups.get(row.ticker).has(key)) groups.get(row.ticker).set(key, row);
  }
  const references = new Map();
  for (const [ticker, unique] of groups) references.set(ticker, [...unique.values()].sort((a, b) => a.capturedAt - b.capturedAt));
  const lowerBound = (samples, time) => {
    let left = 0, right = samples.length;
    while (left < right) { const middle = (left + right) >>> 1; if (samples[middle].capturedAt < time) left = middle + 1; else right = middle; }
    return left;
  };
  return rows.map(row => {
    const result = { ...row, outlier: false, referencePrice: null, referenceCount: 0, outlierDeltaPct: null };
    if (!Number.isFinite(row.price) || !Number.isFinite(row.capturedAt)) return result;
    const samples = references.get(row.ticker) || [];
    const index = lowerBound(samples, row.capturedAt);
    const peers = [];
    let left = index - 1, right = index, visited = 0;
    while (visited++ < maxPeers * 4 && peers.length < maxPeers && (left >= 0 || right < samples.length)) {
      const dl = left >= 0 ? Math.abs(samples[left].capturedAt - row.capturedAt) : Infinity;
      const dr = right < samples.length ? Math.abs(samples[right].capturedAt - row.capturedAt) : Infinity;
      if (Math.min(dl, dr) > windowMs) break;
      const peer = dl < dr ? samples[left--] : samples[right++];
      if (peer.price > 0 && peer.accepted !== false && !(peer.price === row.price && peer.capturedAt === row.capturedAt)) peers.push(peer.price);
    }
    if (peers.length < minPeers) return result;
    peers.sort((a, b) => a - b);
    const median = values => values.length % 2 ? values[values.length >> 1] : (values[values.length / 2 - 1] + values[values.length / 2]) / 2;
    const center = median(peers);
    const cluster = peers.filter(price => Math.abs(price / center - 1) <= .1 + 1e-9);
    if (cluster.length < minPeers || cluster.length / peers.length < 2 / 3) return result;
    const referencePrice = median(cluster);
    const outlierDeltaPct = (row.price - referencePrice) / referencePrice * 100;
    return { ...result, referencePrice, referenceCount: cluster.length, outlierDeltaPct, outlier: Math.abs(outlierDeltaPct) > 10 + 1e-9 };
  });
}
