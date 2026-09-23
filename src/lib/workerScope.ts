/** Minimal global this-view for dedicated workers, avoiding DOM lib clashes. */
export interface WorkerScope {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent) => void) | null;
}

export function workerScope(): WorkerScope {
  return globalThis as unknown as WorkerScope;
}