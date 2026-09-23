import { VHSND_COLUMNS, columnLabel } from "@/schema/columns-vhsnd";

/** Canonical header resolution + display label lookup. */
export interface HeaderMap {
  /** canonicalCode -> original header (for value re-keying). */
  canonicalToOriginal: Record<string, string>;
  /** original header -> canonical code (or the original if unknown). */
  normalize: (header: string) => string;
  /** canonical/source code -> display label. */
  label: (code: string) => string;
  knownColumns: Set<string>;
}

function normalizeKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[–—]/g, "-");
}

/** Build a header normalizer for the VHSND form. */
export function buildHeaderMap(): HeaderMap {
  const known = new Set<string>();
  const aliasToCanonical = new Map<string, string>();

  for (const col of VHSND_COLUMNS) {
    known.add(col.code);
    const nk = normalizeKey(col.code);
    if (!aliasToCanonical.has(nk)) aliasToCanonical.set(nk, col.code);
    if (col.label && col.label.toLowerCase() !== col.code.toLowerCase()) {
      const nl = normalizeKey(col.label);
      if (!aliasToCanonical.has(nl)) aliasToCanonical.set(nl, col.code);
    }
  }

  return {
    knownColumns: known,
    canonicalToOriginal: {},
    normalize(header: string) {
      return aliasToCanonical.get(normalizeKey(header)) ?? header;
    },
    label(code: string) {
      return columnLabel(code);
    },
  };
}

export function normalizeDistributionHeaders(headers: string[]): string[] {
  return headers.map(normalizeKey);
}