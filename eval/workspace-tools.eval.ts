import { describe, expect, it } from "vitest";

import { workspaceToolCases } from "./datasets/workspace-tools.cases";
import { runWorkspaceAgent } from "./support/harness";
import {
	scoreAnswerQuality,
	scoreExpectedTools,
	scoreNoForbiddenTools,
	scoreToolInputsValid,
} from "./support/scorers";

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
