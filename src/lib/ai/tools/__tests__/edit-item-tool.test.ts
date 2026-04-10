import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockWorkspaceWorker = vi.fn();
const mockLoadStateForTool = vi.fn();
const mockResolveItem = vi.fn();
const mockGetVirtualPath = vi.fn();

vi.mock("@/lib/ai/workers", () => ({
  workspaceWorker: (...args: unknown[]) => mockWorkspaceWorker(...args),
}));

vi.mock("@/lib/ai/tools/tool-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/tools/tool-utils")>();
  return {
    ...actual,
    loadStateForTool: (...args: unknown[]) => mockLoadStateForTool(...args),
    resolveItem: (...args: unknown[]) => mockResolveItem(...args),
  };
});

vi.mock("@/lib/utils/workspace-fs", () => ({
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

  const documentItem = {
    id: "doc-1",
    type: "document",
    name: "My Document",
    data: { markdown: "" },
  };

  beforeAll(async () => {
    const mod = await import("@/lib/ai/tools/edit-item-tool");
    createEditItemTool = mod.createEditItemTool;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadStateForTool.mockResolvedValue({ success: true, state: { items: [documentItem] } });
    mockResolveItem.mockReturnValue(documentItem);
    mockWorkspaceWorker.mockResolvedValue({ success: true, itemId: "doc-1", message: "ok" });
    mockGetVirtualPath.mockReturnValue("documents/My Document.md");
  });

  it("fails fast when itemName is missing", async () => {
    const tool: any = createEditItemTool(ctx);
    const result = await tool.execute({ itemName: "", edits: [{ oldText: "a", newText: "b" }] });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/itemName is required/i);
  });

  it("returns loadStateForTool failure", async () => {
    mockLoadStateForTool.mockResolvedValueOnce({ success: false, message: "No workspace context available" });
    const tool: any = createEditItemTool(ctx);
    const result = await tool.execute({ itemName: "My Document", edits: [{ oldText: "a", newText: "b" }] });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/No workspace context available/);
    expect(mockWorkspaceWorker).not.toHaveBeenCalled();
  });

  it("returns item not found message when resolveItem misses", async () => {
    mockResolveItem.mockReturnValueOnce(undefined);
    const tool: any = createEditItemTool(ctx);
    const result = await tool.execute({ itemName: "Unknown", edits: [{ oldText: "a", newText: "b" }] });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Could not find item "Unknown"/);
  });

  it("requires disambiguation when multiple exact-name candidates exist", async () => {
    const duplicate = { ...documentItem, id: "doc-2" };
    mockLoadStateForTool.mockResolvedValueOnce({
      success: true,
      state: { items: [documentItem, duplicate] },
    });
    mockResolveItem.mockReturnValueOnce(documentItem);
    mockGetVirtualPath
      .mockReturnValueOnce("documents/My Document.md")
      .mockReturnValueOnce("folder/My Document.md");

    const tool: any = createEditItemTool(ctx);
    const result = await tool.execute({ itemName: "My Document", edits: [{ oldText: "a", newText: "b" }] });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Multiple items named/);
    expect(result.message).toMatch(/Disambiguate using path/);
  });

  it("rejects non-editable item types", async () => {
    const imageItem = { id: "img-1", type: "image", name: "Figure", data: {} };
    mockResolveItem.mockReturnValueOnce(imageItem);
    mockLoadStateForTool.mockResolvedValueOnce({ success: true, state: { items: [imageItem] } });

    const tool: any = createEditItemTool(ctx);
    const result = await tool.execute({ itemName: "Figure", edits: [{ oldText: "a", newText: "b" }] });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not editable/);
  });

  it("allows PDF rename-only and rejects PDF content edits", async () => {
    const pdfItem = { id: "pdf-1", type: "pdf", name: "Syllabus.pdf", data: { fileUrl: "x", filename: "Syllabus.pdf" } };
    mockResolveItem.mockReturnValueOnce(pdfItem);
    mockLoadStateForTool.mockResolvedValueOnce({ success: true, state: { items: [pdfItem] } });

    const tool: any = createEditItemTool(ctx);
    const contentEditResult = await tool.execute({ itemName: "Syllabus.pdf", edits: [{ oldText: "foo", newText: "bar" }] });
    expect(contentEditResult.success).toBe(false);
    expect(contentEditResult.message).toMatch(/rename only|can only be renamed/i);

    mockResolveItem.mockReturnValueOnce(pdfItem);
    mockLoadStateForTool.mockResolvedValueOnce({ success: true, state: { items: [pdfItem] } });
    mockWorkspaceWorker.mockResolvedValueOnce({ success: true, itemId: "pdf-1", message: "Renamed PDF" });

    const renameResult = await tool.execute({
      itemName: "Syllabus.pdf",
      edits: [],
      newName: "Course Syllabus.pdf",
    });
    expect(renameResult.success).toBe(true);
    expect(renameResult.itemName).toBe("Course Syllabus.pdf");
    expect(mockWorkspaceWorker).toHaveBeenLastCalledWith(
      "edit",
      expect.objectContaining({ itemId: "pdf-1", itemType: "pdf", newName: "Course Syllabus.pdf" })
    );
  });

  it("calls workspaceWorker edit and returns renamed itemName", async () => {
    const tool: any = createEditItemTool(ctx);
    const result = await tool.execute({
      itemName: "My Document",
      edits: [{ oldText: "old", newText: "new" }],
      newName: "Renamed Document",
      sources: [{ title: "Ref", url: "https://example.com" }],
    });

    expect(mockWorkspaceWorker).toHaveBeenCalledWith(
      "edit",
      expect.objectContaining({
        workspaceId: "ws-1",
        itemId: "doc-1",
        itemType: "document",
        edits: [{ oldText: "old", newText: "new" }],
        newName: "Renamed Document",
      })
    );
    expect(result.success).toBe(true);
    expect(result.itemName).toBe("Renamed Document");
  });

  it("supports rename-only with empty edits array", async () => {
    const tool: any = createEditItemTool(ctx);
    const result = await tool.execute({
      itemName: "My Document",
      edits: [],
      newName: "Renamed Document",
    });

    expect(mockWorkspaceWorker).toHaveBeenCalledWith(
      "edit",
      expect.objectContaining({
        workspaceId: "ws-1",
        itemId: "doc-1",
        itemType: "document",
        edits: [],
        newName: "Renamed Document",
      })
    );
    expect(result.success).toBe(true);
    expect(result.itemName).toBe("Renamed Document");
  });

  it("passes through worker failures", async () => {
    mockWorkspaceWorker.mockResolvedValueOnce({
      success: false,
      message: "Found 2 occurrences of the text",
    });
    const tool: any = createEditItemTool(ctx);
    const result = await tool.execute({ itemName: "My Document", edits: [{ oldText: "a", newText: "b" }] });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/occurrences/i);
  });

  it("rejects empty edits array without newName", async () => {
    const tool: any = createEditItemTool(ctx);
    const result = await tool.execute({ itemName: "My Document", edits: [] });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/edits array is empty/);
  });

  it("supports multiple edits in one call", async () => {
    const tool: any = createEditItemTool(ctx);
    const result = await tool.execute({
      itemName: "My Document",
      edits: [
        { oldText: "first", newText: "FIRST" },
        { oldText: "second", newText: "SECOND" },
      ],
    });

    expect(mockWorkspaceWorker).toHaveBeenCalledWith(
      "edit",
      expect.objectContaining({
        edits: [
          { oldText: "first", newText: "FIRST" },
          { oldText: "second", newText: "SECOND" },
        ],
      })
    );
    expect(result.success).toBe(true);
  });

  it("rejects no-op edit entry in multi-edit array", async () => {
    const tool: any = createEditItemTool(ctx);
    const result = await tool.execute({
      itemName: "My Document",
      edits: [
        { oldText: "real", newText: "REAL" },
        { oldText: "same", newText: "same" },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/edits\[1\].*identical/);
  });
});
