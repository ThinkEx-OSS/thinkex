#!/usr/bin/env node
// Find the 10 saved runs where normalizeStrict is not idempotent and show
// the specific diff between run 1 and run 2.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeStrict } from "./lib-strict.mjs";
import { RUNS_DIR } from "./lib.mjs";

async function walk(dir) {
	const out = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const p = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...(await walk(p)));
		else if (entry.name.endsWith(".json")) out.push(p);
	}
	return out;
}

function firstDiff(a, b) {
	let i = 0;
	while (i < a.length && i < b.length && a[i] === b[i]) i++;
	const start = Math.max(0, i - 20);
	const end = Math.min(Math.max(a.length, b.length), i + 80);
	return { i, a: a.slice(start, end), b: b.slice(start, end) };
}

const files = await walk(RUNS_DIR);
let hits = 0;
for (const f of files) {
	const raw = JSON.parse(await readFile(f, "utf8"));
	const once = normalizeStrict(raw.text);
	const twice = normalizeStrict(once);
	if (once !== twice) {
		hits++;
		const d = firstDiff(once, twice);
		console.log(`\n${f.split("math-eval-runs/")[1]}  (diff at char ${d.i})`);
		console.log(`  once:  ${JSON.stringify(d.a.slice(0, 120))}`);
		console.log(`  twice: ${JSON.stringify(d.b.slice(0, 120))}`);
		if (hits >= 6) break;
	}
}
console.log(`\ntotal violations: ${hits}`);
