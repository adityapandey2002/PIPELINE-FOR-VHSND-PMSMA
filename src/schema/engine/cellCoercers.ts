import type { CellValue } from "@/contracts/dataset";
import type { SentinelMeaning } from "@/schema/dsl";

const EXCEL_EPOCH_OFFSET_DAYS = 25569; // days between 1899-12-30 and 1970-01-01

/**
 * Raw tokens that mean "no answer" in ODK/Excel exports. `Na` is Excel's
 * rendering of a formula error, and NHM forms use it as a "not applicable"
 * filler. Treated as missing so they never satisfy a "must be present" check.
 * Deliberately excludes bare dashes, which appear in legitimate free text.
 */
const MISSING_TOKENS = new Set([
  "na",
  "n/a",
  "nan",
  "na.",
  "nil",
  "not applicable",
  "not available",
  "none given",
]);

/** True when a raw cell means "no answer recorded" rather than a real value. */
export function isMissingToken(v: CellValue | undefined): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return MISSING_TOKENS.has(v.trim().toLowerCase());
  return false;
}

/** Tolerant boolean coercion: yes/no, y/n, 1/0, true/false, ticked. */
export function coerceBoolean(v: CellValue | undefined): boolean | null {
  if (isMissingToken(v)) return null;
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

/**
 * Ordered-scale coercion. Returns the integer even when it is outside the
 * declared scale so the validator can report it instead of losing it.
 */
export function coerceOrdinal(v: CellValue | undefined): number | null {
  if (isMissingToken(v)) return null;
  return coerceInteger(v);
}

/**
 * Numeric coercion that reads a declared sentinel the way the schema says.
 *
 * A `no-data` sentinel (e.g. 99 for "question not applicable") becomes null so
 * it never reaches a sum or a range check. A `zero` sentinel means the question
 * was applicable but there is nothing to record, so it becomes a real 0 and
 * stays in the totals.
 */
export function coerceSentinelNumber(
  v: CellValue | undefined,
  sentinels: (string | number)[] | undefined,
  meaning: SentinelMeaning = "no-data",
): number | null {
  if (isMissingToken(v)) return null;
  const parsed = coerceNumber(v);
  if (parsed !== null && sentinels?.some((s) => typeof s === "number" && s === parsed)) {
    return meaning === "zero" ? 0 : null;
  }
  return parsed;
}

export function coerceInteger(v: CellValue | undefined): number | null {
  if (isMissingToken(v)) return null;
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
  if (isMissingToken(v)) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = String(v).replace(/[,\s\u00a0]/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * A raw cell as it arrives from the sheet. `xlsx` is read with
 * `cellDates: true`, so date/time cells can surface as real `Date` objects
 * even though stored values are always primitives.
 */
export type RawCell = CellValue | Date | undefined;

/**
 * Date coercion producing a day-only UTC "YYYY-MM-DD" string.
 * Excel serial numbers are converted via the 1900 epoch. JS Date inputs are
 * normalized to their UTC calendar day to avoid timezone shifts.
 */
export function coerceDate(v: RawCell): string | null {
  if (v === null || v === undefined || isMissingToken(v as CellValue)) return null;
  const ms = valueToEpochMs(v);
  if (ms === null) return null;
  const d = new Date(ms);
  return d.toISOString().slice(0, 10);
}

function valueToEpochMs(v: RawCell): number | null {
  if (typeof v === "number") {
    // Excel serial date
    return Math.round((v - EXCEL_EPOCH_OFFSET_DAYS) * 86400 * 1000);
  }
  if (v instanceof Date) return v.getTime();
  const t = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    // ISO date-only: parse as UTC to avoid local-timezone day shifts.
    const [y, m, d] = t.split("-").map(Number);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return Date.UTC(y, m - 1, d);
  }
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(t)) {
    const datePart = t.slice(0, 10);
    const [y, m, d] = datePart.split("-").map(Number);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return Date.UTC(y, m - 1, d);
  }
  // Day-first/numeric text like "18/06/2026", "18.06.2026", "18-06-26"
  // (the convention used by the NHM forms this pipeline ingests).
  const dm = /^(\d{1,2})[/. -](\d{1,2})[/. -](\d{2,4})$/.exec(t);
  if (dm) {
    let d = Number(dm[1]);
    let m = Number(dm[2]);
    const yRaw = dm[3];
    const y =
      yRaw.length === 2
        ? Number(yRaw) >= 70
          ? 1900 + Number(yRaw)
          : 2000 + Number(yRaw)
        : Number(yRaw);
    if (d > 12) {
      // day-first
    } else if (m > 12) {
      // month-first (unambiguous)
      const tmp = d;
      d = m;
      m = tmp;
    }
    // Both tokens ambiguous: keep day-first, the region's convention.
    if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2400) return null;
    return Date.UTC(y, m - 1, d);
  }
  const ep = Date.parse(t);
  if (!Number.isNaN(ep)) {
    const d = new Date(ep);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  }
  return null;
}

