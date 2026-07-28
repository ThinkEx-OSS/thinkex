#!/usr/bin/env node
// Sanity check: does the normalizer touch outputs it shouldn't? For every
// saved run, compare normalize(text) to text — count how many bytes changed
// and confirm changes only happen when \( or \[ was actually present.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { normalize, RUNS_DIR } from "./lib.mjs";

async function walk(dir) {
	const out = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const p = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...(await walk(p)));
		else if (entry.name.endsWith(".json")) out.push(p);
	}
	return out;
}

async function main() {
	const files = await walk(RUNS_DIR);
	let unchanged = 0;
	let changedAndHadBackslash = 0;
	let changedButNoBackslash = 0;
	const suspects = [];
	for (const f of files) {
		const raw = JSON.parse(await readFile(f, "utf8"));
		const before = raw.text;
		const after = normalize(before);
		const hadBackslashDelim = /\\\(|\\\[/.test(before);
		if (before === after) unchanged++;
		else if (hadBackslashDelim) changedAndHadBackslash++;
		else {
			changedButNoBackslash++;
			suspects.push(f);
		}
	}
	console.log(`\nNormalizer idempotence — ${files.length} runs\n`);
	console.log(`unchanged (safe):                     ${unchanged}`);
	console.log(`changed, backslash present (expected): ${changedAndHadBackslash}`);
	console.log(`changed, NO backslash (BAD):           ${changedButNoBackslash}`);
	if (suspects.length) {
		console.log(`\nFalse positives:`);
		for (const s of suspects) console.log(`  ${s}`);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
