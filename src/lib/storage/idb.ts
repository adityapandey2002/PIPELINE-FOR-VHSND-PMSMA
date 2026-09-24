import type { DatasetSnapshot, DatasetSummary } from "@/contracts/dataset";
import type { RowResolution } from "@/contracts/resolution";
import { decryptBytes, decryptString, encryptBytes, encryptString } from "@/lib/crypto";

/**
 * A single versioned IndexedDB connection owns all stores for this app.
 *
 * Using idb-keyval's `createStore` pinned every database at version 1, so a
 * database created by an earlier build (with different store names) could never
 * be upgraded and transactions died with `NotFoundError`. Here the connection
 * is opened at an explicit version and `onupgradeneeded` creates any store that
 * is missing, so stale databases self-heal.
 */

export const P = {
  datasets: "ds",
  resolutions: "res",
  charts: "chart",
  chartBlobs: "blob",
  ui: "ui",
} as const;

const DB_NAME = "vhsnd-pipeline";
const DB_VERSION = 2;
const STORES = ["ds", "res", "chart", "blob", "validation", "ui"] as const;
type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error(`IndexedDB upgrade for "${DB_NAME}" is blocked by another tab.`));
  });
  return dbPromise;
}

function objectStore(store: StoreName, mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return openDB().then((db) => db.transaction(store, mode).objectStore(store));
}

function reqResult<T>(req: IDBRequest<T>, mode: "get" | "allKeys"): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
    void mode;
  });
}

