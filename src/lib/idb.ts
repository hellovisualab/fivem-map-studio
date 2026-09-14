const DB_NAME = 'fivem-map-studio'
const DB_VERSION = 1
export const STORES = ['users', 'projects', 'history', 'assets', 'kv'] as const
export type StoreName = (typeof STORES)[number]

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode)
        const req = fn(t.objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

export const idb = {
  get: <T>(store: StoreName, id: string) => tx<T | undefined>(store, 'readonly', (s) => s.get(id) as IDBRequest<T | undefined>),
  getAll: <T>(store: StoreName) => tx<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>),
  put: <T extends { id: string }>(store: StoreName, value: T) => tx(store, 'readwrite', (s) => s.put(value)),
  delete: (store: StoreName, id: string) => tx(store, 'readwrite', (s) => s.delete(id)),
}
