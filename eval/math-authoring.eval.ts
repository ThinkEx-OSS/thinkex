import { describe, expect, it } from "vitest";

import { mathAuthoringCases } from "./datasets/math-authoring.cases";
import { runWorkspaceAgent } from "./support/harness";
import { scoreContent, scoreExpectedTools } from "./support/scorers";

/**
 * Cross-model benchmark for math / currency / chemistry authoring.
 *
 * Unlike `workspace-tools.eval.ts` this does not assert — it measures. A model
 * scoring badly is data about the prompt, not a broken build, and failing the
 * run would hide the rest of the matrix. Results print as a table so a prompt
 * or schema change can be judged against a before/after.
 *
 * The whole matrix runs inside one test with a bounded worker pool rather than
 * as `describe.concurrent`: the report has to print after every row lands, and
 * concurrent `it`s would race it. The cap keeps us under gateway rate limits.
 *
 * Env: EVAL_MODELS (comma-separated ids from models.ts), EVAL_CONCURRENCY.
 */
const MODELS = (process.env.EVAL_MODELS ?? "claude-sonnet,claude-haiku,gpt-luna,gemini-pro")
	.split(",")
	.map((id) => id.trim())
	.filter(Boolean);

const CONCURRENCY = Number(process.env.EVAL_CONCURRENCY ?? 8);

interface Row {
	model: string;
	surface: string;
	case: string;
	toolPass: boolean | null;
	contentPass: boolean;
	detail: string;
}

async function mapWithLimit<T, R>(
	items: T[],
	limit: number,
	run: (item: T) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let cursor = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		for (;;) {
			const index = cursor++;
			const item = items[index];
			if (index >= items.length || item === undefined) return;
			results[index] = await run(item);
		}
	});
	await Promise.all(workers);
	return results;
}

function formatTable(rows: Row[]): string {
	const labels = [...new Set(rows.map((row) => `${row.surface}: ${row.case}`))];
	const width = 44;
	const header = ["case".padEnd(width), ...MODELS.map((model) => model.padEnd(13))].join("| ");
	const lines = [header, "-".repeat(header.length)];

	for (const label of labels) {
		const cells = MODELS.map((model) => {
			const row = rows.find((r) => `${r.surface}: ${r.case}` === label && r.model === model);
			if (!row) return "—".padEnd(13);
			const tool = row.toolPass === false ? " tool✗" : "";
			return `${row.contentPass ? "PASS" : "FAIL"}${tool}`.padEnd(13);
		});
		lines.push([label.slice(0, width).padEnd(width), ...cells].join("| "));
	}

	lines.push("");
	for (const model of MODELS) {
		const mine = rows.filter((row) => row.model === model);
		const passed = mine.filter((row) => row.contentPass).length;
		lines.push(`${model.padEnd(14)} ${passed}/${mine.length} content rules satisfied`);
	}

	lines.push("");
	for (const surface of [...new Set(rows.map((row) => row.surface))]) {
		const mine = rows.filter((row) => row.surface === surface);
		const passed = mine.filter((row) => row.contentPass).length;
		lines.push(`${surface.padEnd(14)} ${passed}/${mine.length} across all models`);
	}
	return lines.join("\n");
}

describe.skipIf(!process.env.AI_GATEWAY_API_KEY)("math authoring benchmark", () => {
	it("measures math/currency authoring across models", { timeout: 900_000 }, async () => {
		const jobs = mathAuthoringCases.flatMap((testCase) =>
			MODELS.map((model) => ({ model, testCase })),
		);

		const rows = await mapWithLimit(jobs, CONCURRENCY, async ({ model, testCase }) => {
			try {
				const output = await runWorkspaceAgent({ ...testCase.input, modelId: model });
				const results = testCase.contentChecks.map((check) => scoreContent(output, check));
				return {
					model,
					surface: testCase.surface,
					case: testCase.name.replace(/^\w+: /, ""),
					toolPass: testCase.expectedTools?.length
						? scoreExpectedTools(output, testCase.expectedTools).pass
						: null,
					contentPass: results.every((result) => result.pass),
					detail: results
						.filter((result) => !result.pass)
						.map((result) => result.message)
						.join(" | "),
				} satisfies Row;
			} catch (error) {
				// One model erroring must not sink the rest of the matrix.
				return {
					model,
					surface: testCase.surface,
					case: testCase.name.replace(/^\w+: /, ""),
					toolPass: null,
					contentPass: false,
					detail: `turn failed: ${error instanceof Error ? error.message : String(error)}`,
				} satisfies Row;
			}
		});

		// The workers pool does not forward console output to stdout, so the report
		// is written through the file-snapshot channel instead: that lands on disk
		// from the Node side, and a re-run diffs against the previous numbers —
		// exactly the before/after view a prompt change needs.
		const report = [
			formatTable(rows),
			"",
			"failures",
			...rows
				.filter((row) => !row.contentPass)
				.map((row) => `\n[${row.model}] ${row.surface}: ${row.case}\n${row.detail}`),
		].join("\n");

		await expect(report).toMatchFileSnapshot("./__reports__/math-authoring.md");
	});
});
