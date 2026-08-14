import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";

import type { WorkspaceItem } from "#/features/workspaces/contracts";
import { createWorkspaceExportStream } from "#/features/workspaces/export/workspace-export-archive";
import { createFlashcardSetFromHtml } from "#/features/workspaces/flashcards/flashcard-content";

const baseItem = {
	workspaceId: "workspace-1",
	color: null,
	metadataJson: {},
	sortOrder: 0,
	createdAt: "2026-08-05T00:00:00.000Z",
	updatedAt: "2026-08-05T00:00:00.000Z",
} as const;

describe("workspace export archive", () => {
	it("preserves folders, converts documents to Markdown, and streams original files", async () => {
		const items: WorkspaceItem[] = [
			{
				...baseItem,
				id: "folder",
				parentId: null,
				type: "folder",
				name: "Research",
			},
			{
				...baseItem,
				id: "flashcards",
				parentId: "folder",
				type: "flashcard",
				name: "Key terms",
			},
			{
				...baseItem,
				id: "document",
				parentId: "folder",
				type: "document",
				name: "Notes",
			},
			{
				...baseItem,
				id: "file",
				parentId: "folder",
				type: "file",
				name: "source.pdf",
			},
			{ ...baseItem, id: "empty", parentId: null, type: "folder", name: "Empty" },
		];
		const archive = await new Response(
			createWorkspaceExportStream(items, {
				readDocument: vi.fn().mockReturnValue({
					type: "doc",
					content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }],
				}),
				readFile: vi.fn().mockResolvedValue(new Blob(["PDF bytes"]).stream()),
				readFlashcards: vi
					.fn()
					.mockReturnValue(
						createFlashcardSetFromHtml([{ front: "<p>Term</p>", back: "<p>Definition</p>" }]),
					),
			}),
		).arrayBuffer();
		const files = unzipSync(new Uint8Array(archive));

		expect(Object.keys(files).sort()).toEqual([
			"Empty/",
			"Research/",
			"Research/Key terms.md",
			"Research/Notes.md",
			"Research/source.pdf",
		]);
		expect(strFromU8(files["Research/Notes.md"]!)).toBe("Hello\n");
		expect(strFromU8(files["Research/Key terms.md"]!)).toContain("## Card 1\n\nTerm");
		expect(strFromU8(files["Research/source.pdf"]!)).toBe("PDF bytes");
	});

	it("keeps every item when Markdown extensions collide", async () => {
		const items: WorkspaceItem[] = [
			{
				...baseItem,
				id: "document-1",
				parentId: null,
				type: "document",
				name: "Notes",
			},
			{
				...baseItem,
				id: "document-2",
				parentId: null,
				type: "document",
				name: "Notes.md",
			},
			{
				...baseItem,
				id: "file",
				parentId: null,
				type: "file",
				name: "notes.md",
			},
		];
		const archive = await new Response(
			createWorkspaceExportStream(items, {
				readDocument: vi.fn().mockReturnValue({ type: "doc" }),
				readFile: vi.fn().mockResolvedValue(new Blob(["file"]).stream()),
				readFlashcards: vi.fn(),
			}),
		).arrayBuffer();

		expect(Object.keys(unzipSync(new Uint8Array(archive))).sort()).toEqual([
			"Notes (2).md",
			"Notes (3).md",
			"notes.md",
		]);
	});
});
