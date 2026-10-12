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

const recordDateCache = new WeakMap();
export function paginatePushed(rows, { from = '', to = '', ticker = '', outliers = '', strategy = '', accepted = '', source = '', page = 1, pageSize = 25 } = {}) {
  page = Math.max(1, Math.floor(Number(page) || 1));
  pageSize = Math.min(100, Math.max(1, Math.floor(Number(pageSize) || 25)));
  const dateFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Qatar', year: 'numeric', month: '2-digit', day: '2-digit' });
  const filtered = rows.filter(row => {
    const cached = recordDateCache.get(row);
    const parts = cached?.timestamp === row.capturedAt ? [] : row.capturedAt == null ? [] : dateFormatter.formatToParts(row.capturedAt);
    const part = type => parts.find(value => value.type === type)?.value || '';
    const date = cached?.timestamp === row.capturedAt ? cached.date : (parts.length ? `${part('year')}-${part('month')}-${part('day')}` : row.date || '');
    recordDateCache.set(row, { timestamp: row.capturedAt, date });
    return (!from || date >= from) && (!to || (!!date && date <= to)) && (!ticker || row.ticker.toUpperCase().includes(ticker.toUpperCase())) && (!outliers || row.outlier) && (!strategy || row.strategy === strategy) && (!source || row.source === source) && (!accepted || String(row.accepted ?? (row.origin === 'firebase' || row.kind === 'history' || row.kind === 'current')) === accepted);
  });
  return { rows: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, outlierTotal: filtered.filter(row => row.outlier).length, tickers: [...new Set(rows.map(row => row.ticker))].sort(), chartRows: filtered.map(({ ticker, price, capturedAt, outlier, deltaPct, outlierDeltaPct, referencePrice, referenceCount, outlierMethod, dayHigh, dayLow }) => ({ ticker, price, capturedAt, outlier, deltaPct, outlierDeltaPct, referencePrice, referenceCount, outlierMethod, dayHigh, dayLow })), outlierRows: filtered.filter(row => row.outlier).slice(0, 100) };
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
  const trusted = new Map();
  for (const [ticker, samples] of references) trusted.set(ticker, samples.filter(row => row.price > 0 && row.accepted !== false && row.priceKey));
  const median = values => values.length % 2 ? values[values.length >> 1] : (values[values.length / 2 - 1] + values[values.length / 2]) / 2;
  const consensus = (peers, minimum = minPeers, share = 2 / 3) => {
    if (peers.length < minimum) return null;
    const prices = peers.map(peer => peer.price).sort((a, b) => a - b);
    const center = median(prices);
    const cluster = prices.filter(price => Math.abs(price / center - 1) <= .1 + 1e-9);
    return cluster.length >= minimum && cluster.length / prices.length >= share ? { price: median(cluster), count: cluster.length } : null;
  };
  const lowerBound = (samples, time) => {
    let left = 0, right = samples.length;
    while (left < right) { const middle = (left + right) >>> 1; if (samples[middle].capturedAt < time) left = middle + 1; else right = middle; }
    return left;
  };
  const nearbyResults = rows.map(row => {
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
    const center = median(peers);
    const cluster = peers.filter(price => Math.abs(price / center - 1) <= .1 + 1e-9);
    if (cluster.length < minPeers || cluster.length / peers.length < 2 / 3) return result;
    const referencePrice = median(cluster);
    const outlierDeltaPct = (row.price - referencePrice) / referencePrice * 100;
    return { ...result, referencePrice, referenceCount: cluster.length, outlierDeltaPct, outlier: Math.abs(outlierDeltaPct) > 10 + 1e-9 };
  });
  return nearbyResults.map(row => {
    const evidence = [];
    const addEvidence = (method, peers, minimum = minPeers, share = 2 / 3) => {
      const result = consensus(peers, minimum, share);
      if (result) evidence.push({ method, referencePrice: result.price, count: result.count, deltaPct: (row.price - result.price) / result.price * 100 });
    };
    const samples = references.get(row.ticker) || [];
    if (Number.isFinite(row.capturedAt)) {
      const index = lowerBound(samples, row.capturedAt);
      const forward = [], backward = [];
      for (let i = index; i < Math.min(samples.length, index + maxPeers * 4); i++) {
        const peer = samples[i]; if (peer.capturedAt - row.capturedAt > windowMs) break;
        if (peer.capturedAt > row.capturedAt && peer.price > 0 && peer.accepted !== false && forward.length < maxPeers / 2) forward.push(peer);
      }
      for (let i = index - 1; i >= Math.max(0, index - maxPeers * 4); i--) {
        const peer = samples[i]; if (row.capturedAt - peer.capturedAt > windowMs) break;
        if (peer.price > 0 && peer.accepted !== false && backward.length < maxPeers / 2) backward.push(peer);
      }
      addEvidence('nearby-forward', forward);
      addEvidence('nearby-backward', backward);
      addEvidence('nearby-both', [...forward, ...backward]);
      const pool = [...backward, ...forward];
      let seed = (row.capturedAt ^ 0x9e3779b9) >>> 0;
      const sampled = [], indices = new Set();
      for (let attempt = 0; attempt < pool.length * 4 && sampled.length < Math.min(30, pool.length); attempt++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const pick = seed % pool.length;
        if (!indices.has(pick)) { indices.add(pick); sampled.push(pool[pick]); }
      }
      addEvidence('nearby-sampled', sampled);
    }
    // Historical fallback is restricted to old records without price-column provenance.
    // Cross-date movement alone is insufficient: require trusted records, repeated
    // agreement and a discrepancy exceeding 50% (or below two thirds of baseline).
    const history = trusted.get(row.ticker) || [];
    if (!row.outlier && !row.priceKey && Number.isFinite(row.price) && Number.isFinite(row.capturedAt) && history.length >= 6 && row.capturedAt < history[0].capturedAt) {
      const index = lowerBound(history, row.capturedAt);
      const forward = history.slice(index, index + maxPeers);
      const backward = history.slice(Math.max(0, index - maxPeers), index);
      addEvidence('historical-forward', forward, 6, .8);
      addEvidence('historical-backward', backward, 6, .8);
      addEvidence('historical-both', [...backward.slice(-maxPeers / 2), ...forward.slice(0, maxPeers / 2)], 6, .8);
      let seed = 2166136261;
      for (const char of row.ticker + ':' + row.capturedAt) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
      const indices = new Set();
      const sampled = [];
      for (let attempt = 0; attempt < maxPeers * 4 && sampled.length < Math.min(30, history.length); attempt++) {
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0;
        const pick = seed % history.length;
        if (!indices.has(pick)) { indices.add(pick); sampled.push(history[pick]); }
      }
      addEvidence('historical-sampled', sampled, 6, .8);
      const votes = evidence.filter(item => item.method.startsWith('historical-'));
      const agreeing = votes.filter(item => item.deltaPct > 50 + 1e-9 || item.deltaPct < -100 / 3 - 1e-9);
      const sameDirection = agreeing.length && agreeing.every(item => Math.sign(item.deltaPct) === Math.sign(agreeing[0].deltaPct));
      const centersAgree = agreeing.length && agreeing.every(item => Math.abs(item.referencePrice / agreeing[0].referencePrice - 1) <= .1 + 1e-9);
      if (agreeing.length >= 2 && sameDirection && centersAgree && votes.every(item => agreeing.includes(item))) {
        const referencePrice = median(agreeing.map(item => item.referencePrice).sort((a, b) => a - b));
        return { ...row, outlier: true, referencePrice, referenceCount: Math.max(...agreeing.map(item => item.count)), outlierDeltaPct: (row.price - referencePrice) / referencePrice * 100, outlierMethod: 'historical-consensus', outlierEvidence: evidence };
      }
    }
    return { ...row, outlierMethod: row.outlier ? 'nearby-consensus' : null, outlierEvidence: evidence };
  });
}
