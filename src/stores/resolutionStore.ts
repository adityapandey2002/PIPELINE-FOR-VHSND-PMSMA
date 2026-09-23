import { create } from "zustand";
import type { RowResolution } from "@/contracts/resolution";
import { loadResolutions, saveResolutions } from "@/lib/storage/idb";

interface ResolutionState {
  byRow: Record<string, RowResolution>;
  hydratedFor: string | null;
  load(datasetId: string): Promise<void>;
  setResolution(datasetId: string, rowId: string, resolution: RowResolution): Promise<void>;
  clear(): void;
}

export const useResolutionStore = create<ResolutionState>((set, get) => ({
  byRow: {},
  hydratedFor: null,

  async load(datasetId) {
    if (get().hydratedFor === datasetId) return;
    const byRow = await loadResolutions(datasetId);
    set({ byRow, hydratedFor: datasetId });
  },

  async setResolution(datasetId, rowId, resolution) {
    const next = { ...get().byRow, [rowId]: resolution };
    set({ byRow: next });
    await saveResolutions(datasetId, next);
  },

  clear() {
    set({ byRow: {}, hydratedFor: null });
  },
}));