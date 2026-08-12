import { normalizeWorkspaceItemName } from "#/features/workspaces/defaults";
import { getDocumentSessionFromEnv } from "#/features/workspaces/document-session-access";
import { parseTiptapDocumentJson } from "#/features/workspaces/documents/tiptap-document";
import { renderWorkspaceDocumentPdfHtml } from "#/features/workspaces/export/workspace-document-pdf-html";
import { WorkspaceForbiddenError } from "#/features/workspaces/server/permissions";
import { getWorkspacePageForUser } from "#/features/workspaces/server/queries";
import { getWorkspaceItemContentKind } from "#/features/workspaces/contracts";

export class WorkspaceDocumentNotFoundError extends Error {}

export async function createWorkspaceDocumentPdf(input: {
	env: Cloudflare.Env;
	itemId: string;
	userId: string;
	workspaceId: string;
}) {
	const page = await getWorkspacePageForUser(input.workspaceId, input.userId);
	if (!page) {
		throw new WorkspaceForbiddenError();
	}

	const item = page.items.find((candidate) => candidate.id === input.itemId);
	if (!item || getWorkspaceItemContentKind(item.type) !== "document") {
		throw new WorkspaceDocumentNotFoundError();
	}

	const session = await getDocumentSessionFromEnv(input.env, {
		itemId: input.itemId,
		workspaceId: input.workspaceId,
	});
	const snapshot = await session.readDocumentSnapshot();
	const html = await renderWorkspaceDocumentPdfHtml(parseTiptapDocumentJson(snapshot.content));
	const response = await input.env.BROWSER.quickAction("pdf", {
		html,
		cacheTTL: 0,
		emulateMediaType: "print",
		pdfOptions: {
			displayHeaderFooter: false,
			format: "letter",
			margin: {
				bottom: "0.7in",
				left: "0.75in",
				right: "0.75in",
				top: "0.7in",
			},
			printBackground: true,
		},
		setJavaScriptEnabled: false,
	});

	if (!response.ok || !response.body) {
		await response.body?.cancel();
		throw new Error(`Browser Run PDF generation failed with status ${response.status}.`);
	}

	const normalizedName = normalizeWorkspaceItemName(item.name, "Document");
	return {
		contentLength: response.headers.get("content-length"),
		fileName: normalizedName.toLowerCase().endsWith(".pdf")
			? normalizedName
			: `${normalizedName}.pdf`,
		stream: response.body,
	};
}
