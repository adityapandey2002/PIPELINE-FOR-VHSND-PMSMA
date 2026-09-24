#!/usr/bin/env node
/**
 * Prints a short diagnostic summary of a VHSND export workbook: sheets,
 * recognized header codes vs unknown headers, and raw samples of the critical
 * columns (B8, starttime, endtime, SubmissionDate, C1) from the first rows.
 *
 * Usage: `node scripts/diagnose-workbook.cjs "path\to\workbook.xlsx"`
 */
import XLSX from "xlsx";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage: node scripts/diagnose-workbook.cjs <path-to-xlsx>");
  process.exit(1);
}

const KNOWN = new Set(
  readFileSync(resolve(process.cwd(), "data/vhsnd-columns.csv"), "utf8")
    .split(/\r?\n/)
    .map((l) => l.split(",").pop().trim())
    .filter((c) => c && c !== "code"),
);

const WATCH = ["B8", "starttime", "endtime", "SubmissionDate", "C1", "H1BP", "New"];

for (const file of files) {
  console.log(`\n==== ${file} ====`);
  const wb = XLSX.readFile(file);
  console.log(`Sheets: ${wb.SheetNames.join(", ")}`);
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
    console.log(`\n[sheet "${sheetName}"] ${rows.length} data rows`);
    if (rows.length === 0) continue;
    const headers = Object.keys(rows[0]);
    const knownHits = headers.filter((h) => KNOWN.has(h));
    const knownByLabel = headers.filter(
      (h) => h && !KNOWN.has(h) && [...KNOWN].some((k) => k.toLowerCase() === h.toLowerCase()),
    );
    console.log(`Headers: ${headers.length} | known codes: ${knownHits.length} | case-diff matches: ${knownByLabel.length}`);
    const unknown = headers.filter((h) => !KNOWN.has(h) && !knownByLabel.includes(h));
    if (unknown.length > 0) console.log(`Unrecognized headers: ${JSON.stringify(unknown.slice(0, 40))}`);
    for (const h of WATCH) {
      const actual = knownHits.includes(h) ? h : knownByLabel.find((x) => x.toLowerCase() === h.toLowerCase());
      if (!actual) continue;
      const sample = rows.slice(0, 5).map((r) => r[actual]);
      console.log(`  ${h} -> header "${actual}" | samples: ${JSON.stringify(sample)}`);
    }
  }
}
console.log("\nDone.");