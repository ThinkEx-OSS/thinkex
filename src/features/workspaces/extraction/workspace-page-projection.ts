import { z } from "zod";

import { jsonValueSchema, type JsonValue } from "#/features/workspaces/contracts";
import type { MarkdownProjectionPage } from "#/features/workspaces/extraction/page-markdown-projection";
import { getWorkspaceFileItemObjectPrefix } from "#/features/workspaces/files/workspace-file-object-keys";
import type { WorkspaceKernelClient } from "#/features/workspaces/kernel/workspace-kernel-access";
import type { UpsertWorkspaceKernelFileProjectionArgs } from "#/features/workspaces/kernel/workspace-kernel-types";
import {
	parseWorkspacePageRange,
	WorkspacePageSelectionError,
	type WorkspaceReadPages,
} from "#/features/workspaces/read-page-selection";
import { deleteR2Prefix } from "#/lib/r2";

// Version 1 stored one R2 object per page; version 2 stores every page concatenated
// in a single `pages.md` and serves individual pages with ranged reads, using the
// per-page byte counts the manifest already carries as the offset index. Old
// projections are derived data whose regeneration is billable, so both versions stay
// readable — v1 through the per-page path below, with no migration or backfill.
const projectionSchemaVersion = 2;
const pageNumberWidth = 6;
const maxPageMarkdownBytes = 1024 * 1024;
const maxPageReadBytes = 2 * 1024 * 1024;
// Bounds what a projection may hold in total, which also bounds what the writer and
// the search indexer materialize in memory. Sixteen times the densest document
// measured in production (a 1,527-page textbook at ~2.4 MB).
const maxProjectionMarkdownBytes = 16 * 1024 * 1024;

const workspacePageProjectionManifestPageSchema = z.object({
	markdownBytes: z.number().int().nonnegative(),
	pageNumber: z.number().int().positive(),
});

const workspacePageProjectionManifestBaseSchema = z.object({
	createdAt: z.string(),
	itemId: z.string(),
	markdownBytes: z.number().int().nonnegative(),
	markdownLength: z.number().int().nonnegative(),
	metadata: z.record(z.string(), jsonValueSchema),
	pageCount: z.number().int().positive(),
	provider: z.string(),
	providerMode: z.string(),
	runId: z.string(),
	sourceHash: z.string(),
	workspaceId: z.string(),
});

const workspacePageProjectionManifestSchema = z.discriminatedUnion("schemaVersion", [
	workspacePageProjectionManifestBaseSchema.extend({
		schemaVersion: z.literal(1),
		pages: z.array(workspacePageProjectionManifestPageSchema).optional(),
	}),
	workspacePageProjectionManifestBaseSchema.extend({
		schemaVersion: z.literal(2),
		pages: z.array(workspacePageProjectionManifestPageSchema),
	}),
]);

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
	const parts: Uint8Array<ArrayBuffer>[] = [];
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

			// Gaps become zero-byte spans: they keep page numbering stable without
			// storing anything.
			for (let pageNumber = lastPageNumber + 1; pageNumber < page.pageNumber; pageNumber += 1) {
				pages.push({ markdownBytes: 0, pageNumber });
			}

			const pageBytes = encoder.encode(page.markdown);
			if (pageBytes.byteLength > maxPageMarkdownBytes) {
				throw new Error(`Extracted page ${page.pageNumber} exceeds the page size limit.`);
			}
			if (markdownBytes + pageBytes.byteLength > maxProjectionMarkdownBytes) {
				throw new Error("Extracted document exceeds the projection size limit.");
			}

			parts.push(pageBytes);
			pages.push({ markdownBytes: pageBytes.byteLength, pageNumber: page.pageNumber });
			lastPageNumber = page.pageNumber;
			markdownBytes += pageBytes.byteLength;
			markdownLength += page.markdown.length;
			if (page.markdown.length > 0) {
				usablePageCount += 1;
			}
		}

		if (lastPageNumber === 0 || usablePageCount === 0) {
			throw new Error("Extraction did not produce usable page Markdown.");
		}

		await input.bucket.put(getWorkspacePagesObjectKey(prefix), new Blob(parts), {
			httpMetadata: { contentType: "text/markdown; charset=utf-8" },
		});

		const manifest: WorkspacePageProjectionManifest = {
			createdAt: new Date().toISOString(),
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

		return { manifest, manifestObjectKey };
	} catch (error) {
		try {
			await deleteR2Prefix(input.bucket, prefix);
		} catch (cleanupError) {
			throw new AggregateError(
				[error, cleanupError],
				"Workspace page projection failed and cleanup did not complete.",
				{ cause: error },
			);
		}

		throw error;
	}
}

