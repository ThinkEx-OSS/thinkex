import { z } from "zod";

import { WORKSPACE_AI_CHAT_ATTACHMENT_POLICY } from "#/features/workspaces/ai/chat-attachment-policy";
import { assertPublicHttpUrl } from "#/features/workspaces/ai/web-access-policy";
import { normalizeChatImageToJpeg } from "#/features/workspaces/conversion/image-normalizer";
import { workspaceFileUploadFormats } from "#/features/workspaces/model/workspace-file/policy";
import { scrapePublicWebPage } from "#/integrations/firecrawl/scrape";

const MAX_PAGE_CHARACTERS = 100_000;
const MAX_REDIRECTS = 5;
const WEB_FETCH_TIMEOUT_MS = 20_000;
const supportedImageMediaTypes: ReadonlySet<string> = new Set(
	workspaceFileUploadFormats
		.filter((format) => format.assetKind === "image")
		.map((format) => format.mime),
);

const unsupportedWebResourceSchema = z.object({
	kind: z.literal("unsupported"),
	url: z.url(),
	mediaType: z.string().nullable(),
	reason: z.enum(["pdf", "media_type"]),
	message: z.string(),
});

export const webFetchOutputSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("page"),
		url: z.url(),
		content: z.string(),
		truncated: z.boolean(),
	}),
	unsupportedWebResourceSchema,
]);

export const webImageFetchOutputSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("image"),
		url: z.url(),
		mediaType: z.literal("image/jpeg"),
		sizeBytes: z.number().int().positive(),
	}),
	unsupportedWebResourceSchema,
]);

export type WebFetchOutput = z.output<typeof webFetchOutputSchema>;
export type WebImageFetchOutput = z.output<typeof webImageFetchOutputSchema>;

export interface FreshWebImage {
	bytes: ArrayBuffer;
	mediaType: "image/jpeg";
}

export async function fetchPublicWebPage(input: {
	abortSignal?: AbortSignal;
	env: Cloudflare.Env;
	url: string;
}): Promise<WebFetchOutput> {
	const requestedUrl = assertPublicHttpUrl(input.url);
	if (requestedUrl.pathname.toLowerCase().endsWith(".pdf")) {
		return unsupportedPdf(requestedUrl.toString()).output;
	}

	const url = requestedUrl.toString();
	const content = await scrapePublicWebPage({
		abortSignal: input.abortSignal,
		env: input.env,
		url,
	});
	return {
		kind: "page",
		url,
		content: content.slice(0, MAX_PAGE_CHARACTERS),
		truncated: content.length > MAX_PAGE_CHARACTERS,
	};
}

export async function fetchPublicWebImage(input: {
	abortSignal?: AbortSignal;
	env: Cloudflare.Env;
	url: string;
}): Promise<{ image?: FreshWebImage; output: WebImageFetchOutput }> {
	const requestedUrl = assertPublicHttpUrl(input.url);
	const { response, url } = await fetchImageFollowingPublicRedirects(
		requestedUrl,
		input.abortSignal,
	);
	const mediaType = normalizeMediaType(response.headers.get("content-type"));

	if (mediaType === "application/pdf") {
		await response.body?.cancel();
		return unsupportedPdf(url, mediaType);
	}

	if (!mediaType || !supportedImageMediaTypes.has(mediaType)) {
		await response.body?.cancel();
		return {
			output: {
				kind: "unsupported",
				url,
				mediaType,
				reason: "media_type",
				message: mediaType
					? `This URL returned unsupported content type ${mediaType}.`
					: "This URL did not return a supported content type.",
			},
		};
	}

	if (!response.body) {
		throw new Error("The image response did not include a body.");
	}
	await assertContentLengthWithinLimit(response, WORKSPACE_AI_CHAT_ATTACHMENT_POLICY.maxFileSize);
	const normalized = await normalizeChatImageToJpeg(
		input.env,
		limitReadableStream(response.body, WORKSPACE_AI_CHAT_ATTACHMENT_POLICY.maxFileSize),
		WORKSPACE_AI_CHAT_ATTACHMENT_POLICY.maxNormalizedFileSize,
	);

	return {
		image: { bytes: normalized.bytes, mediaType: normalized.contentType },
		output: {
			kind: "image",
			url,
			mediaType: normalized.contentType,
			sizeBytes: normalized.sizeBytes,
		},
	};
}

