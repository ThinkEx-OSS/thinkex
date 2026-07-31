import { describe, expect, it } from "vitest";

import type { WorkspaceSearchResult } from "#/features/workspaces/search/workspace-search-contract";
import {
	createWorkspaceSearchModelOutput,
	createWorkspaceSearchReferences,
} from "#/features/workspaces/search/workspace-search-references";

describe("workspace search references", () => {
	it("maps document hits to items and PDF hits to physical pages", () => {
		const results = searchResults();
		const references = createWorkspaceSearchReferences(results);

		expect(references.map(({ location }) => location)).toEqual([
			{ itemId: "document-1", kind: "item", version: 1 },
			{ itemId: "file-1", kind: "pdf-page", pageNumber: 12, version: 1 },
		]);
	});

	it("projects short references without exposing durable item IDs", () => {
		const results = searchResults();
		const modelOutput = createWorkspaceSearchModelOutput({
			failed: [],
			references: createWorkspaceSearchReferences(results),
			results,
			status: "ready",
		});

		expect(modelOutput.results.every((result) => "reference" in result)).toBe(true);
		expect(JSON.stringify(modelOutput)).not.toContain("document-1");
		expect(JSON.stringify(modelOutput)).not.toContain("file-1");
	});
});

function searchResults(): WorkspaceSearchResult[] {
	return [
		{
			excerpt: "Document hit",
			itemId: "document-1",
			location: { endLine: 8, kind: "lines", startLine: 4 },
			path: "/Notes",
			title: "Notes",
			type: "document",
		},
		{
			assetKind: "pdf",
			excerpt: "PDF hit",
			itemId: "file-1",
			location: { kind: "page", pageNumber: 12 },
			path: "/Report.pdf",
			title: "Report",
			type: "file",
		},
	];
}
