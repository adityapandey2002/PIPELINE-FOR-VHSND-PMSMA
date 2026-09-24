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

function fuzzyKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Match known physical codes anywhere in a header (e.g. "8. B8", "Date of visit (B8)"). */
const CODE_TOKEN =
  /[A-Z]+\d+[A-Z0-9]*(?:_[A-Z0-9]+)*|\b(?:SubmissionDate|starttime|endtime|New)\b/gi;

const FUZZY_MIN_HEADER_WORDS = 3;
const FUZZY_MIN_SHARED_WORDS = 2;
const FUZZY_DICE_THRESHOLD = 0.6;

interface LabelCandidate {
  code: string;
  words: string[];
  wordSet: Set<string>;
}

function fuzzyLabelMatch(header: string, candidates: LabelCandidate[]): string | undefined {
  const headerWords = fuzzyKey(header).split(" ").filter(Boolean);
  if (headerWords.length < FUZZY_MIN_HEADER_WORDS) return undefined;
  const headerSet = new Set(headerWords);
  let best: LabelCandidate | undefined;
  let bestScore = -1;
  let ambiguous = false;
  for (const candidate of candidates) {
    let shared = 0;
    for (const w of headerWords) {
      if (candidate.wordSet.has(w)) shared += 1;
    }
    if (shared < FUZZY_MIN_SHARED_WORDS) continue;
    const headerInLabel = headerWords.every((w) => candidate.wordSet.has(w));
    const labelInHeader = candidate.words.every((w) => headerSet.has(w));
    const containment = headerInLabel || labelInHeader;
    const dice = (2 * shared) / (headerWords.length + candidate.words.length);
    if (!containment && dice < FUZZY_DICE_THRESHOLD) continue;
    const score = containment ? 1 + shared / (headerWords.length + candidate.words.length) : dice;
    if (score > bestScore + 1e-9) {
      bestScore = score;
      best = candidate;
      ambiguous = false;
    } else if (Math.abs(score - bestScore) <= 1e-9) {
      ambiguous = true;
    }
  }
  return best && !ambiguous ? best.code : undefined;
}

/** Build a header normalizer for the VHSND form. */
export function buildHeaderMap(): HeaderMap {
  const known = new Set<string>();
  const knownByUpper = new Map<string, string>();
  const aliasToCanonical = new Map<string, string>();
  const candidates: LabelCandidate[] = [];

  for (const col of VHSND_COLUMNS) {
    known.add(col.code);
    knownByUpper.set(col.code.toUpperCase(), col.code);
    const nk = normalizeKey(col.code);
    if (!aliasToCanonical.has(nk)) aliasToCanonical.set(nk, col.code);
    if (col.label && col.label.toLowerCase() !== col.code.toLowerCase()) {
      const nl = normalizeKey(col.label);
      if (!aliasToCanonical.has(nl)) aliasToCanonical.set(nl, col.code);
    }
    if (col.label) {
      const words = fuzzyKey(col.label).split(" ").filter(Boolean);
      if (words.length > 0) {
        candidates.push({ code: col.code, words, wordSet: new Set(words) });
      }
    }
  }

  function codeTokenIn(header: string): string | undefined {
    for (const m of header.matchAll(CODE_TOKEN)) {
      const hit = knownByUpper.get(m[0].toUpperCase());
      if (hit) return hit;
    }
    return undefined;
  }

  const memo = new Map<string, string>();

  function resolve(header: string): string {
    const exact = aliasToCanonical.get(normalizeKey(header));
    if (exact) return exact;
    const token = codeTokenIn(header);
    if (token) return token;
    const stripped = header.replace(/^\s*\d+[\s.)\-–—]*/, "").trim();
    if (stripped) {
      const viaLabel = aliasToCanonical.get(normalizeKey(stripped));
      if (viaLabel) return viaLabel;
    }
    const fuzzy = fuzzyLabelMatch(header, candidates);
    if (fuzzy) return fuzzy;
    return header;
  }

  return {
    knownColumns: known,
    canonicalToOriginal: {},
    normalize(header: string) {
      const cached = memo.get(header);
      if (cached !== undefined) return cached;
      const out = resolve(header);
      memo.set(header, out);
      return out;
    },
    label(code: string) {
      return columnLabel(code);
    },
  };
}

export function normalizeDistributionHeaders(headers: string[]): string[] {
  return headers.map(normalizeKey);
}
