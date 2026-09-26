import { create } from "zustand";
import type { DatasetSnapshot } from "@/contracts/dataset";
import type { Violation } from "@/contracts/violation";
import type { ParsedSheet } from "@/schema/engine/normalize";
import { SCHEMA_VERSION, computeSchemaHash } from "@/schema";
import {
  deleteDataset,
  deleteValidation,
  loadDataset as loadSnapshot,
  loadValidation,
  saveDataset,
  saveValidation,
} from "@/lib/storage/idb";

export interface ValidationState {
  violations: Violation[];
  counts: { error: number; warning: number; info: number };
  byRow: Record<string, Violation[]>;
  validatedAt: string;
}

interface DatasetState {
  dataset: DatasetSnapshot | null;
  validation: ValidationState | null;
  loading: boolean;
  error: string | null;
  createDataset(parsed: ParsedSheet, kind: "vhsnd"): Promise<DatasetSnapshot>;
  load(id: string): Promise<void>;
  setValidation(v: ValidationState): Promise<void>;
  clearActive(): void;
  removeDataset(id: string): Promise<void>;
}

export const useDatasetStore = create<DatasetState>((set, get) => ({
  dataset: null,
  validation: null,
  loading: false,
  error: null,

  async createDataset(parsed, kind) {
    const schemaHash = await computeSchemaHash(SCHEMA_VERSION);
    const id = crypto.randomUUID();
    const snapshot: DatasetSnapshot = {
      id,
      kind,
      name: parsed.meta.fileName,
      source: parsed.meta,
      schemaVersion: SCHEMA_VERSION,
      schemaHash,
      totalRows: parsed.rows.length,
      rows: parsed.rows,
      skippedRows: parsed.skippedRows,
      presentColumns: parsed.presentColumns,
    };
    await saveDataset(snapshot);
    set({ dataset: snapshot, validation: null, error: null, loading: false });
    return snapshot;
  },

  async load(id) {
    set({ loading: true, error: null });
    try {
      const snapshot = await loadSnapshot(id);
      if (!snapshot) throw new Error("Dataset not found in local storage.");
      const cached = await loadValidation(id);
      set({
        dataset: snapshot,
        validation: cached ?? null,
        loading: false,
      });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  async setValidation(v) {
    const dataset = get().dataset;
    if (!dataset) return;
    set({ validation: v });
    await saveValidation(dataset.id, {
      violations: v.violations,
      counts: v.counts,
      byRow: v.byRow,
      validatedAt: v.validatedAt,
    });
  },

  clearActive() {
    set({ dataset: null, validation: null, error: null, loading: false });
  },

  async removeDataset(id) {
    await deleteDataset(id);
    await deleteValidation(id);
    if (get().dataset?.id === id) {
      set({ dataset: null, validation: null });
    }
  },
}));

export function selectDatasetSnapshot(s: { dataset: DatasetSnapshot | null }) {
  return s.dataset;
}