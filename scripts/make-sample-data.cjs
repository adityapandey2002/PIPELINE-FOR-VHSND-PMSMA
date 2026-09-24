#!/usr/bin/env node
/**
 * Generates `sample-data/vhsnd-sample.xlsx`: a realistic but fully synthetic
 * VHSND supervision-form export with the official header codes, a seeded PRNG,
 * and a handful of deliberately contradictory rows so the Review step has
 * errors to demonstrate. Replace it with a real export any time.
 *
 * Usage: `node scripts/make-sample-data.cjs`
 */
import { readFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import XLSX from "xlsx";

const csvPath = resolve(process.cwd(), "data/vhsnd-columns.csv");
const outPath = resolve(process.cwd(), "sample-data/vhsnd-sample.xlsx");

function parseLine(line) {
  if (line.startsWith('"')) {
    let inQuotes = true;
    let i = 1;
    let label = "";
    while (i < line.length) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            label += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
        } else {
          label += ch;
        }
      } else {
        if (ch === ",") return [label, line.slice(i + 1).trim()];
        label += ch;
      }
      i += 1;
    }
    return [label, ""];
  }
  const idx = line.indexOf(",");
  if (idx === -1) return [line.trim(), ""];
  return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
}

// Deterministic PRNG (mulberry32).
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(20260714);
const chance = (p) => rng() < p;
const rint = (min, max) => Math.floor(rng() * (max - min + 1)) + min;

const FIXED = ["SubmissionDate", "starttime", "endtime"];
const codes = [];
for (const line of readFileSync(csvPath, "utf8").split(/\r?\n/).filter((l) => l.trim())) {
  const [, code] = parseLine(line);
  if (code && !FIXED.includes(code) && !codes.includes(code)) codes.push(code);
}

const HEADERS = [...FIXED, ...codes];
const N = 160;

function defaultRow() {
  const rec = {};
  for (const code of codes) {
    const base = code.split("_")[0];
    const suffix = code.includes("_") ? code.slice(code.indexOf("_") + 1) : "";
    if (code === "SubmissionDate" || code === "B8") {
      rec[code] = `2026-07-${String(rint(1, 25)).padStart(2, "0")}`;
    } else if (code === "starttime") {
      rec[code] = `${String(rint(8, 11)).padStart(2, "0")}:${String(rint(0, 59)).padStart(2, "0")}:00`;
    } else if (code === "endtime") {
      rec[code] = `${String(rint(11, 16)).padStart(2, "0")}:${String(rint(0, 59)).padStart(2, "0")}:00`;
    } else if (code === "New") {
      rec[code] = chance(0.6) ? 1 : 0;
    } else if (suffix === "SP") {
      rec[code] = chance(0.2) ? "Recognised community organisation" : "";
    } else if (suffix === "88" || suffix === "77") {
      rec[code] = chance(0.06) ? 1 : 0;
    } else if (suffix === "99") {
      rec[code] = chance(0.04) ? 1 : 0;
    } else if (suffix === "A") {
      // Option group members: only a handful selected per row.
      rec[code] = chance(0.22) ? 1 : 0;
    } else if (suffix) {
      rec[code] = chance(0.18) ? 1 : 0;
    } else if (base === "B2A") {
      rec[code] = rint(0, 9); // ANM code prefix
    } else {
      rec[code] = rint(0, 8); // Boolean fields tolerate 0/1; counts accept ints.
    }
  }
  return rec;
}

function set(rec, k, v) {
  rec[k] = v;
}
function unset(rec, k) {
  delete rec[k];
}

const ROWS = Array.from({ length: N }, () => defaultRow());
// A handful of deliberately broken rows so the Review step has real demo errors.
set(ROWS[4], "H1BP", 2); set(ROWS[4], "H1BP1", 5); // measured < identified
set(ROWS[6], "starttime", "09:30:00"); set(ROWS[6], "endtime", "08:00:00"); // end < start
set(ROWS[8], "C1", 0); set(ROWS[8], "H1BP", 3); unset(ROWS[8], "C3"); // not held, services + no reason
set(ROWS[10], "H18", 0); unset(ROWS[10], "H19"); // syringes not cut, no reason
set(ROWS[12], "H21", 1); // diluted vial used after period
set(ROWS[14], "B8", "2026-07-20"); set(ROWS[14], "SubmissionDate", "2026-07-01"); // visit after submission
unset(ROWS[16], "B8"); // missing required visit date
set(ROWS[18], "G2_A", 1); set(ROWS[18], "G2_99", 1); // none + other diluent
set(ROWS[20], "G1_SP", "Other community group"); // specify without Others option

const aoa = [HEADERS, ...ROWS.map((r) => HEADERS.map((h) => r[h] ?? null))];
const ws = XLSX.utils.aoa_to_sheet(aoa);
ws["!autofilter"] = { ref: `A1:${XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: HEADERS.length - 1 } })}` };
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Data");

mkdirSync(dirname(outPath), { recursive: true });
XLSX.writeFile(wb, outPath);
console.log(`[make-sample-data] Wrote ${N} synthetic rows (${codes.length} columns) -> ${outPath}`);
console.log("[make-sample-data] Broken demo rows at indices 4,6,8,10,12,14,16,18,20.");