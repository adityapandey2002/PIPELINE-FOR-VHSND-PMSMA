import type { CellValue } from "@/contracts/dataset";
import type { RowResolution } from "@/contracts/resolution";
import { unresolvedErrors } from "@/lib/derive";
import type { IndicatorDef } from "@/contracts/indicator";
import { evaluateIndicator } from "@/schema/indicators";
import type { Violation } from "@/contracts/violation";

export interface AuditRecord {
  rowId: string;
  status: RowResolution["status"];
  keptViolations: string[] | undefined;
  justification: string | undefined;
  decidedAt: string | undefined;
}

export interface ReportContext {
  app: { name: string; schemaVersion: string };
  dataset: { name: string; fileName: string; totalRows: number; importedAt: string };
  summary: {
    keptRows: number;
    droppedRows: number;
    pendingRows: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
    unresolvedErrors: number;
  };
  indicators: { id: string; label: string; value: number }[];
  charts: { id: string; title: string; kind: string; blobKey: string | null }[];
  audit: AuditRecord[];
  generatedAt: string;
  manifest: string;
}

function canonicalString(obj: unknown, depth = 0): string {
  if (Array.isArray(obj)) return `[${obj.map((v) => canonicalString(v, depth + 1)).join(",")}]`;
  if (obj && typeof obj === "object") {
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalString((obj as Record<string, unknown>)[k], depth + 1)}`).join(",")}}`;
  }
  return JSON.stringify(obj);
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface BuildContextInput {
  datasetName: string;
  fileName: string;
  importedAt: string;
  totalRows: number;
  rows: Array<{ rowId: string; values: Record<string, CellValue> }>;
  resolutions: Record<string, RowResolution>;
  violations: Violation[];
  counts: { error: number; warning: number; info: number };
  indicatorDefs: IndicatorDef[];
  charts: { id: string; title: string; kind: string; blobKey: string | null }[];
  schemaVersion: string;
}

/** Build the deterministic report context, including a SHA-256 manifest. */
export async function buildReportContext(input: BuildContextInput): Promise<ReportContext> {
  const audit: AuditRecord[] = Object.values(input.resolutions)
    .filter((r) => r.status !== "pending")
    .map((r) => ({
      rowId: r.rowId,
      status: r.status,
      keptViolations: r.keptViolations,
      justification: r.justification,
      decidedAt: r.decidedAt,
    }))
    .sort((a, b) => (a.decidedAt ?? "").localeCompare(b.decidedAt ?? ""));

  const keptRows = input.rows.length;
  const droppedRows = Object.values(input.resolutions).filter((r) => r.status === "drop").length;
  const unresolvedList = unresolvedErrors(input.violations, input.resolutions);
  const unresolved = unresolvedList.length;
  const pendingRows = new Set(unresolvedList.map((v) => v.rowId)).size;

  const indicatorValues = input.indicatorDefs.map((def) => {
    const series = evaluateIndicator(input.rows, def);
    const value = series.points.length === 1 ? series.points[0].value : series.points.length;
    return { id: def.id, label: def.label, value: Math.round(value * 100) / 100 };
  });

  const generatedAt = new Date().toISOString();
  const base = {
    app: { name: "VHSND & PMSMA Survey Pipeline", schemaVersion: input.schemaVersion },
    dataset: {
      name: input.datasetName,
      fileName: input.fileName,
      totalRows: input.totalRows,
      importedAt: input.importedAt,
    },
    summary: {
      keptRows,
      droppedRows,
      pendingRows,
      errorCount: input.counts.error,
      warningCount: input.counts.warning,
      infoCount: input.counts.info,
      unresolvedErrors: unresolved,
    },
    indicators: indicatorValues,
    charts: input.charts,
    audit,
  };

  const manifestInput = {
    ...base,
    generatedAt,
    rowsHash: await sha256Hex(textEncoder().encode(canonicalString(input.rows.map((r) => r.values)))),
  };
  const manifest = await sha256Hex(textEncoder().encode(canonicalString(manifestInput)));

  return { ...base, generatedAt, manifest };
}

function textEncoder(): TextEncoder {
  return new TextEncoder();
}