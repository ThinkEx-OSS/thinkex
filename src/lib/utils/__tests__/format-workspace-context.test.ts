import { describe, it, expect } from "vitest";
import { formatItemContent } from "@/lib/utils/format-workspace-context";
import { replace } from "@/lib/utils/edit-replace";
import type { Item, DocumentData } from "@/lib/workspace-state/types";

function mkDocumentItem(
  markdown: string,
  sources?: DocumentData["sources"],
  overrides: Partial<Item> = {},
): Item {
  return {
    id: "doc-1",
    name: "Test Document",
    type: "document",
    subtitle: "",
    data: { markdown, ...(sources?.length ? { sources } : {}) },
    ...overrides,
  };
}

describe("formatItemContent (document)", () => {
  it("returns trimmed markdown body", () => {
    const item = mkDocumentItem("  # Hello\n\nBody  ");
    expect(formatItemContent(item)).toBe("# Hello\n\nBody");
  });

  it("appends Sources block when present", () => {
    const item = mkDocumentItem("Intro", [
      { title: "Wiki", url: "https://example.com" },
    ]);
    const out = formatItemContent(item);
    expect(out.startsWith("Intro")).toBe(true);
    expect(out).toContain("Sources:");
    expect(out).toContain("Wiki");
    expect(out).toContain("https://example.com");
  });
});

describe("formatItemContent aligns with workspace_read document markdown for edit", () => {
  it("workspace_read uses raw markdown only; replace works on that string", () => {
    const md = "# Title\n\nFirst para\n\nSecond para";
    const item = mkDocumentItem(md);
    const body = (item.data as DocumentData).markdown ?? "";
    expect(body).toBe(md);

    const newContent = replace(body, "First para", "Updated para");
    expect(newContent).toContain("Updated para");
    expect(newContent).not.toContain("First para");
  });
});
