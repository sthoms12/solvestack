export const SOLVESTACK_DB = "solvestack";
export const SOLVESTACK_STORE = "workspace";
export const SOLVESTACK_SCHEMA_VERSION = 1;

export function readWorkspace<T>(): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SOLVESTACK_DB, SOLVESTACK_SCHEMA_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(SOLVESTACK_STORE, "readonly");
      const read = transaction.objectStore(SOLVESTACK_STORE).get("data");
      read.onsuccess = () => {
        database.close();
        resolve(read.result as T | undefined);
      };
      read.onerror = () => {
        database.close();
        reject(read.error);
      };
    };
  });
}

export function writeWorkspace<T>(data: T): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SOLVESTACK_DB, SOLVESTACK_SCHEMA_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(SOLVESTACK_STORE, "readwrite");
      transaction.objectStore(SOLVESTACK_STORE).put(data, "data");
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error);
      };
      transaction.onabort = () => {
        database.close();
        reject(
          transaction.error || new Error("Local storage transaction aborted."),
        );
      };
    };
  });
}
