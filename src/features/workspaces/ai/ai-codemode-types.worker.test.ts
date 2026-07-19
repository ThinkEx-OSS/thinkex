import { generateTypes } from "@cloudflare/codemode/ai";
import { describe, expect, it } from "vitest";

import { createAIThreadCodeRunTools } from "#/features/workspaces/ai/code-run-tools";
import { createAIThreadResearchTools } from "#/features/workspaces/ai/research-tools";
import { createAIThreadTimeTools } from "#/features/workspaces/ai/time-tools";
import { createAIThreadWebTools } from "#/features/workspaces/ai/web-tools";

describe("AI Code Mode type generation", () => {
	it("publishes concrete output types for every non-workspace nested tool", () => {
		const env = {} as Cloudflare.Env;
		const tools = {
			...createAIThreadCodeRunTools({ env, sandboxId: "test-thread" }),
			...createAIThreadResearchTools(env),
			...createAIThreadTimeTools(),
			...createAIThreadWebTools(env),
		};
		const declarations = generateTypes(tools, "tools");

		expect(declarations).not.toMatch(/type \w+Output = unknown/);
		for (const toolName of Object.keys(tools)) {
			expect(declarations).toContain(`${toPascalCase(toolName)}Output`);
		}
		expect(declarations).toContain('mode: "passages"');
		expect(declarations).toContain('mode: "related"');
		expect(declarations).toMatch(/mode: "passages"[\s\S]*question: string/);
		expect(declarations).toMatch(
			/mode: "related"[\s\S]*relation: "similar" \| "citers" \| "references"/,
		);
	});
});

function toPascalCase(value: string) {
	return value
		.split("_")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join("");
}
