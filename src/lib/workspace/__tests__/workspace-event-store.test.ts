import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceEvent } from "@/lib/workspace/events";

const mockExecute = vi.fn();
const mockTransaction = vi.fn();
const mockProjectWorkspaceEvent = vi.fn();
const mockBroadcast = vi.fn();
const mockAcquireWorkspaceProjectionLock = vi.fn();

vi.mock("@/lib/db/client", () => ({
  db: {
    execute: (...args: any[]) => mockExecute(...args),
    transaction: (...args: any[]) => mockTransaction(...args),
  },
}));

vi.mock("@/lib/workspace/workspace-items-projector", () => ({
  projectWorkspaceEvent: (...args: any[]) => mockProjectWorkspaceEvent(...args),
}));

vi.mock("@/lib/realtime/server-broadcast", () => ({
  broadcastWorkspaceEventFromServer: (...args: any[]) => mockBroadcast(...args),
}));

vi.mock("@/lib/workspace/workspace-projection-lock", () => ({
  acquireWorkspaceProjectionLock: (...args: any[]) =>
    mockAcquireWorkspaceProjectionLock(...args),
}));

const event: WorkspaceEvent = {
  id: "evt-1",
  type: "ITEM_CREATED",
  payload: {
    id: "item-1",
    item: {
      id: "item-1",
      type: "document",
      name: "Doc",
      subtitle: "",
      data: { markdown: "hello" },
    },
  },
  timestamp: 123,
  userId: "user-1",
  userName: "User",
};

describe("workspace-event-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockImplementation(async (callback: any) =>
      callback({ execute: mockExecute }),
    );
  });

  it("projects and broadcasts persisted events on success", async () => {
    mockExecute.mockResolvedValueOnce([{ result: "(7,f)" }]);

    const { appendWorkspaceEventWithBaseVersion } =
      await import("@/lib/workspace/workspace-event-store");

    const result = await appendWorkspaceEventWithBaseVersion({
      workspaceId: "ws-1",
      event,
      baseVersion: 6,
    });

    expect(result).toEqual({
      conflict: false,
      version: 7,
      persistedEvent: {
        ...event,
        version: 7,
      },
    });
    expect(mockProjectWorkspaceEvent).toHaveBeenCalledWith(
      { execute: mockExecute },
      {
        workspaceId: "ws-1",
        event,
        version: 7,
      },
    );
    expect(mockBroadcast).toHaveBeenCalledWith("ws-1", {
      ...event,
      version: 7,
    });
    expect(mockAcquireWorkspaceProjectionLock).toHaveBeenCalledWith(
      { execute: mockExecute },
      "ws-1",
    );
  });

  it("returns conflicts without projecting or broadcasting", async () => {
    mockExecute.mockResolvedValueOnce([{ result: "(9,t)" }]);

    const { appendWorkspaceEventWithBaseVersion } =
      await import("@/lib/workspace/workspace-event-store");

    const result = await appendWorkspaceEventWithBaseVersion({
      workspaceId: "ws-1",
      event,
      baseVersion: 8,
    });

    expect(result).toEqual({
      conflict: true,
      version: 9,
    });
    expect(mockAcquireWorkspaceProjectionLock).toHaveBeenCalledWith(
      { execute: mockExecute },
      "ws-1",
    );
    expect(mockProjectWorkspaceEvent).not.toHaveBeenCalled();
    expect(mockBroadcast).not.toHaveBeenCalled();
  });
});
