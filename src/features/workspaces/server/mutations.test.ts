import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

import { workspaceMembers } from "#/db/schema";

const mocks = vi.hoisted(() => ({
	assertCanReadWorkspace: vi.fn(),
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
	assertCanReadWorkspace: mocks.assertCanReadWorkspace,
	getCurrentUserId: mocks.getCurrentUserId,
}));
vi.mock("#/integrations/posthog/server", () => ({
	capturePostHogServerEvent: mocks.capturePostHogServerEvent,
}));

import {
	setWorkspaceArchiveStatusForCurrentUser,
	updateWorkspaceForCurrentUser,
} from "#/features/workspaces/server/mutations";

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
			type: "workspace.page.refresh",
			workspaceId: workspace.id,
			revision: 8,
		});
		expect(result).toMatchObject({ id: workspace.id, membershipRole: "editor" });
	});

	it("archives only the current user's workspace membership", async () => {
		const archivedAt = new Date("2026-09-03T18:00:00.000Z");
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
			archivedAt,
			lastOpenedAt: new Date("2026-08-10T00:00:00.000Z"),
			role: "viewer",
		};
		const membershipWhere = vi.fn(() => ({ returning: vi.fn(async () => [membership]) }));
		const set = vi.fn(() => ({ where: membershipWhere }));
		const transaction = {
			select: vi.fn(() => ({
				from: vi.fn(() => ({
					where: vi.fn(() => ({ limit: vi.fn(async () => [workspace]) })),
				})),
			})),
			update: vi.fn(() => ({ set })),
		};
		const dispose = vi.fn();
		const db = {
			transaction: vi.fn(async (run) => await run(transaction)),
		};
		mocks.createDbContext.mockResolvedValue({ db, dispose });

		const result = await setWorkspaceArchiveStatusForCurrentUser({
			workspaceId: workspace.id,
			status: "archived",
		});

		expect(mocks.assertCanReadWorkspace).toHaveBeenCalledWith(db, {
			workspaceId: workspace.id,
			userId: "actor-user",
		});
		expect(set).toHaveBeenCalledWith({ archivedAt: expect.any(Date) });
		expect(membershipWhere).toHaveBeenCalledWith(
			and(
				eq(workspaceMembers.workspaceId, workspace.id),
				eq(workspaceMembers.userId, "actor-user"),
			),
		);
		expect(result).toMatchObject({
			archivedForCurrentUserAt: archivedAt.toISOString(),
			id: workspace.id,
			membershipRole: "viewer",
		});
		expect(dispose).toHaveBeenCalledOnce();
	});
});
