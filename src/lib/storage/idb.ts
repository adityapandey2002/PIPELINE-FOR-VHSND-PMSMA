import { createStore, get as idbGet, set as idbSet, del as idbDel, keys as idbKeys } from "idb-keyval";
import type { DatasetSnapshot, DatasetSummary } from "@/contracts/dataset";
import type { RowResolution } from "@/contracts/resolution";
import { decryptBytes, decryptString, encryptBytes, encryptString } from "@/lib/crypto";

export const pipelineStore = createStore("vhsnd-pipeline", "keyval");

const P = {
  datasets: "ds",
  resolutions: "res",
  charts: "chart",
  chartBlobs: "blob",
  ui: "ui",
};

function storeFor(prefix: string) {
  return createStore("vhsnd-pipeline", prefix);
}

/* ------------------------------- datasets ------------------------------- */

export async function saveDataset(snapshot: DatasetSnapshot): Promise<void> {
  await idbSet(snapshot.id, await encryptString(JSON.stringify(snapshot)), storeFor(P.datasets));
}

export async function loadDataset(id: string): Promise<DatasetSnapshot | null> {
  const raw = await idbGet<string>(id, storeFor(P.datasets));
  if (!raw) return null;
  return JSON.parse(await decryptString(raw)) as DatasetSnapshot;
}

export async function listDatasets(): Promise<DatasetSummary[]> {
  const store = storeFor(P.datasets);
  const ks = await idbKeys(store);
  const out: DatasetSummary[] = [];
  for (const k of ks) {
    const raw = await idbGet<string>(k as string, store);
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
  const store = storeFor(P.datasets);
  await idbDel(id, store);
  await idbDel(id, storeFor(P.resolutions));
  // Charts and their blobs for this dataset are removed separately by the store.
}

/* ------------------------------- resolutions ------------------------------- */

export async function saveResolutions(datasetId: string, map: Record<string, RowResolution>): Promise<void> {
  await idbSet(datasetId, await encryptString(JSON.stringify(map)), storeFor(P.resolutions));
}

export async function loadResolutions(datasetId: string): Promise<Record<string, RowResolution>> {
  const raw = await idbGet<string>(datasetId, storeFor(P.resolutions));
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
  await idbSet(meta.id, await encryptString(JSON.stringify(meta)), storeFor(P.charts));
}

export async function loadChartMetas(datasetId: string): Promise<StoredChartMeta[]> {
  const store = storeFor(P.charts);
  const ks = await idbKeys(store);
  const out: StoredChartMeta[] = [];
  for (const k of ks) {
    const raw = await idbGet<string>(k as string, store);
    if (!raw) continue;
    const meta = JSON.parse(await decryptString(raw)) as StoredChartMeta;
    if (!datasetId || meta.datasetId === datasetId) out.push(meta);
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function deleteChart(id: string): Promise<void> {
  const store = storeFor(P.charts);
  const meta = await idbGet<string>(id, store);
  if (meta) {
    const parsed = JSON.parse(await decryptString(meta)) as StoredChartMeta;
    if (parsed.image) await idbDel(parsed.image.blobKey, storeFor(P.chartBlobs));
  }
  await idbDel(id, store);
}

export async function saveChartBlob(blobKey: string, blob: Blob): Promise<void> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await idbSet(blobKey, await encryptBytes(bytes), storeFor(P.chartBlobs));
}

export async function loadChartBlob(blobKey: string): Promise<Blob | null> {
  const raw = await idbGet<Uint8Array>(blobKey, storeFor(P.chartBlobs));
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
  await idbSet(datasetId, await encryptString(JSON.stringify(cache)), storeFor("validation"));
}

export async function loadValidation(datasetId: string): Promise<ValidationCache | null> {
  const raw = await idbGet<string>(datasetId, storeFor("validation"));
  if (!raw) return null;
  return JSON.parse(await decryptString(raw)) as ValidationCache;
}

export async function deleteValidation(datasetId: string): Promise<void> {
  await idbDel(datasetId, storeFor("validation"));
}

/* ------------------------------- ui (zustand) ------------------------------- */

export interface EncryptedKeyValStorage {
  getItem(name: string): Promise<string | null>;
  setItem(name: string, value: string): Promise<void>;
  removeItem(name: string): Promise<void>;
}

/** Async encrypted IDB storage for zustand `persist`. */
export function createEncryptedStorage(): EncryptedKeyValStorage {
  const store = storeFor(P.ui);
  return {
    async getItem(name) {
      const raw = await idbGet<string>(name, store);
      return raw ? decryptString(raw) : null;
    },
    async setItem(name, value) {
      await idbSet(name, await encryptString(value), store);
    },
    async removeItem(name) {
      await idbDel(name, store);
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