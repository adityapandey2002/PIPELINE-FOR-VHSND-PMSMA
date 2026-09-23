import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createEncryptedStorage } from "@/lib/storage/idb";

interface WorkflowState {
  activeDatasetId: string | null;
  hydrated: boolean;
  setActiveDatasetId(id: string | null): void;
  markHydrated(): void;
  resetSession(): void;
}

export const useWorkflowStore = create<WorkflowState>()(
  persist(
    (set) => ({
      activeDatasetId: null,
      hydrated: false,
      setActiveDatasetId: (id) => set({ activeDatasetId: id }),
      markHydrated: () => set({ hydrated: true }),
      resetSession: () => set({ activeDatasetId: null }),
    }),
    {
      name: "workflow",
      storage: createJSONStorage(() => createEncryptedStorage()),
      onRehydrateStorage: () => (state) => {
        state?.markHydrated();
      },
    },
  ),
);

export function useAppHydrated(): boolean {
  return useWorkflowStore((s) => s.hydrated);
}