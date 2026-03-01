import type { ProjectData } from '../types';

const DB_NAME = 'mophrase-db';
const DB_VERSION = 1;
const PROJECT_STORE = 'projects';
const INDEX_BY_NAME = 'by_name_normalized';
const INDEX_BY_UPDATED_AT = 'by_updated_at';

export type StoredProjectRecord = {
  id: string;
  name: string;
  nameNormalized: string;
  data: ProjectData;
  createdAt: number;
  updatedAt: number;
};

export type ProjectSummary = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

let dbPromise: Promise<IDBDatabase> | null = null;

const normalizeProjectName = (name: string): string => name.trim().toLowerCase();

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const transactionDone = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

const openDatabase = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(PROJECT_STORE)) {
        const store = database.createObjectStore(PROJECT_STORE, {
          keyPath: 'id',
        });
        store.createIndex(INDEX_BY_NAME, 'nameNormalized', { unique: true });
        store.createIndex(INDEX_BY_UPDATED_AT, 'updatedAt', { unique: false });
        return;
      }

      const transaction = request.transaction;
      if (!transaction) return;
      const store = transaction.objectStore(PROJECT_STORE);
      if (!store.indexNames.contains(INDEX_BY_NAME)) {
        store.createIndex(INDEX_BY_NAME, 'nameNormalized', { unique: true });
      }
      if (!store.indexNames.contains(INDEX_BY_UPDATED_AT)) {
        store.createIndex(INDEX_BY_UPDATED_AT, 'updatedAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error('[projectStorage] Failed to open database: blocked.'));
  });

  return dbPromise;
};

const toProjectSummary = (record: StoredProjectRecord): ProjectSummary => ({
  id: record.id,
  name: record.name,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});

export const createNewProjectId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const listProjects = async (): Promise<ProjectSummary[]> => {
  const db = await openDatabase();
  const transaction = db.transaction(PROJECT_STORE, 'readonly');
  const store = transaction.objectStore(PROJECT_STORE);
  const records = (await requestToPromise(
    store.getAll(),
  )) as StoredProjectRecord[];
  await transactionDone(transaction);
  return records
    .map((record) => toProjectSummary(record))
    .sort((a, b) => b.updatedAt - a.updatedAt);
};

export const getProject = async (
  id: string,
): Promise<StoredProjectRecord | null> => {
  const db = await openDatabase();
  const transaction = db.transaction(PROJECT_STORE, 'readonly');
  const store = transaction.objectStore(PROJECT_STORE);
  const record = (await requestToPromise(
    store.get(id),
  )) as StoredProjectRecord | undefined;
  await transactionDone(transaction);
  return record ?? null;
};

export const findProjectByName = async (
  name: string,
): Promise<StoredProjectRecord | null> => {
  const db = await openDatabase();
  const transaction = db.transaction(PROJECT_STORE, 'readonly');
  const store = transaction.objectStore(PROJECT_STORE);
  const index = store.index(INDEX_BY_NAME);
  const record = (await requestToPromise(
    index.get(normalizeProjectName(name)),
  )) as StoredProjectRecord | undefined;
  await transactionDone(transaction);
  return record ?? null;
};

export const saveProject = async (input: {
  id?: string;
  name: string;
  data: ProjectData;
}): Promise<{ id: string; name: string; updatedAt: number }> => {
  const trimmedName = input.name.trim();
  if (!trimmedName) {
    throw new Error('[projectStorage] Project name is required.');
  }

  const db = await openDatabase();
  const transaction = db.transaction(PROJECT_STORE, 'readwrite');
  const store = transaction.objectStore(PROJECT_STORE);
  const now = Date.now();
  const targetId = input.id ?? createNewProjectId();
  const existing = (await requestToPromise(
    store.get(targetId),
  )) as StoredProjectRecord | undefined;

  const record: StoredProjectRecord = {
    id: targetId,
    name: trimmedName,
    nameNormalized: normalizeProjectName(trimmedName),
    data: input.data,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  store.put(record);
  await transactionDone(transaction);

  return {
    id: record.id,
    name: record.name,
    updatedAt: record.updatedAt,
  };
};

export const deleteProject = async (id: string): Promise<boolean> => {
  const db = await openDatabase();
  const transaction = db.transaction(PROJECT_STORE, 'readwrite');
  const store = transaction.objectStore(PROJECT_STORE);
  const existing = (await requestToPromise(
    store.get(id),
  )) as StoredProjectRecord | undefined;
  if (!existing) {
    await transactionDone(transaction);
    return false;
  }

  store.delete(id);
  await transactionDone(transaction);
  return true;
};
