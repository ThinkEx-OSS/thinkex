import { beforeEach, describe, expect, it, vi } from "vitest";
import { editBranchMessage, fetchBranches, switchBranch } from "@/lib/chat-v2/branches";

describe("chat-v2 branching helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads sibling metadata from the branches endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        siblings: [
          { id: "m1", parentId: null, createdAt: "2024-01-01" },
          { id: "m2", parentId: null, createdAt: "2024-01-02" },
        ],
        currentIndex: 1,
      }),
    }));

    const data = await fetchBranches("thread-1", "m2");
    expect(data.currentIndex).toBe(1);
    expect(data.siblings).toHaveLength(2);
  });

  it("posts a branch switch request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ headMessageId: "m3" }) });
    vi.stubGlobal("fetch", fetchMock);

    await switchBranch("thread-1", "m2", "m3");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/threads/thread-1/messages/m2/branches",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetBranchId: "m3" }),
      }),
    );
  });

  it("posts the edit endpoint payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ newMessageId: "m4" }) });
    vi.stubGlobal("fetch", fetchMock);

    const data = await editBranchMessage("thread-1", "m2", "edited");

    expect(data.newMessageId).toBe("m4");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chat-v2/edit",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: "thread-1", messageId: "m2", text: "edited" }),
      }),
    );
  });
});
