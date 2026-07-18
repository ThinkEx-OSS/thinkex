import { describe, expect, it } from "vitest";

import { getFinishedToolReceipt } from "#/features/workspaces/components/ai-chat/ai-chat-tool-receipts";

describe("workspace read tool receipts", () => {
	it("describes pending-only reads as extraction in progress", () => {
		expect(
			getFinishedToolReceipt({
				baseStatus: "completed",
				output: { results: [{ path: "/Paper.pdf", status: "pending", type: "file" }] },
				toolInput: {},
				toolName: "workspace_read_items",
			}),
		).toEqual({ status: "completed", summary: "Extraction in progress for 1 item" });
	});

	it("keeps pending and failed reads visible beside ready content", () => {
		expect(
			getFinishedToolReceipt({
				baseStatus: "completed",
				output: {
					results: [
						{ path: "/Notes", status: "ready", type: "document" },
						{ path: "/Paper.pdf", status: "pending", type: "file" },
						{ code: "path_not_found", path: "/Missing", status: "failed" },
					],
				},
				toolInput: {},
				toolName: "workspace_read_items",
			}),
		).toEqual({
			status: "completed",
			summary: "Read “Notes” · 1 item still processing, 1 failure",
		});
	});
});
