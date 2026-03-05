/**
 * In-memory database for demo/development when PostgreSQL is not available.
 * Stores data in plain arrays — resets on restart.
 */

export interface MemoryStore {
  organizations: any[];
  users: any[];
  documents: any[];
  envelopes: any[];
  recipients: any[];
  signature_events: any[];
  audit_logs: any[];
  completion_certificates: any[];
}

export const store: MemoryStore = {
  organizations: [],
  users: [],
  documents: [],
  envelopes: [],
  recipients: [],
  signature_events: [],
  audit_logs: [],
  completion_certificates: [],
};

/** Simple query helper that returns rows from store */
export function findInStore<T = any>(
  table: keyof MemoryStore,
  predicate: (row: any) => boolean,
  limit?: number
): T[] {
  let results = store[table].filter(predicate);
  if (limit) results = results.slice(0, limit);
  return results as T[];
}

export function insertIntoStore(table: keyof MemoryStore, row: any): void {
  store[table].push({ ...row, created_at: row.created_at ?? new Date().toISOString() });
}

export function updateInStore(
  table: keyof MemoryStore,
  predicate: (row: any) => boolean,
  updates: Record<string, any>
): number {
  let count = 0;
  for (const row of store[table]) {
    if (predicate(row)) {
      Object.assign(row, updates);
      count++;
    }
  }
  return count;
}
