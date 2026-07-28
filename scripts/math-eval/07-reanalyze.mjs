#!/usr/bin/env node
// Re-analyzes every saved run from raw text (bypassing the buggy analysis
// fields that were saved by scripts running before the lib.mjs fix).
// Groups by experiment (variance/currency/code/position) and reports the
// true drift metrics + normalizer efficacy.
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

function bucket(path) {
	// Path structure: .../scratch/math-eval-runs/<experiment>/<key>/<file>.json
	const rel = path.split("math-eval-runs/")[1];
	const [experiment, ...rest] = rel.split("/");
	const key = rest.slice(0, -1).join("/"); // key includes model and any nested
	const file = rest[rest.length - 1];
	return { experiment, key, file };
}

async function main() {
	const files = await walk(RUNS_DIR);
	const groups = new Map();
	for (const f of files) {
		const b = bucket(f);
		const groupKey = `${b.experiment}::${b.key}`;
		if (!groups.has(groupKey)) groups.set(groupKey, []);
		groups.get(groupKey).push(f);
	}

	const byExperiment = new Map();
	for (const [gk, files] of groups) {
		const [exp, key] = gk.split("::");
		if (!byExperiment.has(exp)) byExperiment.set(exp, []);
		byExperiment.get(exp).push({ key, files });
	}

	for (const [exp, groups] of byExperiment) {
		console.log(`\n═══ ${exp} ═══\n`);
		groups.sort((a, b) => a.key.localeCompare(b.key));
		let totalRuns = 0;
		let totalDrift = 0;
		let totalCurrencyRisk = 0;
		let totalUnicode = 0;
		let totalFixedByNormalizer = 0;
		for (const { key, files } of groups) {
			const results = [];
			for (const f of files) {
				const raw = JSON.parse(await readFile(f, "utf8"));
				const a = analyze(raw.text);
				const normalized = normalize(raw.text);
				const na = analyze(normalized);
				const beforeBs = a.backslashInline + a.backslashBlock;
				const afterBs = na.backslashInline + na.backslashBlock;
				results.push({
					drift: beforeBs > 0,
					fixed: beforeBs > 0 && afterBs === 0,
					stillDrifting: beforeBs > 0 && afterBs > 0,
					unicode: a.unicodeMath > 0,
					rawCurrency: a.rawCurrency > 0,
					file: f.split("/").pop(),
					beforeBs,
					afterBs,
				});
			}
			const drifts = results.filter((r) => r.drift).length;
			const currency = results.filter((r) => r.rawCurrency).length;
			const unicode = results.filter((r) => r.unicode).length;
			const fixed = results.filter((r) => r.fixed).length;
			totalRuns += results.length;
			totalDrift += drifts;
			totalCurrencyRisk += currency;
			totalUnicode += unicode;
			totalFixedByNormalizer += fixed;
			const flag =
				drifts === 0 ? "✓" : fixed === drifts ? "→" : "✗";
			console.log(
				`  ${flag} ${key.padEnd(38)}  n=${String(results.length).padStart(2)}  drift:${drifts}  fixed:${fixed}  unicode:${unicode}  rawCurr:${currency}`,
			);
		}
		console.log(
			`  ─── total: n=${totalRuns}  drift=${totalDrift} (${Math.round(
				(100 * totalDrift) / totalRuns,
			)}%)  fixedByNormalizer=${totalFixedByNormalizer}  unicode=${totalUnicode}  rawCurrency=${totalCurrencyRisk}`,
		);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
