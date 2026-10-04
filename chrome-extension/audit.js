import { priceDeviation } from './pushed-data.js';
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('scrape-audit', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('rows', { keyPath: 'id', autoIncrement: true });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function mutateAudit(entries, operation, price) {
  if (!['delete', 'edit'].includes(operation) || !entries.length || entries.length > 100) throw new Error('Select 1–100 records.');
  if (operation === 'edit' && (!Number.isFinite(price) || price <= 0)) throw new Error('Price must be positive.');
  const db = await openDB();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('rows', 'readwrite');
      const store = tx.objectStore('rows');
      for (const entry of entries) {
        const request = store.get(entry.id);
        request.onsuccess = () => {
          const row = request.result;
          if (!row || row.price !== entry.price) { tx.abort(); return; }
          if (operation === 'delete') store.delete(entry.id);
          else store.put({ ...row, originalPrice: row.originalPrice ?? row.price, price, accepted: true, editedAt: Date.now() });
        };
      }
      tx.oncomplete = resolve;
      tx.onabort = () => reject(new Error('Audit record changed. Refresh and try again.'));
      tx.onerror = () => reject(tx.error);
    });
    await chrome.storage.local.set({ auditUpdatedAt: Date.now() });
    return entries.map(entry => ({ id: entry.id, ok: true }));
  } finally { db.close(); }
}

export async function saveAudit(result, url, source = 'automatic') {
  const db = await openDB();
  const capturedAt = Date.now();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('rows', 'readwrite');
      const store = tx.objectStore('rows');
      for (const row of result.auditRows?.length ? result.auditRows : result.rows || []) {
        const parsed = (result.rows || []).find(value => value.ticker === row.ticker && value.price === row.price);
        store.add({ ...row, accepted: row.accepted ?? (Number.isFinite(row.price) && row.price > 0), name: parsed?.name ?? null, changePct: parsed?.changePct ?? null, capturedAt, url, source, strategy: result.strategy });
      }
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
    await chrome.storage.local.set({ auditUpdatedAt: capturedAt });
  } finally { db.close(); }
}

export async function queryAudit({ from = '', to = '', ticker = '', strategy = '', accepted = '', source = '', outliers = '', page = 1, pageSize = 25 } = {}) {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('rows');
      const request = tx.objectStore('rows').openCursor();
      const tickers = new Set();
      const previous = new Map();
      const rows = [];
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const row = cursor.value;
        tickers.add(row.ticker);
        Object.assign(row, priceDeviation(row.price, previous.get(row.ticker)));
        if (row.accepted !== false && Number.isFinite(row.price) && row.price > 0) previous.set(row.ticker, row.price);
        const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Qatar', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(row.capturedAt);
        const part = type => parts.find(value => value.type === type).value;
        const date = part('year') + '-' + part('month') + '-' + part('day');
        if ((!from || date >= from) && (!to || date <= to) && (!ticker || (row.ticker || '').toUpperCase().includes(ticker.toUpperCase())) && (!strategy || row.strategy === strategy) && (!source || row.source === source) && (!accepted || String(row.accepted) === accepted) && (!outliers || row.outlier)) {
          if (total >= (page - 1) * pageSize && rows.length < pageSize) rows.push(row);
          total++;
        }
        cursor.continue();
      };
      tx.oncomplete = () => resolve({ rows: rows.reverse().slice((page - 1) * pageSize, page * pageSize), total: rows.length, tickers: [...tickers].filter(Boolean).sort(), chartRows: rows.map(({ ticker, price, capturedAt, outlier, deltaPct }) => ({ ticker, price, capturedAt, outlier, deltaPct })), outlierRows: rows.filter(row => row.outlier).slice(0, 100).map(({ id, ticker, price }) => ({ id, ticker, price })) });
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
