import { describe, expect, it } from "vitest";

import { getWorkspaceAiGatewayRoutingOptions } from "#/features/workspaces/ai/ai-gateway-routing";
import {
	getAIThreadTitleGatewayProviderOptions,
	getWorkspaceAiGatewayProviderOptions,
} from "#/features/workspaces/ai/gateway";
import { WORKSPACE_AI_CHAT_MODELS } from "#/features/workspaces/ai/models";

describe("chat reasoning capture", () => {
	it.each(WORKSPACE_AI_CHAT_MODELS)("keeps $id fallback thinking compatible", (model) => {
		const options = getWorkspaceAiGatewayProviderOptions({ modelId: model.id });
		const routeModels = [
			model.gatewayModel,
			...getWorkspaceAiGatewayRoutingOptions(model.id).models,
		];

		expect(options.openai).toMatchObject({ reasoningSummary: "detailed" });
		for (const provider of ["google", "vertex"]) {
			expect(options[provider]).toMatchObject({ thinkingConfig: { includeThoughts: true } });
		}

		for (const slug of routeModels) {
			if (slug === "anthropic/claude-haiku-4.5") {
				expect(options.anthropic).toBeUndefined();
			}
			if (slug === "anthropic/claude-sonnet-5.5") {
				expect(options.anthropic).toEqual({
					thinking: { type: "adaptive", display: "summarized" },
				});
			}
		}

		expect(options.openai?.reasoningEffort).toBe(model.id === "gpt-sol" ? "low" : undefined);
		expect(options.google).toEqual({
			thinkingConfig: {
				includeThoughts: true,
				...(model.id === "gemini" ? { thinkingLevel: "low" } : {}),
			},
		});
		expect(options.vertex).toEqual(options.google);
	});

	it("leaves title generation at minimal effort without requesting summaries", () => {
		const { gateway: _gateway, ...providers } = getAIThreadTitleGatewayProviderOptions();
		expect(providers).toEqual({
			google: { thinkingConfig: { thinkingLevel: "minimal" } },
			vertex: { thinkingConfig: { thinkingLevel: "minimal" } },
			openai: { reasoningEffort: "none" },
		});
	});
});
