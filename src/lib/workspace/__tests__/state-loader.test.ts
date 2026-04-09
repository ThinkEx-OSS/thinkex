import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTransaction = vi.fn();
const mockAssertWorkspaceProjectionReady = vi.fn();
const mockLoadWorkspaceProjectionSnapshot = vi.fn();

vi.mock("@/lib/db/client", () => ({
  db: {
    transaction: (...args: any[]) => mockTransaction(...args),
  },
}));

vi.mock("@/lib/workspace/workspace-items-projector", () => ({
  assertWorkspaceProjectionReady: (...args: any[]) =>
    mockAssertWorkspaceProjectionReady(...args),
  loadWorkspaceProjectionSnapshot: (...args: any[]) =>
    mockLoadWorkspaceProjectionSnapshot(...args),
}));

describe("state-loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockImplementation(async (callback: any) =>
      callback({ transaction: "tx" }),
    );
  });

  it("loads projection-backed state without performing lazy sync", async () => {
    mockLoadWorkspaceProjectionSnapshot.mockResolvedValue({
      items: [
        {
          id: "doc-1",
          type: "document",
          name: "Doc",
          subtitle: "",
          data: { markdown: "hello" },
        },
      ],
      version: 4,
    });

    const { loadWorkspaceStateSnapshot } =
      await import("@/lib/workspace/state-loader");

    const result = await loadWorkspaceStateSnapshot("ws-1", {
      userId: "user-1",
    });

    expect(mockAssertWorkspaceProjectionReady).toHaveBeenCalledWith(
      { transaction: "tx" },
      "ws-1",
    );
    expect(mockLoadWorkspaceProjectionSnapshot).toHaveBeenCalledWith(
      { transaction: "tx" },
      {
        workspaceId: "ws-1",
        userId: "user-1",
      },
    );
    expect(result).toEqual({
      state: [
        {
          id: "doc-1",
          type: "document",
          name: "Doc",
          subtitle: "",
          data: { markdown: "hello" },
        },
      ],
      version: 4,
    });
  });

  it("fails when the projection is not ready", async () => {
    mockAssertWorkspaceProjectionReady.mockRejectedValue(
      new Error("projection not ready"),
    );

    const { loadWorkspaceStateSnapshot } =
      await import("@/lib/workspace/state-loader");

    await expect(loadWorkspaceStateSnapshot("ws-1")).rejects.toThrow(
      "projection not ready",
    );
    expect(mockLoadWorkspaceProjectionSnapshot).not.toHaveBeenCalled();
  });
});
