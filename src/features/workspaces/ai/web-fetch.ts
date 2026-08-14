import { browserMarkdown, type QuickActionBinding } from "@cloudflare/think/tools/browser";
import { z } from "zod";

import { WORKSPACE_AI_CHAT_ATTACHMENT_POLICY } from "#/features/workspaces/ai/chat-attachment-policy";
import { assertPublicHttpUrl } from "#/features/workspaces/ai/web-access-policy";
import { normalizeChatImageToJpeg } from "#/features/workspaces/conversion/image-normalizer";
import { workspaceFileUploadFormats } from "#/features/workspaces/model/workspace-file/policy";

const MAX_PAGE_CHARACTERS = 100_000;
const MAX_REDIRECTS = 5;
const WEB_FETCH_TIMEOUT_MS = 20_000;
const supportedImageMediaTypes: ReadonlySet<string> = new Set(
	workspaceFileUploadFormats
		.filter((format) => format.assetKind === "image")
		.map((format) => format.mime),
);

export const webFetchOutputSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("page"),
		url: z.string().url(),
		content: z.string(),
		truncated: z.boolean(),
	}),
	z.object({
		kind: z.literal("image"),
		url: z.string().url(),
		mediaType: z.literal("image/jpeg"),
		sizeBytes: z.number().int().positive(),
	}),
	z.object({
		kind: z.literal("unsupported"),
		url: z.string().url(),
		mediaType: z.string().nullable(),
		reason: z.enum(["pdf", "media_type"]),
		message: z.string(),
	}),
]);

export type WebFetchOutput = z.output<typeof webFetchOutputSchema>;

export interface FreshWebImage {
	bytes: ArrayBuffer;
	mediaType: "image/jpeg";
}

export async function fetchPublicWebResource(input: {
	abortSignal?: AbortSignal;
	browser: QuickActionBinding;
	env: Cloudflare.Env;
	url: string;
}): Promise<{ image?: FreshWebImage; output: WebFetchOutput }> {
	const { response, url } = await fetchFollowingPublicRedirects(input.url, input.abortSignal);
	const mediaType = normalizeMediaType(response.headers.get("content-type"));

	if (mediaType === "text/html" || mediaType === "application/xhtml+xml") {
		await response.body?.cancel();
		const content = await browserMarkdown(input.browser, { url });
		return {
			output: {
				kind: "page",
				url,
				content: content.slice(0, MAX_PAGE_CHARACTERS),
				truncated: content.length > MAX_PAGE_CHARACTERS,
			},
		};
	}

	if (mediaType === "application/pdf") {
		await response.body?.cancel();
		return {
			output: {
				kind: "unsupported",
				url,
				mediaType,
				reason: "pdf",
				message:
					"Public PDFs are not supported here. Ask the user to upload the PDF to the workspace, then read it with workspace_read_items.",
			},
		};
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
	assertContentLengthWithinLimit(
		response.headers.get("content-length"),
		WORKSPACE_AI_CHAT_ATTACHMENT_POLICY.maxFileSize,
	);
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

async function fetchFollowingPublicRedirects(input: string, abortSignal?: AbortSignal) {
	let url = assertPublicHttpUrl(input);
	const signal = abortSignal
		? AbortSignal.any([abortSignal, AbortSignal.timeout(WEB_FETCH_TIMEOUT_MS)])
		: AbortSignal.timeout(WEB_FETCH_TIMEOUT_MS);

	for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
		const response = await fetch(url, {
			headers: { Accept: "text/html,image/*;q=0.9,*/*;q=0.1" },
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

function assertContentLengthWithinLimit(value: string | null, maxBytes: number) {
	if (value === null) return;
	const size = Number(value);
	if (Number.isSafeInteger(size) && size > maxBytes) {
		throw new Error(`The image exceeds the ${maxBytes}-byte input limit.`);
	}
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
