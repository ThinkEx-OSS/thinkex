import { Workspace as ShellWorkspace } from "@cloudflare/shell";
import { count, eq } from "drizzle-orm";
import { z } from "zod";

import {
	legacyDataMigrations,
	workspaceDocumentCheckpoints,
	workspaceFileAssets,
	workspaceItemExtractions,
	workspaceItemPages,
	workspaceItemRelations,
	workspaceItems,
	workspaces,
} from "#/db/schema";
import { createDbContext } from "#/db/server";
import type { JsonValue } from "#/features/workspaces/contracts";
import { workspaceItemTypeSchema } from "#/features/workspaces/contracts";
import { getWorkspaceItemNameKey } from "#/features/workspaces/defaults";
import {
	createWorkspaceFilePreview,
	WORKSPACE_FILE_PREVIEW_CONTENT_TYPE,
} from "#/features/workspaces/files/workspace-file-preview";
import { workspaceFileAssetKindSchema } from "#/features/workspaces/model/workspace-file";
import { putFixedLengthR2Object } from "#/lib/r2";

const migrationScopePrefix = "workspace:";
const legacyShellInlineThresholdBytes = 1_500_000;
const pageBatchSize = 100;

type LegacySql = <T = Record<string, unknown>>(
	strings: TemplateStringsArray,
	...values: (string | number | boolean | null)[]
) => T[];

type LegacyItemRow = {
	id: string;
	parent_id: string | null;
	type: string;
	name: string;
	color: string | null;
	metadata_json: string;
	sort_order: number;
	shell_path: string;
	object_key: string | null;
	created_at: number;
	updated_at: number;
	deleted_at: number | null;
};

type LegacyProjectionRow = {
	item_id: string;
	format: string;
	status: string;
	provider: string | null;
	provider_mode: string | null;
	object_key: string | null;
	error_message: string | null;
	source_hash: string | null;
	metadata_json: string;
	updated_at: number;
};

type LegacyRelationRow = {
	id: string;
	from_item_id: string;
	to_item_id: string;
	kind: string;
	note: string;
	created_at: number;
};

export interface LegacyWorkspaceMigrationReport {
	status: "already_migrated" | "migrated" | "no_legacy_state";
	workspaceId: string;
	revision: number;
	items: number;
	documents: number;
	files: number;
	relations: number;
	pages: number;
}

/**
 * One-time bridge from the retained WorkspaceKernel SQLite state to Postgres.
 * It deliberately lives outside the live-room class so the whole bridge can be
 * deleted after production verification.
 */
