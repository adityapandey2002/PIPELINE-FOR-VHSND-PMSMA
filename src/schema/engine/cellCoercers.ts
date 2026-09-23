import type { CellValue } from "@/contracts/dataset";

const EXCEL_EPOCH_OFFSET_DAYS = 25569; // days between 1899-12-30 and 1970-01-01

/** Tolerant boolean coercion: yes/no, y/n, 1/0, true/false, ticked. */
export function coerceBoolean(v: CellValue | undefined): boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") {
    if (v === 1) return true;
    if (v === 0) return false;
    return null;
  }
  const t = String(v).trim().toLowerCase();
  if (["1", "true", "yes", "y", "ticked", "tick", "checked", "✓", "x"].includes(t)) return true;
  if (["0", "false", "no", "n", "not", "blank", ""].includes(t)) return false;
  return null;
}

export function coerceInteger(v: CellValue | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  let n: number;
  if (typeof v === "number") {
    n = v;
  } else {
    const t = String(v).replace(/[,\s\u00a0]/g, "").replace(/\.0+$/, "");
    if (!/^-?\d+$/.test(t) && !/^-?\d+\.\d+$/.test(t)) return null;
    n = Number(t);
  }
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

export function coerceNumber(v: CellValue | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = String(v).replace(/[,\s\u00a0]/g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Date coercion producing a day-only UTC "YYYY-MM-DD" string.
 * Excel serial numbers are converted via the 1900 epoch. JS Date inputs are
 * normalized to their UTC calendar day to avoid timezone shifts.
 */
export function coerceDate(v: CellValue | undefined): string | null {
  if (v === null || v === undefined || v === "") return null;
  const ms = valueToEpochMs(v);
  if (ms === null) return null;
  const d = new Date(ms);
  return d.toISOString().slice(0, 10);
}

function valueToEpochMs(v: CellValue | Date): number | null {
  if (typeof v === "number") {
    // Excel serial date
    return Math.round((v - EXCEL_EPOCH_OFFSET_DAYS) * 86400 * 1000);
  }
  if (v instanceof Date) return v.getTime();
  const t = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    // ISO date-only: parse as UTC to avoid local-timezone day shifts.
    const [y, m, d] = t.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  }
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(t)) {
    const datePart = t.slice(0, 10);
    const [y, m, d] = datePart.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  }
  const ep = Date.parse(t);
  if (!Number.isNaN(ep)) {
    const d = new Date(ep);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  }
  return null;
}

/** Time coercion: normalize "HH:MM[:SS...]" to "HH:MM:SS". */
export function coerceTime(v: CellValue | undefined): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") {
    // Seconds (or milliseconds) since midnight.
    const sec =
      v > 86400 && v < 86400 * 1000 ? Math.floor(v / 1000) : Math.floor(v);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 23) return null;
    return [h, m, s].map(pad2).join(":");
  }
  const m = String(v)
    .trim()
    .match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  const ss = m[3] ? Number(m[3]) : 0;
  if (h > 23 || mm > 59 || ss > 59) return null;
  return [h, mm, ss].map(pad2).join(":");
}

export function coerceText(v: CellValue | undefined): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string") return v.trim() || null;
  return String(v).trim() || null;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/* ----------------------- Excel serial <-> date utils ----------------------- */

export function excelSerialToIso(serial: number): string | null {
  const ms = Math.round((serial - EXCEL_EPOCH_OFFSET_DAYS) * 86400 * 1000);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}