#!/usr/bin/env node
const XLSX = require("xlsx");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/debug-raw.cjs <path-to-xlsx>");
  process.exit(1);
}

const wb = XLSX.readFile(file);
for (const sheetName of wb.SheetNames) {
  const sheet = wb.Sheets[sheetName];
  // Get raw AOA (array of arrays) to see exact first rows
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  console.log(`\n[sheet "${sheetName}"] ${aoa.length} total rows (incl header)`);
  console.log("Row 0 (headers):", JSON.stringify(aoa[0]));
  console.log("Row 1:", JSON.stringify(aoa[1]));
  console.log("Row 2:", JSON.stringify(aoa[2]));
  if (aoa.length > 3) console.log("Row 3:", JSON.stringify(aoa[3]));
}