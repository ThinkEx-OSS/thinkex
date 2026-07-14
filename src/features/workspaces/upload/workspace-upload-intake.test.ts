import { describe, expect, it } from "vitest";

import { workspaceFileUploadLimits } from "#/features/workspaces/model/workspace-file";
import {
	getWorkspaceUploadSelectionValidationError,
	validateWorkspaceUpload,
} from "#/features/workspaces/upload/workspace-upload-intake";

describe("workspace upload intake", () => {
	it("accepts a binary file at the 200 MB limit", () => {
		expect(
			validateWorkspaceUpload({
				contentType: "application/pdf",
				fileName: "research.pdf",
				sizeBytes: workspaceFileUploadLimits.maxFileBytes,
			}),
		).toMatchObject({ ok: true, plan: { kind: "file" } });
	});

	it("bounds document imports before they are materialized in Worker memory", () => {
		expect(
			validateWorkspaceUpload({
				contentType: "text/csv",
				fileName: "large.csv",
				sizeBytes: workspaceFileUploadLimits.maxDocumentImportBytes + 1,
			}),
		).toMatchObject({
			error: { code: "SELECTION_TOO_LARGE", status: 413 },
			ok: false,
		});
	});

	it("enforces the total selection limit separately from the per-file limit", () => {
		const file = new File(["x"], "second.pdf", { type: "application/pdf" });
		const error = getWorkspaceUploadSelectionValidationError({
			acceptedCount: 1,
			file,
			selectionBytes: workspaceFileUploadLimits.maxSelectionBytes,
		});

		expect(error).toMatchObject({ code: "SELECTION_TOO_LARGE", status: 413 });
	});
});
