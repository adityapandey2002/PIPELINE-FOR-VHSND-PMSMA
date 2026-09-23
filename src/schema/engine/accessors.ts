import type { NormalizedRow, CellValue } from "@/contracts/dataset";
import { coerceBoolean, coerceDate, coerceInteger, coerceNumber, coerceText, coerceTime } from "./cellCoercers";

export function getRaw(row: NormalizedRow, code: string): CellValue | undefined {
  return row.values[code];
}

export function n(row: NormalizedRow, code: string): number | null {
  return coerceInteger(getRaw(row, code));
}

export function num(row: NormalizedRow, code: string): number | null {
  return coerceNumber(getRaw(row, code));
}

export function b(row: NormalizedRow, code: string): boolean | null {
  return coerceBoolean(getRaw(row, code));
}

export function d(row: NormalizedRow, code: string): string | null {
  return coerceDate(getRaw(row, code));
}

export function t(row: NormalizedRow, code: string): string | null {
  return coerceTime(getRaw(row, code));
}

export function s(row: NormalizedRow, code: string): string | null {
  return coerceText(getRaw(row, code));
}

export function isDefined(row: NormalizedRow, code: string): boolean {
  const v = getRaw(row, code);
  return v !== null && v !== undefined && String(v).trim() !== "";
}

/** A select-multiple group option is selected when its cell is truthy. */
export function groupSelected(row: NormalizedRow, root: string, suffix: string): boolean {
  return coerceBoolean(getRaw(row, `${root}_${suffix}`)) === true;
}

/** Any of the given option suffixes selected? */
export function groupAny(row: NormalizedRow, root: string, suffixes: string[]): boolean {
  return suffixes.some((sfx) => groupSelected(row, root, sfx));
}

export function groupOptionsSelected(row: NormalizedRow, root: string, options: { code: string }[]): string[] {
  return options.filter((o) => groupSelected(row, root, o.code)).map((o) => o.code);
}

/** True when a group has at least one selected "option" kind (not none/n/a). */
export function groupHasData(row: NormalizedRow, root: string, optionCodes: string[]): boolean {
  return optionCodes.some((sfx) => groupSelected(row, root, sfx));
}

/** Blind check: does the row carry any non-blank service data (H-block)? */
export function anyNonBlank(row: NormalizedRow, codes: string[]): boolean {
  return codes.some((c) => isDefined(row, c));
}

/** Compare two ISO day strings. Returns <0, 0, >0. */
export function cmpDay(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function fmtDay(v: string | null | undefined): string {
  return v ?? "(blank)";
}