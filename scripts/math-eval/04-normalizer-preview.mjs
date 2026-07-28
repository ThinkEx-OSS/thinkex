#!/usr/bin/env node
// Post-process every saved run through the normalizer and report:
// - How many outputs contained backslash drift
// - How many the normalizer fixed
// - How many still have backslash drift (i.e. mismatched pairs, code-fence edge cases)
// - Whether normalization changed anything inside fenced code blocks
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { analyze, normalize, RUNS_DIR } from "./lib.mjs";

async function walk(dir) {
	const out = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const p = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...(await walk(p)));
		else if (entry.name.endsWith(".json")) out.push(p);
	}
	return out;
}

function fencedContent(text) {
	return [...text.matchAll(/```[\s\S]*?```/g)].map((m) => m[0]).join("\n");
}

async function main() {
	const files = await walk(RUNS_DIR);
	console.log(`\nNormalizer preview across ${files.length} saved runs\n`);
	let hadDrift = 0;
	let fullyFixed = 0;
	let stillDrifting = 0;
	let fenceCorrupted = 0;
	let cleanUntouched = 0;
	const stubborn = [];
	for (const f of files) {
		const raw = JSON.parse(await readFile(f, "utf8"));
		const before = analyze(raw.text); // ignore saved analysis; may be buggy
		const beforeBs = before.backslashInline + before.backslashBlock;
		const normalized = normalize(raw.text);
		const after = analyze(normalized);
		const afterBs = after.backslashInline + after.backslashBlock;
		const fbBefore = fencedContent(raw.text);
		const fbAfter = fencedContent(normalized);
		const fenceIntact = fbBefore === fbAfter;
		if (!fenceIntact) fenceCorrupted++;
		if (beforeBs === 0 && afterBs === 0) cleanUntouched++;
		if (beforeBs > 0) {
			hadDrift++;
			if (afterBs === 0) fullyFixed++;
			else {
				stillDrifting++;
				stubborn.push({ file: f, beforeBs, afterBs });
			}
		}
	}
	console.log(`clean, no rewrite needed:        ${cleanUntouched}`);
	console.log(`had backslash drift:             ${hadDrift}`);
	console.log(`  → fixed by normalizer:         ${fullyFixed}  (${Math.round((100 * fullyFixed) / (hadDrift || 1))}%)`);
	console.log(`  → still drifting after fix:    ${stillDrifting}`);
	console.log(`fence content changed (BAD):     ${fenceCorrupted}`);
	if (stubborn.length) {
		console.log(`\nStubborn cases:`);
		for (const s of stubborn) console.log(`  ${s.file}  ${s.beforeBs}→${s.afterBs}`);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
