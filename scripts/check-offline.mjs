#!/usr/bin/env node
/**
 * Offline build gate.
 * Fails the build if any emitted static JS references a network URL in a
 * way that could exfiltrate data (fetch/WebSocket to https:// hosts).
 * This is a cheap, diff-able guarantee that the artifact cannot phone home.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const OUT = "out";

if (!exists(OUT)) {
  console.error("[check-offline] Missing build output. Run `npm run build` first.");
  process.exit(1);
}

const remoteCall = /(?:fetch|WebSocket|EventSource|XMLHttpRequest)\(\s*["'`](https?:\/\/[^"'`]+)/g;
const scriptSrc = /(?:src|href)=["'](https?:\/\/)/g;
let violations = [];

for (const file of walk(OUT)) {
  if (!/\.(js|html)$/.test(file)) continue;
  const text = readFileSync(file, "utf8");
  const body = extname(file) === ".html" ? text : text.slice(0, 400_000);
  for (const m of body.matchAll(remoteCall)) violations.push(`${file}: ${m[0].slice(0, 120)}`);
  for (const m of body.matchAll(scriptSrc)) violations.push(`${file}: ${m[0].slice(0, 120)}`);
}

for (const v of violations.slice(0, 20)) console.error(`[check-offline] ${v}`);
if (violations.length > 0) {
  console.error(`[check-offline] ${violations.length} network reference(s) found. Refusing to ship.`);
  process.exit(1);
}
console.log("[check-offline] OK - no remote references in static export.");

function exists(p) {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    // `next dev` writes scratch chunks to out/dev. They are gitignored and
    // never part of the static export, and they link to dev-only tooling, so
    // they must not be able to fail the shipping gate.
    if (dir === OUT && entry === "dev") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}