export async function publishWorkspacePageProjection(input: {
	bucket: R2Bucket;
	kernel: Pick<WorkspaceKernelClient, "upsertFileProjection">;
	projection: Extract<UpsertWorkspaceKernelFileProjectionArgs, { status: "ready" }>;
}) {
	const outcome = await input.kernel.upsertFileProjection(input.projection);
	if (outcome === "discarded") {
		await deleteR2Prefix(input.bucket, getManifestPrefix(input.projection.objectKey));
	}

	return outcome;
}

export async function readWorkspacePageProjection(input: {
	bucket: R2Bucket;
	expectedSourceHash: string;
	manifestObjectKey: string;
	pages?: string;
}): Promise<{ content: string; emptyPages: number[]; pages: WorkspaceReadPages }> {
	const manifest = await readWorkspacePageProjectionManifest(input.bucket, input.manifestObjectKey);
	if (manifest.sourceHash !== input.expectedSourceHash) {
		throw new Error("Workspace page projection source does not match its published revision.");
	}
	const requested = input.pages?.trim() || "1";
	const selectedPageNumbers = parseWorkspacePageRange(requested, manifest.pageCount);
	const selectedManifestBytes = manifest.pages
		? sumManifestPageBytes(manifest.pages, selectedPageNumbers)
		: null;
	if (selectedManifestBytes !== null && selectedManifestBytes > maxPageReadBytes) {
		throw new WorkspacePageSelectionError("page_selection_too_large");
	}

	const prefix = getManifestPrefix(input.manifestObjectKey);
	const pages =
		manifest.schemaVersion === 2
			? await readPackedPages({
					bucket: input.bucket,
					manifest,
					prefix,
					selectedPageNumbers,
				})
			: await readLegacyPages({
					bucket: input.bucket,
					manifest,
					prefix,
					selectedPageNumbers,
				});

	return {
		content: pages.map(formatProjectionPage).join("\n\n"),
		// Surfaced so callers can distinguish a genuinely blank page from one the
		// fast extraction pass could not read yet.
		emptyPages: pages.filter((page) => page.markdown.length === 0).map((page) => page.pageNumber),
		pages: {
			requested,
			returned: selectedPageNumbers,
			total: manifest.pageCount,
		},
	};
}

export async function* iterateWorkspacePageProjection(input: {
	bucket: R2Bucket;
	expectedSourceHash: string;
	manifestObjectKey: string;
}): AsyncGenerator<{ markdown: string; pageNumber: number }> {
	const manifest = await readWorkspacePageProjectionManifest(input.bucket, input.manifestObjectKey);
	if (manifest.sourceHash !== input.expectedSourceHash) {
		throw new Error("Workspace page projection source does not match its published revision.");
	}

	const prefix = getManifestPrefix(input.manifestObjectKey);

	if (manifest.schemaVersion === 2) {
		// One read instead of one per page. The whole object is bounded by the write
		// limit, so materializing it is cheaper than a thousand sequential round trips.
		const object = await input.bucket.get(getWorkspacePagesObjectKey(prefix));
		if (!object) {
			throw new Error("Workspace page projection content was not found.");
		}

		const bytes = new Uint8Array(await object.arrayBuffer());
		const decoder = new TextDecoder();
		let offset = 0;
		for (const page of manifest.pages) {
			yield {
				markdown: decoder.decode(bytes.subarray(offset, offset + page.markdownBytes)),
				pageNumber: page.pageNumber,
			};
			offset += page.markdownBytes;
		}
		return;
	}

	const pageMetadataByNumber = manifest.pages
		? new Map(manifest.pages.map((page) => [page.pageNumber, page] as const))
		: null;

	for (let pageNumber = 1; pageNumber <= manifest.pageCount; pageNumber += 1) {
		const object = await getLegacyPageObject({
			bucket: input.bucket,
			pageMetadataByNumber,
			pageNumber,
			prefix,
		});

		yield {
			markdown: await object.text(),
			pageNumber,
		};
	}
}

/**
 * Serves a page selection from the packed `pages.md` object. Contiguous selected
 * pages coalesce into one ranged read; page offsets are the running sum of the
 * per-page byte counts in the manifest.
 */
