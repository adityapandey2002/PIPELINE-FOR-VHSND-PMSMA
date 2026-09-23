import type { CellValue } from "@/contracts/dataset";
import type { CleanRow } from "@/contracts/resolution";
import { columnLabel } from "@/schema/columns-vhsnd";

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function formatCell(v: CellValue | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "boolean") return v ? "1" : "0";
  return String(v);
}

/** Clean rows as CSV. Header shows the human label plus the physical code. */
export function cleanRowsToCsv(rows: CleanRow[], includeCodes = true): string {
  if (rows.length === 0) return "";
  const columns = new Set<string>();
  for (const row of rows) for (const code of Object.keys(row.values)) columns.add(code);
  const ordered = [...columns].sort();
  const header = ordered.map((code) =>
    includeCodes ? `${csvEscape(columnLabel(code))} (${code})` : csvEscape(columnLabel(code)),
  );
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(ordered.map((code) => csvEscape(formatCell(row.values[code]))).join(","));
  }
  return lines.join("\r\n");
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}