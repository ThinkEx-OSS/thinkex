import { normalizeWorkspaceItemName } from "#/features/workspaces/defaults";
import { getDocumentSessionFromEnv } from "#/features/workspaces/document-session-access";
import { parseTiptapDocumentJson } from "#/features/workspaces/documents/tiptap-document";
import { renderWorkspaceDocumentPdfHtml } from "#/features/workspaces/export/workspace-document-pdf-html";
import { readWorkspaceFilePreview } from "#/features/workspaces/persistence/workspace-files";
import { encodeBase64 } from "#/lib/binary";
import { WorkspaceForbiddenError } from "#/features/workspaces/server/permissions";
import { getWorkspacePageForUser } from "#/features/workspaces/server/queries";
import { getWorkspaceItemContentKind } from "#/features/workspaces/contracts";

export class WorkspaceDocumentNotFoundError extends Error {}

/** Resolves image items to preview data URLs, once each per export. */
function createImageDataUrlResolver(env: Cloudflare.Env, workspaceId: string) {
	const dataUrls = new Map<string, Promise<string | null>>();
	return (itemId: string) => {
		const cached = dataUrls.get(itemId);
		if (cached) return cached;
		const dataUrl = (async () => {
			const preview = await readWorkspaceFilePreview({ itemId, workspaceId });
			if (!preview.objectKey) return null;
			const object = await env.WORKSPACE_FILES.get(preview.objectKey);
			if (!object) return null;
			const bytes = new Uint8Array(await object.arrayBuffer());
			return `data:${preview.contentType};base64,${encodeBase64(bytes)}`;
			// The document still exports when this fails; the image prints as alt text.
		})().catch(() => null);
		dataUrls.set(itemId, dataUrl);
		return dataUrl;
	};
}

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
	const html = await renderWorkspaceDocumentPdfHtml(
		parseTiptapDocumentJson(snapshot.content),
		createImageDataUrlResolver(input.env, input.workspaceId),
	);
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
