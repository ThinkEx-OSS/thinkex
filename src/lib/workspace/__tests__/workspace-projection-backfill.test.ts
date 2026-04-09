import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTransaction = vi.fn();
const mockSelect = vi.fn();
const mockGetLatestWorkspaceEventVersion = vi.fn();
const mockSyncWorkspaceProjectionToVersion = vi.fn();
const mockAcquireWorkspaceProjectionLock = vi.fn();

const workspaceItemUserState = {
  workspaceId: "workspace_item_user_state.workspace_id",
};
const workspaceItemContent = {
  workspaceId: "workspace_item_content.workspace_id",
};
const workspaceItemExtracted = {
  workspaceId: "workspace_item_extracted.workspace_id",
};
const workspaceItems = { workspaceId: "workspace_items.workspace_id" };
const workspaceItemProjectionState = {
  workspaceId: "workspace_item_projection_state.workspace_id",
};
const workspaces = {
  id: "workspaces.id",
  createdAt: "workspaces.created_at",
};

vi.mock("@/lib/db/client", () => ({
  db: {
    transaction: (...args: any[]) => mockTransaction(...args),
    select: (...args: any[]) => mockSelect(...args),
  },
  workspaceItemUserState,
  workspaceItemContent,
  workspaceItemExtracted,
  workspaceItems,
  workspaceItemProjectionState,
  workspaces,
}));

vi.mock("@/lib/workspace/workspace-items-projector", () => ({
  getLatestWorkspaceEventVersion: (...args: any[]) =>
    mockGetLatestWorkspaceEventVersion(...args),
  syncWorkspaceProjectionToVersion: (...args: any[]) =>
    mockSyncWorkspaceProjectionToVersion(...args),
}));

vi.mock("@/lib/workspace/workspace-projection-lock", () => ({
  acquireWorkspaceProjectionLock: (...args: any[]) =>
    mockAcquireWorkspaceProjectionLock(...args),
}));

describe("workspace-projection-backfill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rebuilds a workspace projection from scratch and sets the checkpoint", async () => {
    const deletedTables: unknown[] = [];
    const tx = {
      delete: (table: unknown) => {
        deletedTables.push(table);
        return {
          where: vi.fn().mockResolvedValue(undefined),
        };
      },
    };

    mockTransaction.mockImplementation(async (callback: any) => callback(tx));
    mockGetLatestWorkspaceEventVersion.mockResolvedValue(7);
    mockSyncWorkspaceProjectionToVersion.mockResolvedValue(7);

    const { backfillWorkspaceProjection } =
      await import("@/lib/workspace/workspace-projection-backfill");

    const result = await backfillWorkspaceProjection("ws-1");

    expect(mockAcquireWorkspaceProjectionLock).toHaveBeenCalledWith(tx, "ws-1");
    expect(deletedTables).toEqual([
      workspaceItemUserState,
      workspaceItemContent,
      workspaceItemExtracted,
      workspaceItems,
      workspaceItemProjectionState,
    ]);
    expect(mockGetLatestWorkspaceEventVersion).toHaveBeenCalledWith(tx, "ws-1");
    expect(mockSyncWorkspaceProjectionToVersion).toHaveBeenCalledWith(
      tx,
      "ws-1",
      7,
    );
    expect(result).toEqual({
      workspaceId: "ws-1",
      lastAppliedVersion: 7,
    });
  });

  it("iterates all existing workspaces and backfills blank workspaces safely", async () => {
    mockSelect.mockReturnValue({
      from: () => ({
        orderBy: () => Promise.resolve([{ id: "ws-1" }, { id: "ws-blank" }]),
      }),
    });

    mockTransaction.mockImplementation(async (callback: any) =>
      callback({
        delete: () => ({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    );

    mockGetLatestWorkspaceEventVersion
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(0);
    mockSyncWorkspaceProjectionToVersion
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(0);

    const { backfillAllWorkspaceProjections } =
      await import("@/lib/workspace/workspace-projection-backfill");

    const results = await backfillAllWorkspaceProjections();

    expect(mockAcquireWorkspaceProjectionLock).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      "ws-1",
    );
    expect(mockAcquireWorkspaceProjectionLock).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      "ws-blank",
    );
    expect(mockTransaction).toHaveBeenCalledTimes(2);
    expect(mockSyncWorkspaceProjectionToVersion).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      "ws-1",
      5,
    );
    expect(mockSyncWorkspaceProjectionToVersion).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      "ws-blank",
      0,
    );
    expect(results).toEqual([
      {
        workspaceId: "ws-1",
        lastAppliedVersion: 5,
      },
      {
        workspaceId: "ws-blank",
        lastAppliedVersion: 0,
      },
    ]);
  });
});
