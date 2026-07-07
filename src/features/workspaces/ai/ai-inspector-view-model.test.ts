import { describe, expect, it } from "vitest";

import type { AIInspectorEvent } from "#/features/workspaces/ai/ai-inspector";
import { getAIInspectorRunViews } from "#/features/workspaces/ai/ai-inspector-view-model";

describe("AI inspector run views", () => {
	it("surfaces the requested and routed model for auto turns", () => {
		const [run] = getAIInspectorRunViews([
			{
				id: "event-1",
				runId: "run-1",
				sequence: 1,
				createdAt: 1,
				type: "turn.started",
				payload: {
					modelId: "claude-haiku",
					requestedModelId: "auto",
					routingReason: "simple-chat",
					system: "system prompt",
				},
			} satisfies AIInspectorEvent,
		]);

		expect(run.modelId).toBe("claude-haiku");
		expect(run.requestedModelId).toBe("auto");
		expect(run.routingReason).toBe("simple-chat");
	});
});
