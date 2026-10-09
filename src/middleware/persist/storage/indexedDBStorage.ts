import type { PersistStorageFactory } from './PersistStorage.js';

/**
 * Connection configuration, independent of persist's data migration version.
 * @example
 * const options: IndexedDBStorageOptions = { database: 'editor', store: 'drafts' };
 */
export type IndexedDBStorageOptions = {
  /** Database name owned by the application. */
  readonly database: string;
  /** Object store name. Defaults to `state`. */
  readonly store?: string;
  /** IndexedDB schema version. Defaults to `1`; increment when adding a store. */
  readonly version?: number;
};

/**
 * Creates a factory for independently owned native IndexedDB connections.
 * Values use structured clone, preserving Blob, File, Map, Set and binary data.
 * Operations resolve on transaction completion, not request success.
 * @param options - Database configuration captured without browser access.
 * @example
 * const storage = indexedDBStorage({ database: 'editor-state' });
 * const editor = pipe.use(persist({ key: 'draft', storage, decode })).create(initial);
 * await editor.persist.rehydrate();
 */
export function indexedDBStorage(options: IndexedDBStorageOptions): PersistStorageFactory {
  const { database, store: storeName = 'state', version = 1 } = options;
  return () => {
    let disposed = false;
    let connection: IDBDatabase | undefined;
    let opening: Promise<IDBDatabase> | undefined;
    let cancelOpen: (() => void) | undefined;
    const transactions = new Set<IDBTransaction>();
    const disposedError = () => new DOMException('Storage adapter was disposed', 'AbortError');

    const open = (): Promise<IDBDatabase> => {
      if (disposed) {
        return Promise.reject(disposedError());
      }
      if (connection !== undefined) {
        return Promise.resolve(connection);
      }
      if (opening !== undefined) {
        return opening;
      }
      opening = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(database, version);
        let settled = false;
        const fail = (error: unknown): void => {
          settled = true;
          reject(error);
        };
        cancelOpen = () => fail(disposedError());
        request.onblocked = () => fail(new DOMException('Database upgrade is blocked', 'InvalidStateError'));
        request.onerror = () => fail(request.error);
        request.onupgradeneeded = () => {
          if (disposed || settled) {
            request.transaction?.abort();
            return;
          }
          if (!request.result.objectStoreNames.contains(storeName)) {
            request.result.createObjectStore(storeName);
          }
        };
        request.onsuccess = () => {
          const db = request.result;
          if (disposed || settled) {
            db.close();
            return;
          }
          settled = true;
          connection = db;
          db.onversionchange = () => {
            db.close();
            if (connection === db) {
              connection = undefined;
            }
          };
          db.onclose = () => {
            if (connection === db) {
              connection = undefined;
            }
          };
          resolve(db);
        };
      }).finally(() => {
        opening = undefined;
        cancelOpen = undefined;
      });
      return opening;
    };

    const run = async <Result>(
      mode: IDBTransactionMode,
      operation: (store: IDBObjectStore) => IDBRequest<Result>,
    ): Promise<Result> => {
      const db = await open();
      if (disposed) {
        throw disposedError();
      }
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        transactions.add(transaction);
        let result: Result;
        transaction.oncomplete = () => {
          transactions.delete(transaction);
          resolve(result);
        };
        transaction.onabort = () => {
          transactions.delete(transaction);
          reject(transaction.error ?? new DOMException('Storage transaction aborted', 'AbortError'));
        };
        try {
          const request = operation(transaction.objectStore(storeName));
          request.onsuccess = () => { result = request.result; };
        } catch (error) {
          transaction.abort();
          reject(error);
        }
      });
    };

    return {
      async getItem(key) {
        // get() cannot distinguish a missing key from a stored undefined.
        const values = await run<unknown[]>('readonly', store => store.getAll(key, 1));
        if (values.length === 0) {
          return null;
        }
        const value = values[0];
        if (value === null || value === undefined) {
          throw new TypeError('Stored IndexedDB value must contain a persistence envelope');
        }
        return value;
      },
      async setItem(key, value) {
        await run('readwrite', store => store.put(value, key));
      },
      async removeItem(key) {
        await run('readwrite', store => store.delete(key));
      },
      dispose() {
        if (disposed) {
          return;
        }
        disposed = true;
        cancelOpen?.();
        for (const transaction of transactions) {
          transaction.abort();
        }
        connection?.close();
        connection = undefined;
      },
    };
  };
}
