import { VHSND_COLUMNS } from "@/schema/columns-vhsnd";

/**
 * Logical group roots in the VHSND form. A group's physical columns are
 * `{root}_{suffix}`.
 *
 * `C10_1` is itself a group nested alongside `C10`, so a naive
 * `startsWith("C10_")` test wrongly claims `C10_1_A` is an option of `C10`.
 * Every caller resolves children through this module instead.
 */
export const VHSND_GROUP_ROOTS: readonly string[] = [
  "C4",
  "C10",
  "C10_1",
  "C11_1",
  "E3",
  "G1",
  "G12",
  "G2",
  "G3",
  "H1",
  "H2",
  "H3",
  "H32",
  "H4",
];

/**
 * Group roots nested directly beneath `root`, expressed as paths relative to
 * it. For `C10` this is `["1"]`, derived from the `C10_1` root -- so the
 * columns `C10_1` and `C10_1_A` are recognisable as belonging to `C10_1`
 * rather than to `C10`.
 */
function nestedPathsUnder(root: string): string[] {
  return VHSND_GROUP_ROOTS.filter((other) => other.startsWith(`${root}_`)).map(
    (other) => other.slice(root.length + 1),
  );
}

function isNestedGroupPath(suffix: string, root: string): boolean {
  return nestedPathsUnder(root).some(
    (p) => p !== "" && (suffix === p || suffix.startsWith(`${p}_`)),
  );
}

/** True when `code` is a direct physical column of the group `root`. */
export function isDirectChildOf(root: string, code: string): boolean {
  if (!code.startsWith(`${root}_`)) return false;
  const suffix = code.slice(root.length + 1);
  return suffix !== "" && !isNestedGroupPath(suffix, root);
}

/** Direct option suffixes of a group, e.g. `["A", "B", "99"]` for `C10`. */
export function directChildSuffixes(root: string): string[] {
  const seen = new Set<string>();
  for (const col of VHSND_COLUMNS) {
    if (!isDirectChildOf(root, col.code)) continue;
    seen.add(col.code.slice(root.length + 1));
  }
  return [...seen];
}
