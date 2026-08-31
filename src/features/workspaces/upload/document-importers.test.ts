import { describe, expect, it } from "vitest";

import { WorkspaceFileConversionError } from "#/features/workspaces/conversion/errors";
import {
	importWorkspaceDocument,
	type WorkspaceDocumentImportFormat,
} from "#/features/workspaces/upload/document-importers";

function createFailingFormat(cause: unknown): WorkspaceDocumentImportFormat {
	return {
		id: "plain_text",
		label: "text",
		extensions: ["txt"],
		fileNames: [],
		mimes: ["text/plain"],
		importFile: () => Promise.reject(cause),
	};
}

describe("importWorkspaceDocument", () => {
	it("wraps an importer failure in a conversion error with a readable message", async () => {
		const cause = new Error("Imported table did not contain any rows.");

		await expect(
			importWorkspaceDocument(createFailingFormat(cause), new File([], "broken.csv")),
		).rejects.toMatchObject({
			failure: "conversion_failed",
			name: "WorkspaceFileConversionError",
			userMessage:
				"This file could not be imported. It may be damaged or in a format we can't read.",
			cause,
		} satisfies Partial<WorkspaceFileConversionError>);
	});

	it("returns the imported content when the importer succeeds", async () => {
		const format: WorkspaceDocumentImportFormat = {
			id: "markdown",
			label: "Markdown",
			extensions: ["md"],
			fileNames: [],
			mimes: ["text/markdown"],
			importFile: () =>
				Promise.resolve({ initialContent: "content", metadataJson: {}, name: "note" }),
		};

		await expect(
			importWorkspaceDocument(format, new File(["# note"], "note.md")),
		).resolves.toMatchObject({ name: "note" });
	});
});
