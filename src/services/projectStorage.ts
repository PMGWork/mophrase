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

// プロジェクト名を正規化（トリム＆小文字化）
const normalizeProjectName = (name: string): string =>
  name.trim().toLowerCase();

// IDBRequest を Promise にラップ
const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

// IDBTransaction の完了を待つ
const transactionDone = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

// IndexedDB を開く（初回はスキーマ作成、以降はキャッシュ済み Promise を返す）
const openDatabase = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;

  const openingPromise = new Promise<IDBDatabase>((resolve, reject) => {
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
  }).catch((error) => {
    // 一時エラー時に再試行できるよう、失敗したPromiseキャッシュを破棄する
    dbPromise = null;
    throw error;
  });

  dbPromise = openingPromise;
  return openingPromise;
};

// StoredProjectRecord からサマリー情報のみ抽出
const toProjectSummary = (record: StoredProjectRecord): ProjectSummary => ({
  id: record.id,
  name: record.name,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});

// 新規プロジェクト用のユニーク ID を生成
const createNewProjectId = (): string => {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

// 全プロジェクトのサマリー一覧を取得（更新日時降順）
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

// ID でプロジェクトを取得（存在しなければ null）
export const getProject = async (
  id: string,
): Promise<StoredProjectRecord | null> => {
  const db = await openDatabase();
  const transaction = db.transaction(PROJECT_STORE, 'readonly');
  const store = transaction.objectStore(PROJECT_STORE);
  const record = (await requestToPromise(store.get(id))) as
    | StoredProjectRecord
    | undefined;
  await transactionDone(transaction);
  return record ?? null;
};

// プロジェクト名で検索（正規化済み名前のユニークインデックスを使用）
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

// プロジェクトを保存（新規作成 or 上書き更新）
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
  const existing = (await requestToPromise(store.get(targetId))) as
    | StoredProjectRecord
    | undefined;

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

// プロジェクトを削除（存在しなければ false）
export const deleteProject = async (id: string): Promise<boolean> => {
  const db = await openDatabase();
  const transaction = db.transaction(PROJECT_STORE, 'readwrite');
  const store = transaction.objectStore(PROJECT_STORE);
  const existing = (await requestToPromise(store.get(id))) as
    | StoredProjectRecord
    | undefined;
  if (!existing) {
    await transactionDone(transaction);
    return false;
  }

  store.delete(id);
  await transactionDone(transaction);
  return true;
};

// プロジェクト名を変更（名前の重複チェック付き）
export const renameProject = async (input: {
  id: string;
  name: string;
}): Promise<{ id: string; name: string; updatedAt: number } | null> => {
  const trimmedName = input.name.trim();
  if (!trimmedName) {
    throw new Error('[projectStorage] Project name is required.');
  }

  const db = await openDatabase();
  const transaction = db.transaction(PROJECT_STORE, 'readwrite');
  const store = transaction.objectStore(PROJECT_STORE);
  const existing = (await requestToPromise(store.get(input.id))) as
    | StoredProjectRecord
    | undefined;
  if (!existing) {
    await transactionDone(transaction);
    return null;
  }

  const normalizedName = normalizeProjectName(trimmedName);
  const nameIndex = store.index(INDEX_BY_NAME);
  const conflict = (await requestToPromise(
    nameIndex.get(normalizedName),
  )) as StoredProjectRecord | undefined;
  if (conflict && conflict.id !== input.id) {
    transaction.abort();
    throw new Error('[projectStorage] Project name already exists.');
  }

  const updated: StoredProjectRecord = {
    ...existing,
    name: trimmedName,
    nameNormalized: normalizedName,
    updatedAt: Date.now(),
  };

  store.put(updated);
  await transactionDone(transaction);
  return {
    id: updated.id,
    name: updated.name,
    updatedAt: updated.updatedAt,
  };
};
