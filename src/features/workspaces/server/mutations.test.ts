import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	capturePostHogServerEvent: vi.fn(),
	createDbContext: vi.fn(),
	env: {},
	getCurrentUserId: vi.fn(async () => "actor-user"),
	lockWorkspaceForActor: vi.fn(),
	nextWorkspaceRevision: vi.fn(async () => 8),
	notifyWorkspaceRoom: vi.fn(),
	purgeWorkspaceResources: vi.fn(),
	withWorkspaceTransaction: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: mocks.env }));
vi.mock("#/db/server", () => ({ createDbContext: mocks.createDbContext }));
vi.mock("#/features/workspaces/durable-object-lifecycle", () => ({
	purgeWorkspaceResources: mocks.purgeWorkspaceResources,
}));
vi.mock("#/features/workspaces/persistence/workspace-postgres-support", () => ({
	lockWorkspaceForActor: mocks.lockWorkspaceForActor,
	nextWorkspaceRevision: mocks.nextWorkspaceRevision,
	withWorkspaceTransaction: mocks.withWorkspaceTransaction,
}));
vi.mock("#/features/workspaces/realtime/workspace-room-notifier", () => ({
	notifyWorkspaceRoom: mocks.notifyWorkspaceRoom,
}));
vi.mock("#/features/workspaces/server/permissions", () => ({
	assertCanDeleteWorkspace: vi.fn(),
	assertCanReadWorkspace: vi.fn(),
	getCurrentUserId: mocks.getCurrentUserId,
}));
vi.mock("#/integrations/posthog/server", () => ({
	capturePostHogServerEvent: mocks.capturePostHogServerEvent,
}));

import { updateWorkspaceForCurrentUser } from "#/features/workspaces/server/mutations";

describe("workspace settings mutations", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("commits a revision and publishes it after workspace settings change", async () => {
		const workspace = {
			archivedAt: null,
			color: "blue",
			createdAt: new Date("2026-08-01T00:00:00.000Z"),
			description: null,
			icon: "compass",
			id: "workspace-1",
			name: "Research",
			ownerId: "owner-user",
			revision: 7,
			theme: "default",
			updatedAt: new Date("2026-08-11T00:00:00.000Z"),
		} as const;
		const membership = {
			lastOpenedAt: new Date("2026-08-10T00:00:00.000Z"),
			role: "editor",
		};
		const transaction = {
			select: vi.fn(() => ({
				from: vi.fn(() => ({
					where: vi.fn(() => ({ limit: vi.fn(async () => [membership]) })),
				})),
			})),
			update: vi.fn(() => ({
				set: vi.fn(() => ({
					where: vi.fn(() => ({ returning: vi.fn(async () => [workspace]) })),
				})),
			})),
		};
		mocks.withWorkspaceTransaction.mockImplementation(async (run) => await run(transaction));

		const result = await updateWorkspaceForCurrentUser({
			workspaceId: workspace.id,
			name: workspace.name,
			icon: workspace.icon,
			color: workspace.color,
			theme: workspace.theme,
		});

		expect(mocks.lockWorkspaceForActor).toHaveBeenCalledWith(
			transaction,
			workspace.id,
			"actor-user",
		);
		expect(mocks.nextWorkspaceRevision).toHaveBeenCalledWith(transaction, workspace.id);
		expect(mocks.notifyWorkspaceRoom).toHaveBeenCalledWith(mocks.env, {
			workspaceId: workspace.id,
			revision: 8,
		});
		expect(result).toMatchObject({ id: workspace.id, membershipRole: "editor" });
	});
});