/**
 * Downloads a public image for import into workspace storage: same SSRF and
 * redirect policy as the AI's image fetch, but the original bytes rather than
 * a model-sized re-encode. Callers validate the media type against the upload
 * formats — this only guarantees "public, an image by content type, bounded".
 */
export async function fetchPublicImageForImport(input: {
	abortSignal?: AbortSignal;
	maxBytes: number;
	url: string;
}): Promise<{ bytes: ArrayBuffer; fileName: string; mediaType: string }> {
	const requestedUrl = assertPublicHttpUrl(input.url);
	const { response, url } = await fetchImageFollowingPublicRedirects(
		requestedUrl,
		input.abortSignal,
	);
	const mediaType = normalizeMediaType(response.headers.get("content-type"));

	if (!mediaType?.startsWith("image/")) {
		await response.body?.cancel();
		throw new Error("This URL did not return an image.");
	}
	if (!response.body) {
		throw new Error("The image response did not include a body.");
	}
	await assertContentLengthWithinLimit(response, input.maxBytes);

	const bytes = await new Response(
		limitReadableStream(response.body, input.maxBytes),
	).arrayBuffer();
	const finalUrl = new URL(url);
	const lastSegment = decodeURIComponent(finalUrl.pathname.split("/").filter(Boolean).at(-1) ?? "");
	const extension = mediaType.split("/")[1]?.split("+")[0] ?? "png";
	const fileName = /\.[A-Za-z0-9]{2,5}$/.test(lastSegment)
		? lastSegment
		: `${lastSegment || "Imported image"}.${extension}`;

	return { bytes, fileName, mediaType };
}

async function fetchImageFollowingPublicRedirects(input: URL, abortSignal?: AbortSignal) {
	let url = input;
	const signal = abortSignal
		? AbortSignal.any([abortSignal, AbortSignal.timeout(WEB_FETCH_TIMEOUT_MS)])
		: AbortSignal.timeout(WEB_FETCH_TIMEOUT_MS);

	for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
		const response = await fetch(url, {
			headers: { Accept: "image/*,*/*;q=0.1" },
			redirect: "manual",
			signal,
		});
		if (response.status >= 300 && response.status < 400) {
			const location = response.headers.get("location");
			await response.body?.cancel();
			if (!location) throw new Error("The URL redirected without a destination.");
			if (redirects === MAX_REDIRECTS) throw new Error("The URL redirected too many times.");
			url = assertPublicHttpUrl(new URL(location, url).toString());
			continue;
		}
		if (!response.ok) {
			await response.body?.cancel();
			throw new Error(`The URL returned HTTP ${response.status}.`);
		}

		return { response, url: url.toString() };
	}

	throw new Error("The URL redirected too many times.");
}

function normalizeMediaType(value: string | null) {
	return value?.split(";", 1)[0]?.trim().toLowerCase() || null;
}

async function assertContentLengthWithinLimit(response: Response, maxBytes: number) {
	const value = response.headers.get("content-length");
	if (value === null) return;
	const size = Number(value);
	if (Number.isSafeInteger(size) && size > maxBytes) {
		await response.body?.cancel();
		throw new Error(`The image exceeds the ${maxBytes}-byte input limit.`);
	}
}

function unsupportedPdf(url: string, mediaType: string | null = "application/pdf") {
	return {
		output: {
			kind: "unsupported" as const,
			url,
			mediaType,
			reason: "pdf" as const,
			message:
				"Public PDFs are not supported here. Ask the user to upload the PDF to the workspace, then read it with workspace_read_items.",
		},
	};
}

function limitReadableStream(body: ReadableStream<Uint8Array>, maxBytes: number) {
	const reader = body.getReader();
	let totalBytes = 0;

	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			const { done, value } = await reader.read();
			if (done) {
				controller.close();
				return;
			}
			totalBytes += value.byteLength;
			if (totalBytes > maxBytes) {
				await reader.cancel("Image input exceeds the byte limit.");
				controller.error(new Error(`The image exceeds the ${maxBytes}-byte input limit.`));
				return;
			}
			controller.enqueue(value);
		},
		cancel(reason) {
			return reader.cancel(reason);
		},
	});
}
