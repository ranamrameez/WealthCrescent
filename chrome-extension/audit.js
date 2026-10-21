import { priceDeviation, flagPriceOutliers } from './pushed-data.js';
import { qatarDate } from './activity.js';
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('scrape-audit', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('rows', { keyPath: 'id', autoIncrement: true });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function summarizeAuditToday(now = Date.now()) {
  const db = await openDB();
  const date = qatarDate(now);
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('rows');
      const request = tx.objectStore('rows').openCursor();
      const batches = new Set();
      let rowCount = 0;
      let syncedRows = 0;
      let lastSyncAt = null;
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const row = cursor.value;
        if (qatarDate(row.capturedAt) === date) {
          batches.add(`${row.capturedAt}:${row.source || ''}:${row.url || ''}`);
          rowCount++;
          if (row.syncedAt) syncedRows++;
        }
        if (row.syncedAt && (!lastSyncAt || row.syncedAt > lastSyncAt)) lastSyncAt = row.syncedAt;
        cursor.continue();
      };
      tx.oncomplete = () => resolve({ date, scrapeCount: batches.size, rowCount, syncedRows, lastSyncAt });
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Audit summary interrupted.'));
    });
  } finally { db.close(); }
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
          else store.put({ ...row, originalPrice: row.originalPrice ?? row.price, price, accepted: true, previousSyncedAt: row.syncedAt || row.previousSyncedAt || null, syncedAt: null, editedAt: Date.now() });
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

// Remove only rows from the completed batch whose ticker was actually pushed.
// Failed or pending rows stay local for a later retry.
export async function clearPushedAuditRows(capturedAt, tickers) {
  const pushed = new Set(tickers || []);
  if (!capturedAt || !pushed.size) return 0;
  const db = await openDB();
  let deleted = 0;
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('rows', 'readwrite');
      const request = tx.objectStore('rows').openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const row = cursor.value;
        if (row.capturedAt === capturedAt && pushed.has(row.ticker) && row.accepted !== false) { cursor.delete(); deleted++; }
        cursor.continue();
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Local cleanup interrupted.'));
    });
    if (deleted) await chrome.storage.local.set({ auditUpdatedAt: Date.now() });
    return deleted;
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
    return capturedAt;
  } finally { db.close(); }
}

export async function markAuditSynced(capturedAt, tickers) {
  if (!tickers.length) return;
  const db = await openDB();
  const syncedAt = Date.now();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('rows', 'readwrite');
      const request = tx.objectStore('rows').openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const row = cursor.value;
        if (row.capturedAt === capturedAt && row.accepted !== false && tickers.includes(row.ticker)) cursor.update({ ...row, syncedAt });
        cursor.continue();
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Sync audit update interrupted.'));
    });
    await chrome.storage.local.set({ auditUpdatedAt: syncedAt });
  } finally { db.close(); }
}

let auditSnapshot = null;
async function readAuditSnapshot() {
  const cacheable = typeof chrome !== 'undefined' && chrome.storage?.local?.get;
  const { auditUpdatedAt = 0 } = cacheable ? await chrome.storage.local.get('auditUpdatedAt') : {};
  if (cacheable && auditSnapshot?.version === auditUpdatedAt && Date.now() - auditSnapshot.at < 5000) return auditSnapshot.promise;
  const pending = { version: auditUpdatedAt, at: Date.now() };
  pending.promise = (async () => {
    const db = await openDB();
    try {
      const rows = await new Promise((resolve, reject) => {
        const tx = db.transaction('rows'), request = tx.objectStore('rows').openCursor(), rows = [], previous = new Map();
        request.onsuccess = () => {
          const cursor = request.result; if (!cursor) return;
          const row = cursor.value;
          Object.assign(row, priceDeviation(row.price, previous.get(row.ticker)));
          if (row.accepted !== false && Number.isFinite(row.price) && row.price > 0) previous.set(row.ticker, row.price);
          row.date = qatarDate(row.capturedAt); rows.push(row); cursor.continue();
        };
        tx.oncomplete = () => resolve(rows); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Audit query interrupted.'));
      });
      return { rows, version: auditUpdatedAt, annotated: null };
    } finally { db.close(); }
  })().catch(error => { if (auditSnapshot === pending) auditSnapshot = null; throw error; });
  if (cacheable) auditSnapshot = pending;
  return pending.promise;
}
export async function queryAudit({ from = '', to = '', ticker = '', strategy = '', accepted = '', source = '', outliers = '', page = 1, pageSize = 50, includeRecords = false, rawOnly = false } = {}) {
  const snapshot = await readAuditSnapshot();
  if (rawOnly && includeRecords) return { records: snapshot.rows, auditVersion: snapshot.version };
  snapshot.annotated ||= flagPriceOutliers(snapshot.rows).reverse();
  const filtered = snapshot.annotated.filter(row => (!from || row.date >= from) && (!to || row.date <= to) && (!ticker || (row.ticker || '').toUpperCase().includes(ticker.toUpperCase())) && (!strategy || row.strategy === strategy) && (!source || row.source === source) && (!accepted || String(row.accepted) === accepted) && (!outliers || row.outlier));
  return { rows: filtered.slice((page - 1) * pageSize, page * pageSize), ...(includeRecords ? { records: filtered } : {}), total: filtered.length, outlierTotal: filtered.filter(row => row.outlier).length, tickers: [...new Set(snapshot.rows.map(row => row.ticker))].filter(Boolean).sort(), chartRows: filtered.map(({ ticker, price, capturedAt, outlier, deltaPct, outlierDeltaPct, referencePrice, referenceCount, outlierMethod, dayHigh, dayLow }) => ({ ticker, price, capturedAt, outlier, deltaPct, outlierDeltaPct, referencePrice, referenceCount, outlierMethod, dayHigh, dayLow })), outlierRows: filtered.filter(row => row.outlier).slice(0, 100) };
}