export async function migrateLegacyWorkspaceData(input: {
	env: Cloudflare.Env;
	storage: DurableObjectStorage;
	workspaceId: string;
	sql: LegacySql;
}): Promise<LegacyWorkspaceMigrationReport> {
	const hasLegacyState = hasLegacyKernelTables(input.sql);
	const items = hasLegacyState
		? input.sql<LegacyItemRow>`
				SELECT * FROM kernel_items
				WHERE deleted_at IS NULL AND type NOT IN ('flashcard', 'quiz')
				ORDER BY created_at ASC
			`
		: [];
	const activeItemIds = new Set(items.map((item) => item.id));
	const projections = hasLegacyState
		? input.sql<LegacyProjectionRow>`
				SELECT * FROM kernel_item_projections ORDER BY created_at ASC
			`.filter((projection) => activeItemIds.has(projection.item_id))
		: [];
	const relations = hasLegacyState
		? input.sql<LegacyRelationRow>`
				SELECT * FROM kernel_relations ORDER BY created_at ASC
			`.filter(
				(relation) =>
					activeItemIds.has(relation.from_item_id) && activeItemIds.has(relation.to_item_id),
			)
		: [];
	const revision = hasLegacyState ? readLegacyRevision(input.sql) : 0;
	const report = createReport(
		input.workspaceId,
		hasLegacyState ? "migrated" : "no_legacy_state",
		revision,
	);
	const dbContext = await createDbContext(input.env);

	try {
		if (await hasMigrationMarker(dbContext.db, input.workspaceId)) {
			return { ...report, status: "already_migrated" };
		}

		const shell = new ShellWorkspace({
			sql: input.storage.sql,
			r2: input.env.WORKSPACE_KERNEL_FILES,
			inlineThreshold: legacyShellInlineThresholdBytes,
			namespace: "workspace_kernel_files",
			name: () => input.workspaceId,
		});

		await dbContext.db.transaction(async (transaction) => {
			const [workspace] = await transaction
				.select({ id: workspaces.id })
				.from(workspaces)
				.where(eq(workspaces.id, input.workspaceId))
				.limit(1);
			if (!workspace) throw new Error("Import the legacy D1 workspace directory first.");

			const [destination] = await transaction
				.select({ value: count() })
				.from(workspaceItems)
				.where(eq(workspaceItems.workspaceId, input.workspaceId));
			if ((destination?.value ?? 0) > 0) {
				throw new Error("Workspace already has Postgres items without a migration marker.");
			}

			for (const item of orderParentsBeforeChildren(items)) {
				const type = workspaceItemTypeSchema.parse(item.type);
				await transaction.insert(workspaceItems).values({
					id: item.id,
					workspaceId: input.workspaceId,
					parentId: item.parent_id,
					type,
					name: item.name,
					nameKey: getWorkspaceItemNameKey(item.name),
					color: item.color,
					metadata: parseJsonRecord(item.metadata_json),
					sortOrder: item.sort_order,
					createdAt: new Date(item.created_at),
					updatedAt: new Date(item.updated_at),
				});
				report.items += 1;

				if (type === "document") {
					const content = await shell.readFile(item.shell_path);
					if (content === null) {
						throw new Error(`Legacy document ${item.id} content was not found.`);
					}
					await transaction.insert(workspaceDocumentCheckpoints).values({
						itemId: item.id,
						content,
					});
					report.documents += 1;
				}
			}

			for (const item of items.filter((candidate) => candidate.type === "file")) {
				await importFileAsset({
					bucket: input.env.WORKSPACE_KERNEL_FILES,
					env: input.env,
					item,
					projections,
					transaction,
				});
				report.files += 1;
			}

			for (const relation of relations) {
				await transaction.insert(workspaceItemRelations).values({
					id: relation.id,
					workspaceId: input.workspaceId,
					fromItemId: relation.from_item_id,
					toItemId: relation.to_item_id,
					kind: parseRelationKind(relation.kind),
					note: relation.note,
					createdAt: new Date(relation.created_at),
				});
				report.relations += 1;
			}

			for (const projection of projections.filter((candidate) => candidate.format === "pages")) {
				report.pages += await importExtraction({
					bucket: input.env.WORKSPACE_KERNEL_FILES,
					projection,
					transaction,
					workspaceId: input.workspaceId,
				});
			}

			await transaction
				.update(workspaces)
				.set({ revision })
				.where(eq(workspaces.id, input.workspaceId));
			await transaction.insert(legacyDataMigrations).values({
				scope: `${migrationScopePrefix}${input.workspaceId}`,
				completedAt: new Date(),
			});
		});

		return report;
	} finally {
		await dbContext.dispose();
	}
}

function hasLegacyKernelTables(sql: LegacySql) {
	return (
		sql<{ name: string }>`
			SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'kernel_items' LIMIT 1
		`.length > 0
	);
}

function readLegacyRevision(sql: LegacySql) {
	const row = sql<{ value: string }>`
		SELECT value FROM kernel_meta WHERE key = 'workspace_revision' LIMIT 1
	`[0];
	const revision = Number(row?.value ?? 0);
	if (!Number.isSafeInteger(revision) || revision < 0) {
		throw new Error("Legacy workspace revision is invalid.");
	}
	return revision;
}

function orderParentsBeforeChildren(items: LegacyItemRow[]) {
	const remaining = new Map(items.map((item) => [item.id, item]));
	const ordered: LegacyItemRow[] = [];
	while (remaining.size > 0) {
		const ready = Array.from(remaining.values()).filter(
			(item) => item.parent_id === null || !remaining.has(item.parent_id),
		);
		if (ready.length === 0) throw new Error("Legacy workspace item tree contains a cycle.");
		for (const item of ready) {
			remaining.delete(item.id);
			ordered.push(item);
		}
	}
	return ordered;
}

