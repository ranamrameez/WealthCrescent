function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('scrape-audit', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('rows', { keyPath: 'id', autoIncrement: true });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
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

export async function queryAudit({ from = '', to = '', ticker = '', strategy = '', accepted = '', source = '', page = 1, pageSize = 25 } = {}) {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('rows');
      const request = tx.objectStore('rows').openCursor(null, 'prev');
      let total = 0;
      const rows = [];
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const row = cursor.value;
        const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Qatar', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(row.capturedAt);
        const part = type => parts.find(value => value.type === type).value;
        const date = part('year') + '-' + part('month') + '-' + part('day');
        if ((!from || date >= from) && (!to || date <= to) && (!ticker || (row.ticker || '').toUpperCase().includes(ticker.toUpperCase())) && (!strategy || row.strategy === strategy) && (!source || row.source === source) && (!accepted || String(row.accepted) === accepted)) {
          if (total >= (page - 1) * pageSize && rows.length < pageSize) rows.push(row);
          total++;
        }
        cursor.continue();
      };
      tx.oncomplete = () => resolve({ rows, total });
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
