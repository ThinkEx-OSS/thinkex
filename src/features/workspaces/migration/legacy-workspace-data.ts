import { Workspace as ShellWorkspace } from "@cloudflare/shell";
import { eq } from "drizzle-orm";
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
import {
	getAvailableWorkspaceItemName,
	getWorkspaceItemNameKey,
} from "#/features/workspaces/defaults";
import {
	createWorkspaceFilePreview,
	WORKSPACE_FILE_PREVIEW_CONTENT_TYPE,
} from "#/features/workspaces/files/workspace-file-preview";
import { getWorkspaceFilePreviewObjectKey } from "#/features/workspaces/files/workspace-file-object-keys";
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
	const destinationItemIds = new Map(
		items.map((item) => [item.id, getLegacyDestinationId(input.workspaceId, item.id)]),
	);
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

		const [workspace] = await dbContext.db
			.select({ id: workspaces.id })
			.from(workspaces)
			.where(eq(workspaces.id, input.workspaceId))
			.limit(1);
		if (!workspace) throw new Error("Import the legacy D1 workspace directory first.");

		const expectedItemIds = new Set(destinationItemIds.values());
		const existingItems = await dbContext.db
			.select({ id: workspaceItems.id })
			.from(workspaceItems)
			.where(eq(workspaceItems.workspaceId, input.workspaceId));
		if (existingItems.some((item) => !expectedItemIds.has(item.id))) {
			throw new Error("Workspace has Postgres items that were not created by the legacy import.");
		}

		const orderedItems = orderParentsBeforeChildren(items);
		const resolvedNames = new Map<string, string>();
		const siblingNames = new Map<string | null, string[]>();
		for (const item of orderedItems) {
			const existingNames = siblingNames.get(item.parent_id) ?? [];
			const name = getAvailableWorkspaceItemName({
				type: workspaceItemTypeSchema.parse(item.type),
				requestedName: item.name,
				existingNames,
			});
			existingNames.push(name);
			siblingNames.set(item.parent_id, existingNames);
			resolvedNames.set(item.id, name);
		}

		for (const item of orderedItems) {
			const itemId = getDestinationItemId(destinationItemIds, item.id);
			const result = await dbContext.db.transaction(async (transaction) => {
				const [existingItem] = await transaction
					.select({ id: workspaceItems.id })
					.from(workspaceItems)
					.where(eq(workspaceItems.id, itemId))
					.limit(1);
				if (existingItem) return null;

				const type = workspaceItemTypeSchema.parse(item.type);
				const name = resolvedNames.get(item.id);
				if (!name) throw new Error(`Legacy item ${item.id} did not have a resolved name.`);
				await transaction.insert(workspaceItems).values({
					id: itemId,
					workspaceId: input.workspaceId,
					parentId: item.parent_id
						? getDestinationItemId(destinationItemIds, item.parent_id)
						: null,
					type,
					name,
					nameKey: getWorkspaceItemNameKey(name),
					color: item.color,
					metadata: parseJsonRecord(item.metadata_json),
					sortOrder: item.sort_order,
					createdAt: new Date(item.created_at),
					updatedAt: new Date(item.updated_at),
				});

				let documents = 0;
				let files = 0;
				let pages = 0;
				if (type === "document") {
					const content = await shell.readFile(item.shell_path);
					if (content === null) {
						throw new Error(`Legacy document ${item.id} content was not found.`);
					}
					await transaction.insert(workspaceDocumentCheckpoints).values({
						itemId,
						content: remapDocumentItemIds(content, destinationItemIds),
					});
					documents = 1;
				}
				if (type === "file") {
					await importFileAsset({
						bucket: input.env.WORKSPACE_KERNEL_FILES,
						destinationItemId: itemId,
						env: input.env,
						item,
						projections,
						transaction,
						workspaceId: input.workspaceId,
					});
					files = 1;
				}
				for (const projection of projections.filter(
					(candidate) => candidate.item_id === item.id && candidate.format === "pages",
				)) {
					pages += await importExtraction({
						bucket: input.env.WORKSPACE_KERNEL_FILES,
						destinationItemId: itemId,
						projection,
						transaction,
						workspaceId: input.workspaceId,
					});
				}
				return { documents, files, pages };
			});
			if (result) {
				report.items += 1;
				report.documents += result.documents;
				report.files += result.files;
				report.pages += result.pages;
			}
		}

		await dbContext.db.transaction(async (transaction) => {
			for (const relation of relations) {
				await transaction
					.insert(workspaceItemRelations)
					.values({
						id: getLegacyDestinationId(input.workspaceId, relation.id),
						workspaceId: input.workspaceId,
						fromItemId: getDestinationItemId(destinationItemIds, relation.from_item_id),
						toItemId: getDestinationItemId(destinationItemIds, relation.to_item_id),
						kind: parseRelationKind(relation.kind),
						note: relation.note,
						createdAt: new Date(relation.created_at),
					})
					.onConflictDoNothing();
				report.relations += 1;
			}
		});

		await dbContext.db.transaction(async (transaction) => {
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
	destinationItemId: string;
	env: Cloudflare.Env;
	item: LegacyItemRow;
	projections: LegacyProjectionRow[];
	transaction: Transaction;
	workspaceId: string;
}) {
	const metadata = parseJsonRecord(input.item.metadata_json);
	const assetKind = workspaceFileAssetKindSchema.parse(metadata.assetKind);
	const preview = input.projections.find(
		(projection) => projection.item_id === input.item.id && projection.format === "preview",
	);
	if (!input.item.object_key) {
		throw new Error(`Legacy file ${input.item.id} is missing its source key.`);
	}
	const readyPreviewKey = preview?.status === "ready" ? preview.object_key : null;
	const previewObjectKey =
		readyPreviewKey ??
		getWorkspaceFilePreviewObjectKey({
			workspaceId: input.workspaceId,
			itemId: input.destinationItemId,
		});
	const [sourceObject, previewObject] = await Promise.all([
		input.bucket.head(input.item.object_key),
		readyPreviewKey ? input.bucket.head(readyPreviewKey) : null,
	]);
	if (!sourceObject) {
		throw new Error(`Legacy file ${input.item.id} references a missing source object.`);
	}
	let previewSizeBytes = previewObject?.size ?? 0;
	if (!previewObject || preview?.source_hash !== sourceObject.etag) {
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
			previewObjectKey,
			generatedPreview,
			{ httpMetadata: { contentType: WORKSPACE_FILE_PREVIEW_CONTENT_TYPE } },
		);
		if (!storedPreview) {
			throw new Error(`Legacy file ${input.item.id} preview could not be repaired.`);
		}
		previewSizeBytes = storedPreview.size;
	}

	await input.transaction.insert(workspaceFileAssets).values({
		itemId: input.destinationItemId,
		sourceObjectKey: input.item.object_key,
		sourceHash: sourceObject.etag,
		originalName: getString(metadata.originalName) ?? input.item.name,
		mimeType: getString(metadata.mimeType) ?? "application/octet-stream",
		sizeBytes: sourceObject.size,
		previewObjectKey,
		previewSizeBytes,
	});
}

