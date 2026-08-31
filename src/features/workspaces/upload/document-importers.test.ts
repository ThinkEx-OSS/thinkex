import { describe, expect, it } from "vitest";

import { buildWorkspaceItemCreateBootstrap } from "#/features/workspaces/model/workspace-item-create-bootstrap";
import {
	type WorkspaceDocumentImportFormat,
	workspaceDocumentImportFormats,
} from "#/features/workspaces/upload/document-importers";

// U+0000 built at runtime so this source file stays free of control bytes.
const NUL = String.fromCharCode(0);

function importerById(id: WorkspaceDocumentImportFormat["id"]): WorkspaceDocumentImportFormat {
	const importer = workspaceDocumentImportFormats.find((format) => format.id === id);

	if (!importer) {
		throw new Error(`No import format registered for "${id}".`);
	}

	return importer;
}

describe("document importers", () => {
	// A NUL byte from a UTF-16 or "Unicode Text" export must never reach the
	// jsonb metadata write, which Postgres rejects with SQLSTATE 22P05.
	it.each([
		["csv", "data.csv", "text/csv", `first${NUL},last\nAda${NUL},Lovelace`],
		["tsv", "data.tsv", "text/tab-separated-values", `name\nAda${NUL}`],
		["markdown", "notes.md", "text/markdown", `# Title${NUL}\n\nBody${NUL}`],
		["code", "script.js", "text/javascript", `const answer = 42;${NUL}`],
		["plain_text", "notes.txt", "text/plain", `Hello${NUL} World`],
	] as const)("strips NUL bytes from %s imports", async (id, fileName, type, contents) => {
		const imported = await importerById(id).importFile(new File([contents], fileName, { type }));

		const bootstrap = buildWorkspaceItemCreateBootstrap({
			type: "document",
			metadataJson: imported.metadataJson,
			initialContent: imported.initialContent,
		});

		expect(bootstrap.initialContent).not.toContain(NUL);
		expect(JSON.stringify(bootstrap.metadataJson)).not.toContain(NUL);
	});
});
