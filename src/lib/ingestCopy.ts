import type { CollapseCause } from "@/schema/engine/normalize";

/**
 * The paragraph under the "could not be told apart" heading.
 *
 * `causes` are the causes present in the list below it, so the screen can say
 * whose doing the repeats actually are: some groups are the export repeating a
 * code it owns, others are our own title resolution landing two columns on one
 * field. Blaming the file for the second kind would be untrue.
 */
export function collapsedNotice(causes: readonly CollapseCause[]): string {
  const sheet = causes.includes("sheet-code");
  const derived = causes.includes("resolved-title");
  if (sheet && derived) {
    return "These columns reached one code two ways: some carry a code the file itself repeats, others were resolved onto the same field from their titles. Only the first column of each group was read. Re-export from the form with its row of column codes and every column will be kept.";
  }
  if (sheet) {
    return "This file carries the form's own row of column codes, and it repeats one code across several columns, so those columns cannot be told apart as separate fields. Only the first of each was read.";
  }
  if (derived) {
    return "These titles were resolved onto the same field, so the repeats cannot be told apart as separate columns. Only the first column of each was read. Re-export from the form with its row of column codes and every column will be kept.";
  }
  return "";
}
