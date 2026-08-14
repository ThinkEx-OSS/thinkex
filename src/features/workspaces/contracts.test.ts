import { describe, expect, it } from "vitest";

import { createWorkspaceItemInputSchema } from "#/features/workspaces/contracts";

describe("create workspace item input", () => {
	it("only accepts item types supported by direct creation", () => {
		const input = {
			id: crypto.randomUUID(),
			workspaceId: "workspace-1",
		};

		expect(createWorkspaceItemInputSchema.safeParse({ ...input, type: "document" }).success).toBe(
			true,
		);
		expect(createWorkspaceItemInputSchema.safeParse({ ...input, type: "folder" }).success).toBe(
			true,
		);
		expect(createWorkspaceItemInputSchema.safeParse({ ...input, type: "flashcard" }).success).toBe(
			false,
		);
		expect(createWorkspaceItemInputSchema.safeParse({ ...input, type: "file" }).success).toBe(
			false,
		);
	});
});