async function importFileAsset(input: {
	bucket: R2Bucket;
	env: Cloudflare.Env;
	item: LegacyItemRow;
	projections: LegacyProjectionRow[];
	transaction: Transaction;
}) {
	const metadata = parseJsonRecord(input.item.metadata_json);
	const assetKind = workspaceFileAssetKindSchema.parse(metadata.assetKind);
	const preview = input.projections.find(
		(projection) => projection.item_id === input.item.id && projection.format === "preview",
	);
	if (!input.item.object_key || preview?.status !== "ready" || !preview.object_key) {
		throw new Error(`Legacy file ${input.item.id} is missing its source or preview.`);
	}
	const [sourceObject, previewObject] = await Promise.all([
		input.bucket.head(input.item.object_key),
		input.bucket.head(preview.object_key),
	]);
	if (!sourceObject || !previewObject) {
		throw new Error(`Legacy file ${input.item.id} references missing R2 objects.`);
	}
	let previewSizeBytes = previewObject.size;
	if (preview.source_hash && preview.source_hash !== sourceObject.etag) {
		const source = await input.bucket.get(input.item.object_key);
		if (!source) {
			throw new Error(`Legacy file ${input.item.id} source disappeared during preview repair.`);
		}
		const generatedPreview = await createWorkspaceFilePreview(input.env, {
			assetKind,
			body: source.body,
			contentType: getString(metadata.mimeType) ?? "application/octet-stream",
			sizeBytes: source.size,
		});
		const storedPreview = await putFixedLengthR2Object(
			input.bucket,
			preview.object_key,
			generatedPreview,
			{ httpMetadata: { contentType: WORKSPACE_FILE_PREVIEW_CONTENT_TYPE } },
		);
		if (!storedPreview) {
			throw new Error(`Legacy file ${input.item.id} preview could not be repaired.`);
		}
		previewSizeBytes = storedPreview.size;
	}

	await input.transaction.insert(workspaceFileAssets).values({
		itemId: input.item.id,
		sourceObjectKey: input.item.object_key,
		sourceHash: sourceObject.etag,
		originalName: getString(metadata.originalName) ?? input.item.name,
		mimeType: getString(metadata.mimeType) ?? "application/octet-stream",
		sizeBytes: sourceObject.size,
		previewObjectKey: preview.object_key,
		previewSizeBytes,
	});
}

async function importExtraction(input: {
	bucket: R2Bucket;
	projection: LegacyProjectionRow;
	transaction: Transaction;
	workspaceId: string;
}) {
	let status: "failed" | "processing" | "ready" = parseExtractionStatus(input.projection.status);
	let errorMessage = input.projection.error_message;
	const metadata = parseJsonRecord(input.projection.metadata_json);
	let pages = 0;
	let markdownLength = 0;
	let tier: "enhanced" | "fast" | null = null;
	const readyProjection =
		input.projection.object_key && input.projection.source_hash
			? {
					expectedSourceHash: input.projection.source_hash,
					manifestObjectKey: input.projection.object_key,
				}
			: null;

	if (status === "ready" && !readyProjection) {
		status = "failed";
		errorMessage = "Legacy extraction was incomplete and must be regenerated.";
	}

	if (status === "ready" && readyProjection) {
		tier = resolveExtractionTier({
			manifestObjectKey: readyProjection.manifestObjectKey,
			metadata,
			providerMode: input.projection.provider_mode,
		});
		let batch: Array<{
			itemId: string;
			pageNumber: number;
			markdown: string;
			markdownBytes: number;
		}> = [];
		for await (const page of iterateLegacyProjectionPages({
			bucket: input.bucket,
			...readyProjection,
		})) {
			batch.push({
				itemId: input.projection.item_id,
				pageNumber: page.pageNumber,
				markdown: page.markdown,
				markdownBytes: new TextEncoder().encode(page.markdown).byteLength,
			});
			pages += 1;
			markdownLength += page.markdown.length;
			if (batch.length === pageBatchSize) {
				await input.transaction.insert(workspaceItemPages).values(batch);
				batch = [];
			}
		}
		if (batch.length > 0) await input.transaction.insert(workspaceItemPages).values(batch);
	}

	await input.transaction.insert(workspaceItemExtractions).values({
		workspaceId: input.workspaceId,
		itemId: input.projection.item_id,
		status,
		provider: input.projection.provider,
		providerMode: input.projection.provider_mode,
		tier,
		errorMessage,
		sourceHash: input.projection.source_hash,
		metadata: status === "ready" ? { ...metadata, markdownLength, pageCount: pages } : metadata,
		updatedAt: new Date(input.projection.updated_at),
	});
	return pages;
}

const legacyManifestSchema = z.object({
	schemaVersion: z.union([z.literal(1), z.literal(2)]),
	sourceHash: z.string(),
	pageCount: z.number().int().positive(),
	markdownBytes: z.number().int().nonnegative(),
	pages: z
		.array(
			z.object({
				pageNumber: z.number().int().positive(),
				markdownBytes: z.number().int().nonnegative(),
			}),
		)
		.optional(),
});

