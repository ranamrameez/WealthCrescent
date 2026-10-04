export function pushedRecords({ history = {}, prices = {}, names = {}, updatedAt = null }) {
  const rows = [];
  for (const [ticker, points] of Object.entries(history || {})) {
    let previousPrice = null;
    const ordered = Object.entries(points || {}).filter(([, point]) => point && Number.isFinite(point.price)).sort((a, b) => String(a[1].time || a[1].date || '').localeCompare(String(b[1].time || b[1].date || '')));
    for (const [key, point] of ordered) {
      if (!point || !Number.isFinite(point.price)) continue;
      const capturedAt = Date.parse(point.time || (point.date ? `${point.date}T00:00:00+03:00` : ''));
      const comparison = priceDeviation(point.price, previousPrice);
      rows.push({ id: `history:${ticker}:${key}`, key, kind: 'history', ticker, price: point.price, priceKey: point.priceKey || null, ...comparison, name: names?.[ticker] || null, capturedAt: Number.isFinite(capturedAt) ? capturedAt : null, date: point.date || '', source: 'Firebase history', raw: point.raw || null, stored: point });
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
  return rows.sort((a, b) => (b.capturedAt || 0) - (a.capturedAt || 0) || a.ticker.localeCompare(b.ticker));
}

export function priceDeviation(price, previousPrice) {
  const deltaPct = Number.isFinite(previousPrice) && previousPrice > 0 ? (price - previousPrice) / previousPrice * 100 : null;
  return { previousPrice: previousPrice ?? null, deltaPct, outlier: deltaPct !== null && Math.abs(deltaPct) > 10 + 1e-9 };
}

export function paginatePushed(rows, { from = '', to = '', ticker = '', outliers = '', page = 1, pageSize = 25 } = {}) {
  page = Math.max(1, Math.floor(Number(page) || 1));
  pageSize = Math.min(100, Math.max(1, Math.floor(Number(pageSize) || 25)));
  const filtered = rows.filter(row => {
    const parts = row.capturedAt == null ? [] : new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Qatar', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(row.capturedAt);
    const part = type => parts.find(value => value.type === type)?.value || '';
    const date = parts.length ? `${part('year')}-${part('month')}-${part('day')}` : row.date || '';
    return (!from || date >= from) && (!to || (!!date && date <= to)) && (!ticker || row.ticker.toUpperCase().includes(ticker.toUpperCase())) && (!outliers || row.outlier);
  });
  return { rows: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, tickers: [...new Set(rows.map(row => row.ticker))].sort(), chartRows: filtered.map(({ ticker, price, capturedAt, outlier, deltaPct }) => ({ ticker, price, capturedAt, outlier, deltaPct })), outlierRows: filtered.filter(row => row.outlier).slice(0, 100).map(({ id, ticker, price, key, kind, stored }) => ({ id, ticker, price, key, kind, stored: { time: stored?.time } })) };
}
