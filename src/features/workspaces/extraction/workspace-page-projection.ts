import { z } from "zod";

import { jsonValueSchema, type JsonValue } from "#/features/workspaces/contracts";
import type { MarkdownProjectionPage } from "#/features/workspaces/extraction/page-markdown-projection";
import { getWorkspaceFileItemObjectPrefix } from "#/features/workspaces/files/workspace-file-object-keys";
import {
	parseWorkspacePageRange,
	WorkspacePageSelectionError,
	type WorkspaceReadPages,
} from "#/features/workspaces/read-page-selection";
import { deleteR2Prefix } from "#/lib/r2";

const projectionSchemaVersion = 1;
const pageNumberWidth = 6;
const pageWriteConcurrency = 8;
const maxPageMarkdownBytes = 1024 * 1024;
const maxPageReadBytes = 2 * 1024 * 1024;

const workspacePageProjectionManifestPageSchema = z.object({
	markdownBytes: z.number().int().nonnegative(),
	pageNumber: z.number().int().positive(),
});

const workspacePageProjectionManifestSchema = z.object({
	createdAt: z.string(),
	hasExtractableText: z.boolean().optional(),
	itemId: z.string(),
	markdownBytes: z.number().int().nonnegative(),
	markdownLength: z.number().int().nonnegative(),
	metadata: z.record(z.string(), jsonValueSchema),
	pageCount: z.number().int().positive(),
	pages: z.array(workspacePageProjectionManifestPageSchema).optional(),
	provider: z.string(),
	providerMode: z.string(),
	runId: z.string(),
	schemaVersion: z.literal(projectionSchemaVersion),
	sourceHash: z.string(),
	workspaceId: z.string(),
});

type WorkspacePageProjectionManifest = z.infer<typeof workspacePageProjectionManifestSchema>;

type WorkspacePageProjectionManifestPage = z.infer<
	typeof workspacePageProjectionManifestPageSchema
>;

export async function writeWorkspacePageProjection(input: {
	bucket: R2Bucket;
	itemId: string;
	metadata?: Record<string, JsonValue>;
	pages: AsyncIterable<MarkdownProjectionPage> | Iterable<MarkdownProjectionPage>;
	provider: string;
	providerMode: string;
	runId: string;
	sourceHash: string;
	tier: "enhanced" | "fast";
	workspaceId: string;
}) {
	const prefix = getWorkspacePageProjectionPrefix(input);
	const encoder = new TextEncoder();
	const writes: Promise<void>[] = [];
	let lastPageNumber = 0;
	let markdownBytes = 0;
	let markdownLength = 0;
	const pages: WorkspacePageProjectionManifestPage[] = [];
	let usablePageCount = 0;

	try {
		for await (const rawPage of input.pages) {
			const page = normalizeProjectionPage(rawPage);
			if (page.pageNumber <= lastPageNumber) {
				throw new Error("Extracted pages must be ordered by unique, increasing page number.");
			}

			for (let pageNumber = lastPageNumber + 1; pageNumber < page.pageNumber; pageNumber += 1) {
				await schedulePageWrite(input.bucket, writes, prefix, pageNumber, "");
				pages.push({ markdownBytes: 0, pageNumber });
			}

			const pageBytes = encoder.encode(page.markdown).byteLength;
			if (pageBytes > maxPageMarkdownBytes) {
				throw new Error(`Extracted page ${page.pageNumber} exceeds the page size limit.`);
			}

			await schedulePageWrite(input.bucket, writes, prefix, page.pageNumber, page.markdown);
			pages.push({ markdownBytes: pageBytes, pageNumber: page.pageNumber });
			lastPageNumber = page.pageNumber;
			markdownBytes += pageBytes;
			markdownLength += page.markdown.length;
			if (page.markdown.length > 0) {
				usablePageCount += 1;
			}
		}

		await flushPageWrites(writes);
		// A page-less extraction means the provider gave us nothing to work with, which is a
		// genuine failure. Pages that all trim to empty Markdown, on the other hand, are a valid
		// outcome for scanned or image-only PDFs with no text layer: we keep the blank pages and
		// record that the file has no extractable text rather than rejecting the extraction.
		if (lastPageNumber === 0) {
			throw new Error("Extraction did not produce any pages.");
		}
		const hasExtractableText = usablePageCount > 0;

		const manifest: WorkspacePageProjectionManifest = {
			createdAt: new Date().toISOString(),
			hasExtractableText,
			itemId: input.itemId,
			markdownBytes,
			markdownLength,
			metadata: input.metadata ?? {},
			pageCount: lastPageNumber,
			pages,
			provider: input.provider,
			providerMode: input.providerMode,
			runId: input.runId,
			schemaVersion: projectionSchemaVersion,
			sourceHash: input.sourceHash,
			workspaceId: input.workspaceId,
		};
		const manifestObjectKey = `${prefix}manifest.json`;
		await input.bucket.put(manifestObjectKey, JSON.stringify(manifest), {
			httpMetadata: { contentType: "application/json" },
		});

		return { hasExtractableText, manifest, manifestObjectKey };
	} catch (error) {
		const cleanupErrors: unknown[] = [];
		try {
			await flushPageWrites(writes);
		} catch (cleanupError) {
			cleanupErrors.push(cleanupError);
		}

		try {
			await deleteR2Prefix(input.bucket, prefix);
		} catch (cleanupError) {
			cleanupErrors.push(cleanupError);
		}

		if (cleanupErrors.length > 0) {
			throw new AggregateError(
				[error, ...cleanupErrors],
				"Workspace page projection failed and cleanup did not complete.",
				{ cause: error },
			);
		}

		throw error;
	}
}