async function* iterateLegacyProjectionPages(input: {
	bucket: R2Bucket;
	expectedSourceHash: string;
	manifestObjectKey: string;
}) {
	const manifestObject = await input.bucket.get(input.manifestObjectKey);
	if (!manifestObject) throw new Error("Legacy extraction manifest was not found.");
	const manifest = legacyManifestSchema.parse(await manifestObject.json());
	if (manifest.sourceHash !== input.expectedSourceHash) {
		throw new Error("Legacy extraction does not match its source.");
	}
	const prefix = getManifestPrefix(input.manifestObjectKey);
	if (manifest.schemaVersion === 2) {
		if (!manifest.pages || manifest.pages.length !== manifest.pageCount) {
			throw new Error("Legacy extraction manifest is invalid.");
		}
		const content = await input.bucket.get(`${prefix}pages.md`);
		if (!content) throw new Error("Legacy extraction pages were not found.");
		const bytes = new Uint8Array(await content.arrayBuffer());
		if (bytes.byteLength !== manifest.markdownBytes) {
			throw new Error("Legacy extraction pages do not match their manifest.");
		}
		let offset = 0;
		for (const [index, page] of manifest.pages.entries()) {
			if (page.pageNumber !== index + 1)
				throw new Error("Legacy extraction page order is invalid.");
			yield {
				pageNumber: page.pageNumber,
				markdown: new TextDecoder().decode(bytes.subarray(offset, offset + page.markdownBytes)),
			};
			offset += page.markdownBytes;
		}
		if (offset !== manifest.markdownBytes) {
			throw new Error("Legacy extraction manifest byte totals are invalid.");
		}
		return;
	}

	for (let pageNumber = 1; pageNumber <= manifest.pageCount; pageNumber += 1) {
		const object = await input.bucket.get(
			`${prefix}pages/${String(pageNumber).padStart(6, "0")}.md`,
		);
		if (!object) throw new Error(`Legacy extraction page ${pageNumber} was not found.`);
		yield { pageNumber, markdown: await object.text() };
	}
}

async function hasMigrationMarker(db: Database, workspaceId: string) {
	const [marker] = await db
		.select({ scope: legacyDataMigrations.scope })
		.from(legacyDataMigrations)
		.where(eq(legacyDataMigrations.scope, `${migrationScopePrefix}${workspaceId}`))
		.limit(1);
	return Boolean(marker);
}

function createReport(
	workspaceId: string,
	status: LegacyWorkspaceMigrationReport["status"],
	revision = 0,
): LegacyWorkspaceMigrationReport {
	return {
		status,
		workspaceId,
		revision,
		items: 0,
		documents: 0,
		files: 0,
		relations: 0,
		pages: 0,
	};
}

function parseJsonRecord(value: string): Record<string, JsonValue>;
function parseJsonRecord(value: unknown): Record<string, JsonValue> | null;
function parseJsonRecord(value: unknown) {
	try {
		const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
		return getJsonRecord(parsed) ?? {};
	} catch {
		return {};
	}
}

function getJsonRecord(value: unknown): Record<string, JsonValue> | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, JsonValue>)
		: null;
}

function getString(value: JsonValue | undefined) {
	return typeof value === "string" ? value : null;
}

function parseRelationKind(value: string) {
	if (value === "derived_from" || value === "references") return value;
	throw new Error(`Unsupported legacy relation kind: ${value}`);
}

function parseExtractionStatus(value: string) {
	if (value === "processing" || value === "ready" || value === "failed") return value;
	throw new Error(`Unsupported legacy extraction status: ${value}`);
}

function resolveExtractionTier(input: {
	manifestObjectKey: string;
	metadata: Record<string, JsonValue>;
	providerMode: string | null;
}) {
	// Newer projections encode the tier in their R2 key. Early projections did
	// not always do so, but the fast pass has always identified itself as either
	// provisional or provider mode `fast`; every other published projection is
	// the final enhanced pass.
	const objectKey = input.manifestObjectKey;
	const match = objectKey.match(/\/(fast|enhanced)\/manifest\.json$/);
	if (match) return match[1] as "enhanced" | "fast";
	return input.metadata.provisional === true || input.providerMode === "fast" ? "fast" : "enhanced";
}

function getManifestPrefix(objectKey: string) {
	if (!objectKey.endsWith("/manifest.json")) {
		throw new Error("Legacy extraction manifest key is invalid.");
	}
	return objectKey.slice(0, -"manifest.json".length);
}

type Database = Awaited<ReturnType<typeof createDbContext>>["db"];
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
