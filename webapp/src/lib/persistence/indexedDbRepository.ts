import type { Repository, RepositoryKey, RepositoryQuery } from './repository';

const DB_NAME = 'wealthcrescent-finance';
const DB_VERSION = 1;
const META_STORE = '__meta';

type StoredRecord = { id: RepositoryKey; value: unknown };

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open persistence database'));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function stores(db: IDBDatabase, collection: string, mode: IDBTransactionMode) {
  const tx = db.transaction(META_STORE, mode);
  return { tx, store: tx.objectStore(META_STORE), prefix: `${collection}:` };
}

const memory = new Map<string, Map<RepositoryKey, unknown>>();

export function createIndexedDbRepository(): Repository {
  const available = typeof indexedDB !== 'undefined';
  const getMemory = (collection: string) => {
    let records = memory.get(collection);
    if (!records) { records = new Map(); memory.set(collection, records); }
    return records;
  };
  return {
    async get<T>(collection: string, id: RepositoryKey) {
      if (!available) return getMemory(collection).get(id) as T | undefined;
      const db = await openDatabase();
      const { store, prefix } = stores(db, collection, 'readonly');
      const row = await requestResult<StoredRecord | undefined>(store.get(prefix + id));
      db.close();
      return row?.value as T | undefined;
    },
    async query<T>(collection: string, query: RepositoryQuery<T> = {}) {
      const rows: T[] = [];
      if (!available) rows.push(...Array.from(getMemory(collection).values()) as T[]);
      else {
        const db = await openDatabase();
        const { store, prefix } = stores(db, collection, 'readonly');
        const all = await requestResult<StoredRecord[]>(store.getAll());
        db.close();
        rows.push(...all.filter((row) => row.id.startsWith(prefix)).map((row) => row.value as T));
      }
      const filtered = rows.filter((record) => {
        if (query.where && !query.where(record)) return false;
        if (query.index && query.equals !== undefined && (record as Record<string, unknown>)[query.index] !== query.equals) return false;
        return true;
      });
      return query.limit ? filtered.slice(0, query.limit) : filtered;
    },
    async add(collection, record) {
      const existing = await this.get(collection, record.id);
      if (existing) throw new Error(`Record already exists: ${collection}/${record.id}`);
      await this.update(collection, record);
    },
    async update(collection, record) {
      if (!available) { getMemory(collection).set(record.id, record); return; }
      const db = await openDatabase();
      const { tx, store, prefix } = stores(db, collection, 'readwrite');
      store.put({ id: prefix + record.id, value: record });
      await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
      db.close();
    },
    async delete(collection, id) {
      if (!available) { getMemory(collection).delete(id); return; }
      const db = await openDatabase();
      const { tx, store, prefix } = stores(db, collection, 'readwrite');
      store.delete(prefix + id);
      await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
      db.close();
    },
    async bulkPut(collection, records) {
      for (const record of records) await this.update(collection, record);
    },
    async transaction(work) { return work(this); },
  };
}

export const repository = createIndexedDbRepository();