async function readPackedPages(input: {
	bucket: R2Bucket;
	manifest: Extract<WorkspacePageProjectionManifest, { schemaVersion: 2 }>;
	prefix: string;
	selectedPageNumbers: number[];
}) {
	const spans = new Map<number, { offset: number; length: number }>();
	let offset = 0;
	for (const page of input.manifest.pages) {
		spans.set(page.pageNumber, { offset, length: page.markdownBytes });
		offset += page.markdownBytes;
	}

	const markdownByPage = new Map<number, string>();
	const decoder = new TextDecoder();
	const sorted = [...input.selectedPageNumbers].sort((left, right) => left - right);

	for (const run of coalesceContiguousRuns(sorted)) {
		const runSpans = run.map((pageNumber) => {
			const span = spans.get(pageNumber);
			if (!span) {
				throw new Error(`Workspace page projection manifest is missing page ${pageNumber}.`);
			}
			return span;
		});
		const runLength = runSpans.reduce((total, span) => total + span.length, 0);

		if (runLength === 0) {
			for (const pageNumber of run) {
				markdownByPage.set(pageNumber, "");
			}
			continue;
		}

		const object = await input.bucket.get(getWorkspacePagesObjectKey(input.prefix), {
			range: { offset: runSpans[0].offset, length: runLength },
		});
		if (!object) {
			throw new Error("Workspace page projection content was not found.");
		}

		const bytes = new Uint8Array(await object.arrayBuffer());
		if (bytes.byteLength !== runLength) {
			throw new Error("Workspace page projection content does not match its manifest.");
		}

		let runOffset = 0;
		for (const [index, pageNumber] of run.entries()) {
			const spanLength = runSpans[index].length;
			markdownByPage.set(
				pageNumber,
				decoder.decode(bytes.subarray(runOffset, runOffset + spanLength)),
			);
			runOffset += spanLength;
		}
	}

	return input.selectedPageNumbers.map((pageNumber) => ({
		markdown: markdownByPage.get(pageNumber) ?? "",
		pageNumber,
	}));
}

async function readLegacyPages(input: {
	bucket: R2Bucket;
	manifest: Extract<WorkspacePageProjectionManifest, { schemaVersion: 1 }>;
	prefix: string;
	selectedPageNumbers: number[];
}) {
	const pageMetadataByNumber = input.manifest.pages
		? new Map(input.manifest.pages.map((page) => [page.pageNumber, page] as const))
		: null;
	const pages: Array<{ markdown: string; pageNumber: number }> = [];
	let totalBytes = 0;

	// Consume each R2 body before opening the next one; never retain a batch of live
	// responses.
	for (const pageNumber of input.selectedPageNumbers) {
		const object = await getLegacyPageObject({
			bucket: input.bucket,
			pageMetadataByNumber,
			pageNumber,
			prefix: input.prefix,
		});

		totalBytes += object.size;
		if (totalBytes > maxPageReadBytes) {
			await object.body.cancel();
			throw new WorkspacePageSelectionError("page_selection_too_large");
		}

		pages.push({
			markdown: await object.text(),
			pageNumber,
		});
	}

	return pages;
}

async function getLegacyPageObject(input: {
	bucket: R2Bucket;
	pageMetadataByNumber: ReadonlyMap<number, WorkspacePageProjectionManifestPage> | null;
	pageNumber: number;
	prefix: string;
}) {
	const object = await input.bucket.get(getWorkspacePageObjectKey(input.prefix, input.pageNumber));
	if (!object) {
		throw new Error(`Extracted page ${input.pageNumber} was not found.`);
	}

	const manifestPage = input.pageMetadataByNumber?.get(input.pageNumber);
	if (manifestPage && manifestPage.markdownBytes !== object.size) {
		await object.body.cancel();
		throw new Error(`Extracted page ${input.pageNumber} does not match its manifest.`);
	}

	return object;
}

function sumManifestPageBytes(
	pages: readonly WorkspacePageProjectionManifestPage[],
	selectedPageNumbers: readonly number[],
) {
	const bytesByPage = new Map(pages.map((page) => [page.pageNumber, page.markdownBytes] as const));

	return selectedPageNumbers.reduce((total, pageNumber) => {
		const bytes = bytesByPage.get(pageNumber);
		if (bytes === undefined) {
			throw new Error(`Workspace page projection manifest is missing page ${pageNumber}.`);
		}
		return total + bytes;
	}, 0);
}

function coalesceContiguousRuns(sortedPageNumbers: readonly number[]) {
	const runs: number[][] = [];
	let currentRun: number[] = [];
	let previous: number | null = null;

	for (const pageNumber of sortedPageNumbers) {
		if (previous !== null && pageNumber === previous + 1) {
			currentRun.push(pageNumber);
		} else {
			currentRun = [pageNumber];
			runs.push(currentRun);
		}
		previous = pageNumber;
	}

	return runs;
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

function getWorkspacePagesObjectKey(prefix: string) {
	return `${prefix}pages.md`;
}

/** Key layout used by schema version 1, kept for projections published before v2. */
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
	if (
		manifest.schemaVersion === 2 &&
		manifest.pages.reduce((total, page) => total + page.markdownBytes, 0) !== manifest.markdownBytes
	) {
		throw new Error("Workspace page projection manifest is invalid.");
	}
	return manifest;
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