async function storeSet<T>(store: StoreName, key: IDBValidKey, value: T): Promise<void> {
  const os = await objectStore(store, "readwrite");
  return new Promise((resolve, reject) => {
    const req = os.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function storeGet<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const os = await objectStore(store, "readonly");
  return (await reqResult(os.get(key as never), "get")) as T | undefined;
}

async function storeDelete(store: StoreName, key: IDBValidKey): Promise<void> {
  const os = await objectStore(store, "readwrite");
  return new Promise((resolve, reject) => {
    const req = os.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function storeKeys(store: StoreName): Promise<IDBValidKey[]> {
  const os = await objectStore(store, "readonly");
  return ((await reqResult(os.getAllKeys(), "allKeys")) ?? []) as IDBValidKey[];
}

/* ------------------------------- datasets ------------------------------- */

export async function saveDataset(snapshot: DatasetSnapshot): Promise<void> {
  await storeSet(P.datasets, snapshot.id, await encryptString(JSON.stringify(snapshot)));
}

export async function loadDataset(id: string): Promise<DatasetSnapshot | null> {
  const raw = await storeGet<string>(P.datasets, id);
  if (!raw) return null;
  return JSON.parse(await decryptString(raw)) as DatasetSnapshot;
}

export async function listDatasets(): Promise<DatasetSummary[]> {
  const ks = await storeKeys(P.datasets);
  const out: DatasetSummary[] = [];
  for (const k of ks) {
    const raw = await storeGet<string>(P.datasets, k);
    if (!raw) continue;
    const snap = JSON.parse(await decryptString(raw)) as DatasetSnapshot;
    out.push({
      id: snap.id,
      kind: snap.kind,
      name: snap.name,
      fileName: snap.source.fileName,
      totalRows: snap.totalRows,
      importedAt: snap.source.importedAt,
      schemaVersion: snap.schemaVersion,
    });
  }
  return out.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}

export async function deleteDataset(id: string): Promise<void> {
  await storeDelete(P.datasets, id);
  await storeDelete(P.resolutions, id);
  // Charts and their blobs for this dataset are removed separately by the store.
}

/* ------------------------------- resolutions ------------------------------- */

export async function saveResolutions(datasetId: string, map: Record<string, RowResolution>): Promise<void> {
  await storeSet(P.resolutions, datasetId, await encryptString(JSON.stringify(map)));
}

export async function loadResolutions(datasetId: string): Promise<Record<string, RowResolution>> {
  const raw = await storeGet<string>(P.resolutions, datasetId);
  if (!raw) return {};
  return JSON.parse(await decryptString(raw)) as Record<string, RowResolution>;
}

/* ------------------------- chart metadata / blobs ------------------------- */

export interface StoredChartMeta {
  id: string;
  datasetId: string;
  kind: string;
  indicatorId: string;
  title: string;
  createdAt: string;
  config: unknown;
  image?: { width: number; height: number; blobKey: string };
}

export async function saveChartMeta(meta: StoredChartMeta): Promise<void> {
  await storeSet(P.charts, meta.id, await encryptString(JSON.stringify(meta)));
}

export async function loadChartMetas(datasetId: string): Promise<StoredChartMeta[]> {
  const ks = await storeKeys(P.charts);
  const out: StoredChartMeta[] = [];
  for (const k of ks) {
    const raw = await storeGet<string>(P.charts, k);
    if (!raw) continue;
    const meta = JSON.parse(await decryptString(raw)) as StoredChartMeta;
    if (!datasetId || meta.datasetId === datasetId) out.push(meta);
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function deleteChart(id: string): Promise<void> {
  const meta = await storeGet<string>(P.charts, id);
  if (meta) {
    const parsed = JSON.parse(await decryptString(meta)) as StoredChartMeta;
    if (parsed.image) await storeDelete(P.chartBlobs, parsed.image.blobKey);
  }
  await storeDelete(P.charts, id);
}

export async function saveChartBlob(blobKey: string, blob: Blob): Promise<void> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await storeSet(P.chartBlobs, blobKey, await encryptBytes(bytes));
}

export async function loadChartBlob(blobKey: string): Promise<Blob | null> {
  const raw = await storeGet<Uint8Array>(P.chartBlobs, blobKey);
  if (!raw) return null;
  const plain = await decryptBytes(raw);
  return new Blob([plain as BlobPart], { type: "image/png" });
}

/* -------------------------- validation (cache) -------------------------- */

export interface ValidationCache {
  violations: import("@/contracts/violation").Violation[];
  counts: { error: number; warning: number; info: number };
  byRow: Record<string, import("@/contracts/violation").Violation[]>;
  validatedAt: string;
}

export async function saveValidation(datasetId: string, cache: ValidationCache): Promise<void> {
  await storeSet("validation", datasetId, await encryptString(JSON.stringify(cache)));
}

export async function loadValidation(datasetId: string): Promise<ValidationCache | null> {
  const raw = await storeGet<string>("validation", datasetId);
  if (!raw) return null;
  return JSON.parse(await decryptString(raw)) as ValidationCache;
}

export async function deleteValidation(datasetId: string): Promise<void> {
  await storeDelete("validation", datasetId);
}

/* ------------------------------- ui (zustand) ------------------------------- */

export interface EncryptedKeyValStorage {
  getItem(name: string): Promise<string | null>;
  setItem(name: string, value: string): Promise<void>;
  removeItem(name: string): Promise<void>;
}

/** Async encrypted IDB storage for zustand `persist`. */
export function createEncryptedStorage(): EncryptedKeyValStorage {
  return {
    async getItem(name) {
      const raw = await storeGet<string>(P.ui, name);
      return raw ? decryptString(raw) : null;
    },
    async setItem(name, value) {
      await storeSet(P.ui, name, await encryptString(value));
    },
    async removeItem(name) {
      await storeDelete(P.ui, name);
    },
  };
}

export { encryptString, decryptString, encryptBytes, decryptBytes };

/**
 * Permanent wipe of every IndexedDB database this app has written to.
 * Used by the privacy "Erase all local data" action.
 */
export async function eraseAllLocalData(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const dbs = await indexedDB.databases();
  await Promise.all(
    dbs
      .filter((d) => d.name?.startsWith("vhsnd-pipeline") || d.name?.startsWith("pipeline-crypto"))
      .map((d) => new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase(d.name!);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      })),
  );
}