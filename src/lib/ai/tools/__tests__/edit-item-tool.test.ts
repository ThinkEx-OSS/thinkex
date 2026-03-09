import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockWorkspaceWorker = vi.fn();
const mockLoadStateForTool = vi.fn();
const mockResolveItem = vi.fn();
const mockGetVirtualPath = vi.fn();

vi.mock("@/lib/ai/workers", () => ({
  workspaceWorker: (...args: unknown[]) => mockWorkspaceWorker(...args),
}));

vi.mock("@/lib/ai/tools/tool-utils", () => ({
  loadStateForTool: (...args: unknown[]) => mockLoadStateForTool(...args),
  resolveItem: (...args: unknown[]) => mockResolveItem(...args),
}));

vi.mock("@/lib/utils/virtual-workspace-fs", () => ({
  getVirtualPath: (...args: unknown[]) => mockGetVirtualPath(...args),
}));

describe("createEditItemTool", () => {
  let createEditItemTool: (ctx: {
    workspaceId: string;
    userId: string;
    activeFolderId?: string;
    threadId?: string | null;
  }) => any;

  const ctx = {
    workspaceId: "ws-1",
    userId: "user-1",
    activeFolderId: undefined,
    threadId: "thread-1",
  };

  const noteItem = {
    id: "note-1",
    type: "note",
    name: "My Note",
    data: {},
  };

  beforeAll(async () => {
    const mod = await import("@/lib/ai/tools/edit-item-tool");
    createEditItemTool = mod.createEditItemTool;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadStateForTool.mockResolvedValue({ success: true, state: { items: [noteItem] } });
    mockResolveItem.mockReturnValue(noteItem);
    mockWorkspaceWorker.mockResolvedValue({ success: true, itemId: "note-1", message: "ok" });
    mockGetVirtualPath.mockReturnValue("notes/My Note.md");
  });

  it("fails fast when itemName is missing", async () => {
    const tool: any = createEditItemTool(ctx);
    const result = await tool.execute({ itemName: "", oldString: "a", newString: "b" });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/itemName is required/i);
  });

  it("returns loadStateForTool failure", async () => {
    mockLoadStateForTool.mockResolvedValueOnce({ success: false, message: "No workspace context available" });
    const tool: any = createEditItemTool(ctx);
    const result = await tool.execute({ itemName: "My Note", oldString: "a", newString: "b" });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/No workspace context available/);
    expect(mockWorkspaceWorker).not.toHaveBeenCalled();
  });

  it("returns item not found message when resolveItem misses", async () => {
    mockResolveItem.mockReturnValueOnce(undefined);
    const tool: any = createEditItemTool(ctx);
    const result = await tool.execute({ itemName: "Unknown", oldString: "a", newString: "b" });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Could not find item "Unknown"/);
  });

  it("requires disambiguation when multiple exact-name candidates exist", async () => {
    const duplicate = { ...noteItem, id: "note-2" };
    mockLoadStateForTool.mockResolvedValueOnce({
      success: true,
      state: { items: [noteItem, duplicate] },
    });
    mockResolveItem.mockReturnValueOnce(noteItem);
    mockGetVirtualPath
      .mockReturnValueOnce("notes/My Note.md")
      .mockReturnValueOnce("folder/My Note.md");

    const tool: any = createEditItemTool(ctx);
    const result = await tool.execute({ itemName: "My Note", oldString: "a", newString: "b" });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Multiple items named/);
    expect(result.message).toMatch(/Disambiguate using path/);
  });

  it("rejects non-editable item types", async () => {
    const imageItem = { id: "img-1", type: "image", name: "Figure", data: {} };
    mockResolveItem.mockReturnValueOnce(imageItem);
    mockLoadStateForTool.mockResolvedValueOnce({ success: true, state: { items: [imageItem] } });

    const tool: any = createEditItemTool(ctx);
    const result = await tool.execute({ itemName: "Figure", oldString: "a", newString: "b" });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not editable/);
  });

  it("calls workspaceWorker edit and returns renamed itemName", async () => {
    const tool: any = createEditItemTool(ctx);
    const result = await tool.execute({
      itemName: "My Note",
      oldString: "old",
      newString: "new",
      newName: "Renamed Note",
      replaceAll: true,
      sources: [{ title: "Ref", url: "https://example.com" }],
    });

    expect(mockWorkspaceWorker).toHaveBeenCalledWith(
      "edit",
      expect.objectContaining({
        workspaceId: "ws-1",
        itemId: "note-1",
        itemType: "note",
        oldString: "old",
        newString: "new",
        replaceAll: true,
        newName: "Renamed Note",
      })
    );
    expect(result.success).toBe(true);
    expect(result.itemName).toBe("Renamed Note");
  });

  it("supports rename-only with oldString='' and newString=''", async () => {
    const tool: any = createEditItemTool(ctx);
    const result = await tool.execute({
      itemName: "My Note",
      oldString: "",
      newString: "",
      newName: "Renamed Note",
    });

    expect(mockWorkspaceWorker).toHaveBeenCalledWith(
      "edit",
      expect.objectContaining({
        workspaceId: "ws-1",
        itemId: "note-1",
        itemType: "note",
        oldString: "",
        newString: "",
        newName: "Renamed Note",
      })
    );
    expect(result.success).toBe(true);
    expect(result.itemName).toBe("Renamed Note");
  });

  it("passes through worker failures", async () => {
    mockWorkspaceWorker.mockResolvedValueOnce({
      success: false,
      message: "Found multiple matches for oldString",
    });
    const tool: any = createEditItemTool(ctx);
    const result = await tool.execute({ itemName: "My Note", oldString: "a", newString: "b" });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/multiple matches/i);
  });
});

