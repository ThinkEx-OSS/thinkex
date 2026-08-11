import { describe, expect, it, vi } from "vitest";

import { DocumentSession } from "#/features/workspaces/documents/document-session";
import { WorkspaceKernel } from "#/features/workspaces/kernel/workspace-kernel";

describe("DocumentSession member revocation", () => {
	it("closes every connection belonging to the revoked user", async () => {
		const revokedClose = vi.fn();
		const otherClose = vi.fn();
		const disconnectMember = Reflect.get(DocumentSession.prototype, "disconnectMember");

		expect(disconnectMember).toBeTypeOf("function");
		await Reflect.apply(
			disconnectMember,
			{
				getConnections: () => [
					{ close: revokedClose, state: { canMutate: true, userId: "revoked-user" } },
					{ close: otherClose, state: { canMutate: true, userId: "other-user" } },
				],
			},
			[{ userId: "revoked-user" }],
		);

		expect(revokedClose).toHaveBeenCalledWith(1008, "Workspace access changed");
		expect(otherClose).not.toHaveBeenCalled();
	});

	it("fans a workspace revocation out to each document session", async () => {
		const roomClose = vi.fn();
		const disconnectDocumentMember = vi.fn();
		const getByName = vi.fn(() => ({ disconnectMember: disconnectDocumentMember }));
		const disconnectMember = Reflect.get(WorkspaceKernel.prototype, "disconnectMember");
		const workspaceRoom = {
			broadcast: vi.fn(),
			broadcastPresenceSnapshot: vi.fn(),
			env: { DocumentSession: { getByName } },
			getConnections: () => [
				{
					close: roomClose,
					id: "connection-1",
					state: { user: { id: "revoked-user", image: null, name: "Revoked" } },
				},
			],
			name: "workspace-1",
		};

		await Reflect.apply(disconnectMember, workspaceRoom, [
			{
				documentItemIds: ["document-1", "document-2"],
				userId: "revoked-user",
			},
		]);

		expect(roomClose).toHaveBeenCalledWith(1008, "Workspace access changed");
		expect(getByName).toHaveBeenCalledTimes(2);
		expect(getByName).toHaveBeenNthCalledWith(1, "workspace-1:document-1");
		expect(getByName).toHaveBeenNthCalledWith(2, "workspace-1:document-2");
		expect(disconnectDocumentMember).toHaveBeenCalledTimes(2);
		expect(disconnectDocumentMember).toHaveBeenCalledWith({ userId: "revoked-user" });
	});
});