export async function readWorkspacePageProjection(input: {
	bucket: R2Bucket;
	expectedSourceHash: string;
	manifestObjectKey: string;
	pages?: string;
}): Promise<{ content: string; pages: WorkspaceReadPages }> {
	const manifest = await readWorkspacePageProjectionManifest(input.bucket, input.manifestObjectKey);
	if (manifest.sourceHash !== input.expectedSourceHash) {
		throw new Error("Workspace page projection source does not match its published revision.");
	}
	const requested = input.pages?.trim() || "1";
	const selectedPageNumbers = parseWorkspacePageRange(requested, manifest.pageCount);
	const pageMetadataByNumber = manifest.pages
		? new Map(manifest.pages.map((page) => [page.pageNumber, page] as const))
		: null;
	const selectedManifestBytes = pageMetadataByNumber
		? selectedPageNumbers.reduce(
				(total, pageNumber) =>
					total + requireManifestPage(pageMetadataByNumber, pageNumber).markdownBytes,
				0,
			)
		: null;
	if (selectedManifestBytes !== null && selectedManifestBytes > maxPageReadBytes) {
		throw new WorkspacePageSelectionError("page_selection_too_large");
	}

	const prefix = getManifestPrefix(input.manifestObjectKey);
	const pages: Array<{ markdown: string; pageNumber: number }> = [];
	let totalBytes = 0;

	// Consume each R2 body before opening the next one; never retain a batch of live responses.
	for (const pageNumber of selectedPageNumbers) {
		const object = await input.bucket.get(getWorkspacePageObjectKey(prefix, pageNumber));
		if (!object) {
			throw new Error(`Extracted page ${pageNumber} was not found.`);
		}

		totalBytes += object.size;
		if (totalBytes > maxPageReadBytes) {
			await object.body.cancel();
			throw new WorkspacePageSelectionError("page_selection_too_large");
		}

		const manifestPage = pageMetadataByNumber?.get(pageNumber);
		if (manifestPage && manifestPage.markdownBytes !== object.size) {
			await object.body.cancel();
			throw new Error(`Extracted page ${pageNumber} does not match its manifest.`);
		}

		pages.push({
			markdown: await object.text(),
			pageNumber,
		});
	}

	return {
		content: pages.map(formatProjectionPage).join("\n\n"),
		pages: {
			requested,
			returned: selectedPageNumbers,
			total: manifest.pageCount,
		},
	};
}

function requireManifestPage(
	pagesByNumber: ReadonlyMap<number, WorkspacePageProjectionManifestPage>,
	pageNumber: number,
) {
	const page = pagesByNumber.get(pageNumber);
	if (!page) {
		throw new Error(`Workspace page projection manifest is missing page ${pageNumber}.`);
	}
	return page;
}

async function readWorkspacePageProjectionManifest(
	bucket: R2Bucket,
	manifestObjectKey: string,
): Promise<WorkspacePageProjectionManifest> {
	const object = await bucket.get(manifestObjectKey);
	if (!object) {
		throw new Error("Workspace page projection manifest was not found.");
	}

	return parseWorkspacePageProjectionManifest(await object.json());
}

function getWorkspacePageProjectionPrefix(input: {
	itemId: string;
	runId: string;
	tier: "enhanced" | "fast";
	workspaceId: string;
}) {
	return `${getWorkspaceFileItemObjectPrefix(input)}extractions/${encodePathPart(input.runId)}/${input.tier}/`;
}

export function getWorkspacePageObjectKey(prefix: string, pageNumber: number) {
	return `${prefix}pages/${String(pageNumber).padStart(pageNumberWidth, "0")}.md`;
}

function parseWorkspacePageProjectionManifest(value: unknown): WorkspacePageProjectionManifest {
	const manifest = workspacePageProjectionManifestSchema.parse(value);
	if (manifest.pages && manifest.pages.length !== manifest.pageCount) {
		throw new Error("Workspace page projection manifest is invalid.");
	}
	for (const [index, page] of (manifest.pages ?? []).entries()) {
		if (page.pageNumber !== index + 1) {
			throw new Error("Workspace page projection manifest is invalid.");
		}
	}
	return manifest;
}

async function schedulePageWrite(
	bucket: R2Bucket,
	writes: Promise<void>[],
	prefix: string,
	pageNumber: number,
	markdown: string,
) {
	const write = bucket
		.put(getWorkspacePageObjectKey(prefix, pageNumber), markdown, {
			httpMetadata: { contentType: "text/markdown; charset=utf-8" },
		})
		.then(() => undefined);
	writes.push(write);

	if (writes.length >= pageWriteConcurrency) {
		await flushPageWrites(writes);
	}
}

async function flushPageWrites(writes: Promise<void>[]) {
	const results = await Promise.allSettled(writes.splice(0));
	const failure = results.find((result) => result.status === "rejected");

	if (failure?.status === "rejected") {
		throw failure.reason;
	}
}

function normalizeProjectionPage(page: MarkdownProjectionPage): MarkdownProjectionPage {
	if (!Number.isInteger(page.pageNumber) || page.pageNumber < 1) {
		throw new Error("Extracted page number is invalid.");
	}
	if (typeof page.markdown !== "string") {
		throw new Error("Extracted page Markdown is invalid.");
	}
	return page;
}

function formatProjectionPage(page: { markdown: string; pageNumber: number }) {
	return page.markdown
		? `## Page ${page.pageNumber}\n\n${page.markdown}`
		: `## Page ${page.pageNumber}`;
}

function getManifestPrefix(manifestObjectKey: string) {
	if (!manifestObjectKey.endsWith("/manifest.json")) {
		throw new Error("Workspace page projection manifest key is invalid.");
	}
	return manifestObjectKey.slice(0, -"manifest.json".length);
}

function encodePathPart(value: string) {
	return encodeURIComponent(value);
}
