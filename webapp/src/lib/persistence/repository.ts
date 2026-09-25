/**
 * Module-neutral persistence boundary.
 *
 * Feature stores must depend on this contract rather than IndexedDB or
 * Firebase directly. The first implementation is intentionally small: it
 * provides durable, individually-addressable records and an atomic bulk
 * transaction for the migration phase. Cloud sync is layered on later.
 */
export type RepositoryKey = string;

export type RepositoryQuery<T> = {
  index?: keyof T & string;
  equals?: unknown;
  where?: (record: T) => boolean;
  limit?: number;
};

export interface Repository {
  get<T>(collection: string, id: RepositoryKey): Promise<T | undefined>;
  query<T>(collection: string, query?: RepositoryQuery<T>): Promise<T[]>;
  add<T extends { id: RepositoryKey }>(collection: string, record: T): Promise<void>;
  update<T extends { id: RepositoryKey }>(collection: string, record: T): Promise<void>;
  delete(collection: string, id: RepositoryKey): Promise<void>;
  bulkPut<T extends { id: RepositoryKey }>(collection: string, records: T[]): Promise<void>;
  transaction<T>(work: (repository: Repository) => Promise<T>): Promise<T>;
}
