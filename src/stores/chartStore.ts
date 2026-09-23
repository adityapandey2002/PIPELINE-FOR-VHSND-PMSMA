import { create } from "zustand";
import type { SavedChart, ChartConfig } from "@/contracts/chart";
import { deleteChart, loadChartMetas, saveChartBlob, saveChartMeta } from "@/lib/storage/idb";

interface ChartState {
  charts: SavedChart[];
  loadedFor: string | null;
  load(datasetId: string): Promise<void>;
  addChart(
    datasetId: string,
    config: ChartConfig,
    image?: { blob: Blob; width: number; height: number },
  ): Promise<SavedChart>;
  removeChart(id: string): Promise<void>;
  clear(): void;
}

export const useChartStore = create<ChartState>((set, get) => ({
  charts: [],
  loadedFor: null,

  async load(datasetId) {
    if (get().loadedFor === datasetId) return;
    const metas = await loadChartMetas(datasetId);
    const charts: SavedChart[] = metas.map((m) => ({
      id: m.id,
      datasetId: m.datasetId,
      kind: m.kind as SavedChart["kind"],
      indicatorId: m.indicatorId,
      title: m.title,
      createdAt: m.createdAt,
      config: m.config as ChartConfig,
      image: m.image,
    }));
    set({ charts, loadedFor: datasetId });
  },

  async addChart(datasetId, config, image) {
    const id = crypto.randomUUID();
    const chart: SavedChart = {
      id,
      datasetId,
      kind: config.kind,
      indicatorId: config.indicatorId,
      title: config.title,
      createdAt: new Date().toISOString(),
      config,
    };
    if (image) {
      const blobKey = `${datasetId}/${id}.png`;
      await saveChartBlob(blobKey, image.blob);
      chart.image = { width: image.width, height: image.height, blobKey };
    }
    await saveChartMeta({
      id,
      datasetId,
      kind: chart.kind,
      indicatorId: chart.indicatorId,
      title: chart.title,
      createdAt: chart.createdAt,
      config,
      image: chart.image,
    });
    set({ charts: [...get().charts, chart] });
    return chart;
  },

  async removeChart(id) {
    await deleteChart(id);
    set({ charts: get().charts.filter((c) => c.id !== id) });
  },

  clear() {
    set({ charts: [], loadedFor: null });
  },
}));