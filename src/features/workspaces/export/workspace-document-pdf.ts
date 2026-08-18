import { normalizeWorkspaceItemName } from "#/features/workspaces/defaults";
import { getDocumentSessionFromEnv } from "#/features/workspaces/document-session-access";
import { parseTiptapDocumentJson } from "#/features/workspaces/documents/tiptap-document";
import { renderWorkspaceDocumentPdfHtml } from "#/features/workspaces/export/workspace-document-pdf-html";
import { readWorkspaceFilePreview } from "#/features/workspaces/persistence/workspace-files";
import { WorkspaceForbiddenError } from "#/features/workspaces/server/permissions";
import { getWorkspacePageForUser } from "#/features/workspaces/server/queries";
import { getWorkspaceItemContentKind } from "#/features/workspaces/contracts";

export class WorkspaceDocumentNotFoundError extends Error {}

const pdfImageTagPattern = /<img\b[^>]*\bdata-item-id="([^"]+)"[^>]*>/g;

/**
 * The PDF renderer runs with JavaScript off and no session cookie, so image
 * nodes get their preview bytes inlined as data URLs. A missing or unfinished
 * preview leaves the tag src-less, which prints as its alt text.
 */
async function inlineWorkspaceImagesForPdf(
	html: string,
	input: { env: Cloudflare.Env; workspaceId: string },
): Promise<string> {
	const itemIds = Array.from(
		new Set(Array.from(html.matchAll(pdfImageTagPattern), (match) => match[1] ?? "")),
	).filter(Boolean);
	if (itemIds.length === 0) return html;

	const dataUrls = new Map<string, string>();
	await Promise.all(
		itemIds.map(async (itemId) => {
			try {
				const preview = await readWorkspaceFilePreview({
					itemId,
					workspaceId: input.workspaceId,
				});
				if (!preview.objectKey) return;
				const object = await input.env.WORKSPACE_FILES.get(preview.objectKey);
				if (!object) return;
				const bytes = new Uint8Array(await object.arrayBuffer());
				dataUrls.set(itemId, `data:${preview.contentType};base64,${encodeBase64(bytes)}`);
			} catch {
				// The document still exports; this image just falls back to alt text.
			}
		}),
	);

	return html.replace(pdfImageTagPattern, (tag, itemId: string) => {
		const dataUrl = dataUrls.get(itemId);
		return dataUrl ? tag.replace(/^<img\b/, `<img src="${dataUrl}"`) : tag;
	});
}

function encodeBase64(bytes: Uint8Array) {
	let binary = "";
	const chunkSize = 0x8000;
	for (let offset = 0; offset < bytes.length; offset += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
	}
	return btoa(binary);
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
	const html = await inlineWorkspaceImagesForPdf(
		await renderWorkspaceDocumentPdfHtml(parseTiptapDocumentJson(snapshot.content)),
		{ env: input.env, workspaceId: input.workspaceId },
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
