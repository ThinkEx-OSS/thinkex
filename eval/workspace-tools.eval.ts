import { describe, expect, it } from "vitest";

import { workspaceToolCases } from "./datasets/workspace-tools.cases";
import { runWorkspaceAgent, type WorkspaceAgentOutput } from "./support/harness";
import {
	scoreAnswerQuality,
	scoreContent,
	scoreExpectedTools,
	scoreNoForbiddenTools,
	scoreTargetedEditProvenance,
	scoreToolInputsValid,
} from "./support/scorers";

const STANDUP_LIST_REF = "b_standupList1.r_bullet0001";

describe("workspace eval scorers", () => {
	it.each([
		{ expected: false, priorReadEditRefs: [] },
		{ expected: true, priorReadEditRefs: [STANDUP_LIST_REF] },
	])("requires an editRef from a completed earlier read", ({ expected, priorReadEditRefs }) => {
		const output: WorkspaceAgentOutput = {
			text: "",
			toolCalls: [
				{
					input: { edits: [{ editRef: STANDUP_LIST_REF, op: "insert_after" }] },
					issues: [],
					name: "workspace_edit_item",
					priorReadEditRefs,
					valid: true,
				},
			],
		};

		expect(scoreTargetedEditProvenance(output).pass).toBe(expected);
	});
});

// Live evals: real model turns through the real gateway wiring. On-demand and
// billed, so they live outside `pnpm test` — run with `pnpm eval`. Skip cleanly
// when the gateway key is absent instead of failing.
describe.skipIf(!process.env.AI_GATEWAY_API_KEY)("workspace tools", () => {
	it.for(workspaceToolCases)("$name", async (testCase) => {
		const output = await runWorkspaceAgent(testCase.input);

		// 1. Deterministic — every tool call carries schema-valid arguments. Catches
		//    a broken `.describe()` or a field the model can no longer fill.
		const inputsValid = scoreToolInputsValid(output);
		expect(inputsValid.pass, `invalid tool inputs — ${inputsValid.message}`).toBe(true);

		// 2. Deterministic — reached for the expected tools, avoided the forbidden ones.
		if (testCase.expectedTools?.length) {
			const choice = scoreExpectedTools(output, testCase.expectedTools);
			expect(choice.pass, `tool choice — ${choice.message}`).toBe(true);
		}
		if (testCase.forbiddenTools?.length) {
			const forbidden = scoreNoForbiddenTools(output, testCase.forbiddenTools);
			expect(forbidden.pass, forbidden.message).toBe(true);
		}

		// 2b. Deterministic — a read→edit turn made a targeted edit whose ref came
		//     from the read fixture, not a fabricated ref or a whole-doc overwrite.
		if (testCase.requiresTargetedEditFromRead) {
			const provenance = scoreTargetedEditProvenance(output);
			expect(provenance.pass, `edit provenance — ${provenance.message}`).toBe(true);
		}

		// 2c. Deterministic — what the model actually wrote. Tool choice and schema
		//     validity cannot see authoring dialect: `$x^2$` in document HTML is
		//     schema-valid and renders as literal dollar signs forever.
		for (const check of testCase.contentChecks ?? []) {
			const target = typeof check.source === "string" ? "answer" : check.source.tool;
			const content = scoreContent(output, check);
			expect(content.pass, `content (${target}) — ${content.message}`).toBe(true);
		}

		// 3. Model-graded — grade the prose answer against a rubric when set.
		if (testCase.qualityRubric) {
			const quality = await scoreAnswerQuality({
				prompt: testCase.input.prompt,
				answer: output.text,
				rubric: testCase.qualityRubric,
			});
			expect(quality.pass, `answer quality — ${quality.message}`).toBe(true);
		}
	});
});
