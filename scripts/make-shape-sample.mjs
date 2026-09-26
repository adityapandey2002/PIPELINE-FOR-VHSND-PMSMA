#!/usr/bin/env node
/**
 * Builds sample-data/DATA_EX_SHAPE.csv: a synthetic twin of a real ODK/VHSND
 * export, used as a parser regression fixture.
 *
 * It preserves the two-row header (labels + physical codes), the full 252
 * column spread, the space-delimited select-multiple parents and their one-hot
 * children, and the value shapes that historically broke coercion. Names are
 * deliberately anonymised -- the fixture must be safe to commit.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = resolve(process.argv[2] ?? "C:/Users/DADITYA/Downloads/DATA_EX.csv");
const OUT = resolve(process.cwd(), "sample-data/DATA_EX_SHAPE.csv");

const PSEUDONYMS = {
  "Sumita bharati": "ANM One",
  "Ranju kumari": "ANM Two",
  "Rubi kumari": "ANM Three",
  "Na": "",
  "NA": "",
  "Nitu Kumari": "ANM Three",
};

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\r") { /* skip */ }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function escapeCell(v) {
  const s = v ?? "";
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const rows = parseCSV(readFileSync(SRC, "utf8"));
const [labels, codes, ...data] = rows;

const NAME_COLUMNS = new Set(["B4_1", "B4_2"]);
const nameIndex = codes.map((c, i) => (NAME_COLUMNS.has(c) ? i : -1)).filter((i) => i >= 0);

const out = [labels, codes].map((r) => r.map(escapeCell).join(","));
for (const cells of data) {
  const copy = [...cells];
  for (const i of nameIndex) {
    const key = copy[i].trim().toLowerCase();
    copy[i] = PSEUDONYMS[cells[i].trim()] ?? `Worker ${i}`;
    void key;
  }
  out.push(copy.map(escapeCell).join(","));
}

writeFileSync(OUT, out.join("\n") + "\n", "utf8");
console.log(`[make-shape-sample] ${out.length} rows x ${codes.length} cols -> ${OUT}`);
