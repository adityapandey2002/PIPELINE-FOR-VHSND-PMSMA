import type { NormalizedRow } from "@/contracts/dataset";
import type { Violation } from "@/contracts/violation";
import type { ParsedSheet } from "@/schema/engine/normalize";
import type { ParseRequest, ParseResponse } from "@/workers/parseWorker";
import type { ValidateRequest, ValidateResponse } from "@/workers/validateWorker";

export interface ParseTask {
  buffer: ArrayBuffer;
  fileName: string;
  sheetName?: string;
  sizeBytes: number;
  importedAt: string;
}

export interface ValidateTask {
  rows: NormalizedRow[];
  schemaVersion: string;
  refDate?: string | null;
}

export class WorkerUnavailableError extends Error {
  constructor(cause?: unknown) {
    super(
      "Web Workers are not available in this environment; running the pipeline on the main thread (larger files may feel slower).",
      { cause },
    );
  }
}

/** Returns true when a real Worker could be created for the given URL. */
function canUseWorker(url: URL, type: "module"): boolean {
  try {
    const w = new Worker(url.href, { type });
    w.terminate();
    return true;
  } catch {
    return false;
  }
}

/** Parse a workbook (SheetJS) — off the main thread when possible. */
export function runParse(task: ParseTask, onProgress?: (phase: string) => void): Promise<ParsedSheet> {
  onProgress?.("starting");
  return new Promise((resolve, reject) => {
    let worker: Worker | null = null;
    try {
      const url = new URL("../workers/parseWorker.ts", import.meta.url);
      if (canUseWorker(url, "module")) {
        worker = new Worker(url as unknown as string, { type: "module" });
      }
    } catch {
      worker = null;
    }

    if (worker) {
      onProgress?.("parsing");
      const timer = setTimeout(() => reject(new Error("Parse timed out.")), 120_000);
      worker.onmessage = (event: MessageEvent<ParseResponse>) => {
        const msg = event.data;
        if (msg.ok) {
          clearTimeout(timer);
          onProgress?.("done");
          resolve(msg.data);
        } else {
          clearTimeout(timer);
          reject(new Error(msg.error));
        }
        worker?.terminate();
      };
      worker.onerror = (ev) => {
        clearTimeout(timer);
        reject(new Error(`Parse worker error: ${ev.message}`));
        worker?.terminate();
      };
      const payload: ParseRequest["payload"] = {
        buffer: task.buffer,
        fileName: task.fileName,
        sheetName: task.sheetName,
        sizeBytes: task.sizeBytes,
        importedAt: task.importedAt,
      };
      worker.postMessage({ type: "parse", payload }, [task.buffer]);
    } else {
      // Fallback: run the pure pipeline inline.
      if (typeof window === "undefined") {
        // In Node tests/dev we have no Worker module context; caller can
        // import parsePayload directly. Reject with a clear signal.
        reject(new WorkerUnavailableError());
        return;
      }
      import("@/workers/parseWorker")
        .then(({ parsePayload }) => {
          onProgress?.("parsing");
          return parsePayload({
            buffer: task.buffer,
            fileName: task.fileName,
            sheetName: task.sheetName,
            sizeBytes: task.sizeBytes,
            importedAt: task.importedAt,
          });
        })
        .then((data) => {
          onProgress?.("done");
          resolve(data);
        })
        .catch((err) => reject(err));
    }
  });
}

/** Validate rows with the contradiction engine — off the main thread when possible. */
export function runValidate(task: ValidateTask, onProgress?: (phase: string) => void): Promise<{
  violations: Violation[];
  counts: { error: number; warning: number; info: number };
  byRow: Record<string, Violation[]>;
}> {
  onProgress?.("starting");
  return new Promise((resolve, reject) => {
    let worker: Worker | null = null;
    try {
      const url = new URL("../workers/validateWorker.ts", import.meta.url);
      if (canUseWorker(url, "module")) worker = new Worker(url as unknown as string, { type: "module" });
    } catch {
      worker = null;
    }

    if (worker) {
      onProgress?.("validating");
      const timer = setTimeout(() => reject(new Error("Validation timed out.")), 120_000);
      worker.onmessage = (event: MessageEvent<ValidateResponse>) => {
        const msg = event.data;
        if (msg.ok) {
          clearTimeout(timer);
          onProgress?.("done");
          resolve(msg);
        } else {
          clearTimeout(timer);
          reject(new Error(msg.error));
        }
        worker?.terminate();
      };
      worker.onerror = (ev) => {
        clearTimeout(timer);
        reject(new Error(`Validate worker error: ${ev.message}`));
        worker?.terminate();
      };
      const payload: ValidateRequest["payload"] = {
        rows: task.rows,
        schemaVersion: task.schemaVersion,
        refDate: task.refDate ?? undefined,
      };
      worker.postMessage({ type: "validate", payload });
    } else {
      if (typeof window === "undefined") {
        reject(new WorkerUnavailableError());
        return;
      }
      import("@/workers/validateWorker")
        .then(({ validatePayload }) =>
          validatePayload({
            rows: task.rows,
            schemaVersion: task.schemaVersion,
            refDate: task.refDate ?? undefined,
          }),
        )
        .then(({ violations, counts, byRow }) => {
          const plain: Record<string, Violation[]> = {};
          for (const [k, v] of byRow) plain[k] = v;
          onProgress?.("done");
          resolve({ violations, counts, byRow: plain });
        })
        .catch((err) => reject(err));
    }
  });
}