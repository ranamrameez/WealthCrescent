export function combineRecords(firebase, local) {
  const byTicker = new Map();
  for (const row of firebase) {
    if (!byTicker.has(row.ticker)) byTicker.set(row.ticker, []);
    byTicker.get(row.ticker).push(row);
  }
  const synced = firebase.map(row => ({ ...row, origin: 'firebase', syncStatus: 'Synced' }));
  const audit = local.map(row => {
    const match = row.accepted !== false && (byTicker.get(row.ticker) || []).some(point => point.price === row.price && point.capturedAt >= row.capturedAt);
    return { ...row, auditId: row.id, id: `local:${row.id}`, origin: 'local', syncStatus: row.accepted === false ? 'Rejected' : row.syncedAt ? 'Synced' : match ? 'Synced (stored price match)' : 'Pending / unverified' };
  });
  return [...synced, ...audit].sort((a, b) => (b.capturedAt || 0) - (a.capturedAt || 0));
}