async function importExtraction(input: {
	bucket: R2Bucket;
	destinationItemId: string;
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
				itemId: input.destinationItemId,
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
		itemId: input.destinationItemId,
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

function getLegacyDestinationId(workspaceId: string, legacyId: string) {
	// Legacy IDs were only unique inside one WorkspaceKernel Durable Object.
	// Postgres IDs are global, so retain the old identity while adding its scope.
	return `${workspaceId}:${legacyId}`;
}

function getDestinationItemId(itemIds: Map<string, string>, legacyId: string) {
	const itemId = itemIds.get(legacyId);
	if (!itemId) throw new Error(`Legacy item ${legacyId} was not available for migration.`);
	return itemId;
}

function remapDocumentItemIds(content: string, itemIds: Map<string, string>) {
	if (!content.includes('"itemId"')) return content;
	return `${JSON.stringify(remapItemIdFields(JSON.parse(content), itemIds))}\n`;
}

function remapItemIdFields(value: unknown, itemIds: Map<string, string>): unknown {
	if (Array.isArray(value)) return value.map((entry) => remapItemIdFields(entry, itemIds));
	if (value === null || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.entries(value).map(([key, entry]) => [
			key,
			key === "itemId" && typeof entry === "string"
				? (itemIds.get(entry) ?? entry)
				: remapItemIdFields(entry, itemIds),
		]),
	);
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