/**
 * Time coercion: normalize to "HH:MM:SS".
 *
 * Accepts bare "HH:MM[:SS]", Excel fractions of a day, and full datetimes that
 * carry a 12-hour clock. The AM/PM marker is applied before the range check so
 * "1:32:33 PM" becomes 13:32:33 rather than 01:32:33 -- without this, every
 * afternoon session compares as ending before it started.
 *
 * A `Date` cell is read in UTC, matching `coerceDate`. `xlsx` builds these
 * Dates from the Excel serial anchored at midnight UTC, so reading the clock in
 * local time would disagree with the date read from the very same cell.
 */
export function coerceTime(v: RawCell): string | null {
  if (v === null || v === undefined || isMissingToken(v as CellValue)) return null;
  if (v instanceof Date) {
    return [v.getUTCHours(), v.getUTCMinutes(), v.getUTCSeconds()].map(pad2).join(":");
  }
  if (typeof v === "number") {
    let h: number;
    let m: number;
    let s: number;
    if (v > 0 && v < 1) {
      // Excel time cell: fraction of a day.
      const totalSec = Math.round(v * 86400);
      h = Math.floor(totalSec / 3600);
      m = Math.floor((totalSec % 3600) / 60);
      s = totalSec % 60;
    } else {
      // Seconds (or milliseconds) since midnight.
      const sec = v > 86400 && v < 86400 * 1000 ? Math.floor(v / 1000) : Math.floor(v);
      h = Math.floor(sec / 3600);
      m = Math.floor((sec % 3600) / 60);
      s = sec % 60;
    }
    if (h > 23 || m > 59 || s > 59) return null;
    return [h, m, s].map(pad2).join(":");
  }

  const raw = String(v).trim();
  const ampm = raw.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp])\.?\s*[Mm]\.?/);
  if (ampm) {
    let h = Number(ampm[1]);
    const mm = Number(ampm[2]);
    const ss = ampm[3] ? Number(ampm[3]) : 0;
    if (h < 1 || h > 12 || mm > 59 || ss > 59) return null;
    if (h === 12) h = 0;
    if (ampm[4].toLowerCase() === "p") h += 12;
    return [h, mm, ss].map(pad2).join(":");
  }

  const m = raw.match(/(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  const ss = m[3] ? Number(m[3]) : 0;
  if (h > 23 || mm > 59 || ss > 59) return null;
  return [h, mm, ss].map(pad2).join(":");
}

/** Minutes since midnight for a "HH:MM:SS" string, or null when unparseable. */
export function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number(m[3]) / 60 : 0);
}

/**
 * Free-text coercion. Only a genuinely empty cell is missing here.
 *
 * The "no answer" token list is deliberately NOT applied: in a name, a
 * designation or a remarks box, "NA" is text somebody typed, and blanking it
 * would silently destroy real content.
 */
export function coerceText(v: CellValue | undefined): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() || null;
  return String(v).trim() || null;
}

/**
 * Coded free text, where the form's "no answer" tokens are export artifacts
 * rather than content. Used for short coded answers and closed choice sets.
 */
export function coerceCodedText(v: CellValue | undefined): string | null {
  if (isMissingToken(v)) return null;
  return coerceText(v);
}

/** Coercion for a closed set of answers. */
export function coerceChoiceText(v: CellValue | undefined): string | null {
  return coerceCodedText(v);
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