export function combineRecords(firebase, local, { pendingOnly = false } = {}) {
  const byTicker = new Map();
  for (const row of firebase) {
    if (!byTicker.has(row.ticker)) byTicker.set(row.ticker, new Map());
    const prices = byTicker.get(row.ticker);
    prices.set(row.price, Math.max(prices.get(row.price) ?? -Infinity, row.capturedAt ?? -Infinity));
  }
  const synced = firebase.map(row => ({ ...row, origin: 'firebase', syncStatus: 'Synced' }));
  const audit = local.map(row => {
    const match = row.accepted !== false && (byTicker.get(row.ticker)?.get(row.price) ?? -Infinity) >= row.capturedAt;
    return { ...row, auditId: row.id, id: `local:${row.id}`, origin: 'local', syncStatus: row.accepted === false ? 'Rejected' : row.syncedAt ? 'Synced' : match ? 'Synced (stored price match)' : 'Pending / unverified' };
  }).filter(row => !pendingOnly || row.accepted === false || (!row.syncedAt && row.syncStatus === 'Pending / unverified'));
  return [...synced, ...audit].sort((a, b) => (b.capturedAt || 0) - (a.capturedAt || 0));
}
