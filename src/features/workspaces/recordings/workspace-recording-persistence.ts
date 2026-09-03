import { and, asc, eq, sql } from "drizzle-orm";

import {
	workspaceItemContents,
	workspaceItems,
	workspaceRecordingSegments,
	workspaceRecordings,
} from "#/db/schema";
import { withDb } from "#/db/server";
import { getWorkspaceItemNameKey } from "#/features/workspaces/defaults";
import { createWorkspaceItemRefKey } from "#/features/workspaces/locations/workspace-location";
import {
	assertWorkspaceParentIsValid,
	getNextWorkspaceSortOrder,
	lockWorkspaceForActor,
	nextWorkspaceRevision,
	requireActiveWorkspaceItem,
	resolveWorkspaceItemName,
	type QueryExecutor,
	toWorkspaceMetadata,
	withWorkspaceTransaction,
} from "#/features/workspaces/persistence/workspace-postgres-support";
import { notifyWorkspaceRoom } from "#/features/workspaces/realtime/workspace-room-notifier";
import { parseWorkspaceRecordingManifest } from "#/features/workspaces/recordings/workspace-recording";
import {
	parseWorkspaceRecordingTranscript,
	stringifyWorkspaceRecordingTranscript,
	type WorkspaceRecordingTranscript,
} from "#/features/workspaces/recordings/workspace-recording-transcript";
import { workspaceItemContentValues } from "#/features/workspaces/search/workspace-search-text";

type RecordingRow = typeof workspaceRecordings.$inferSelect;
type SegmentRow = typeof workspaceRecordingSegments.$inferSelect;

/** A known recording request failure translated by the HTTP boundary. */
export class WorkspaceRecordingError extends Error {
	readonly _tag = "WorkspaceRecordingError" as const;

	constructor(
		readonly statusCode: 400 | 404 | 409,
		readonly code: "INVALID_RECORDING" | "RECORDING_NOT_FOUND" | "RECORDING_NOT_READY",
		message: string,
	) {
		super(message);
	}
}

/** Create a first-class recording item and its upload state. */
export async function createWorkspaceRecording(
	env: Cloudflare.Env,
	input: {
		readonly itemId: string;
		readonly workspaceId: string;
		readonly ownerId: string;
		readonly parentId: string | null;
		readonly name: string;
		readonly mimeType: string;
	},
) {
	const command = await withWorkspaceTransaction(async (transaction) => {
		await lockWorkspaceForActor(transaction, input.workspaceId, input.ownerId);
		await assertWorkspaceParentIsValid(transaction, input.workspaceId, input.parentId);
		const name = await resolveWorkspaceItemName(transaction, input.workspaceId, {
			itemId: input.itemId,
			parentId: input.parentId,
			requestedName: input.name.trim() || "Lecture recording",
			type: "recording",
		});
		if (name.status !== "resolved") throw new Error("Recording name was not resolved.");

		await transaction.insert(workspaceItems).values({
			id: input.itemId,
			workspaceId: input.workspaceId,
			parentId: input.parentId,
			type: "recording",
			name: name.name,
			nameKey: getWorkspaceItemNameKey(name.name),
			refKey: createWorkspaceItemRefKey(),
			color: null,
			metadata: { recordingDurationMs: 0, recordingStatus: "recording" },
			sortOrder: await getNextWorkspaceSortOrder(transaction, input.workspaceId, input.parentId),
		});
		const emptyTranscript = stringifyWorkspaceRecordingTranscript({ cues: [] });
		await transaction.insert(workspaceItemContents).values({
			itemId: input.itemId,
			...workspaceItemContentValues("recording", emptyTranscript),
		});
		await transaction.insert(workspaceRecordings).values({
			itemId: input.itemId,
			workspaceId: input.workspaceId,
			ownerId: input.ownerId,
			mimeType: input.mimeType,
		});
		return {
			item: await requireActiveWorkspaceItem(transaction, input.workspaceId, input.itemId),
			recording: await requireWorkspaceRecording(transaction, input),
			revision: await nextWorkspaceRevision(transaction, input.workspaceId),
		};
	});
	await notifyWorkspaceRoom(env, {
		type: "workspace.items.upserted",
		workspaceId: input.workspaceId,
		revision: command.revision,
		items: [command.item],
	});
	return {
		...projectWorkspaceRecording(command.item, null, [], command.recording),
		revision: command.revision,
	};
}

/** Read a recording, transcript, and acknowledged segments after boundary authorization. */
export async function readWorkspaceRecording(input: {
	readonly itemId: string;
	readonly workspaceId: string;
}) {
	return await withDb(async (db) => {
		const recording = await requireWorkspaceRecording(db, input);
		const [item, transcript, segments] = await Promise.all([
			requireActiveWorkspaceItem(db, input.workspaceId, input.itemId),
			readRecordingTranscriptContent(db, input.itemId),
			db
				.select()
				.from(workspaceRecordingSegments)
				.where(eq(workspaceRecordingSegments.recordingItemId, input.itemId))
				.orderBy(asc(workspaceRecordingSegments.sequence)),
		]);
		return projectWorkspaceRecording(item, transcript, segments, recording);
	});
}

/** Read an existing segment before an idempotent upload retry. */
export async function readWorkspaceRecordingSegment(input: {
	readonly itemId: string;
	readonly workspaceId: string;
	readonly userId: string;
	readonly sequence: number;
}) {
	return await withDb(async (db) => {
		await requireOwnedWorkspaceRecording(db, input);
		const [segment] = await db
			.select()
			.from(workspaceRecordingSegments)
			.where(
				and(
					eq(workspaceRecordingSegments.recordingItemId, input.itemId),
					eq(workspaceRecordingSegments.sequence, input.sequence),
				),
			)
			.limit(1);
		return segment ?? null;
	});
}

/** Read one segment after the HTTP boundary authorizes workspace access. */
export async function readWorkspaceRecordingSegmentForPlayback(input: {
	readonly itemId: string;
	readonly workspaceId: string;
	readonly sequence: number;
}) {
	return await withDb(async (db) => {
		await requireWorkspaceRecording(db, input);
		const [segment] = await db
			.select()
			.from(workspaceRecordingSegments)
			.where(
				and(
					eq(workspaceRecordingSegments.recordingItemId, input.itemId),
					eq(workspaceRecordingSegments.sequence, input.sequence),
				),
			)
			.limit(1);
		return segment ?? null;
	});
}

/** Record one immutable R2 segment after the object write succeeds. */
export async function recordWorkspaceRecordingSegment(input: {
	readonly itemId: string;
	readonly workspaceId: string;
	readonly userId: string;
	readonly sequence: number;
	readonly objectKey: string;
	readonly mimeType: string;
	readonly sizeBytes: number;
	readonly durationMs: number;
	readonly etag: string;
}) {
	return await withDb(async (db) => {
		const recording = await requireOwnedWorkspaceRecording(db, input);
		if (recording.status !== "recording") {
			throw new WorkspaceRecordingError(
				409,
				"INVALID_RECORDING",
				"This recording has already been finalized.",
			);
		}
		if (recording.mimeType !== input.mimeType) {
			throw new WorkspaceRecordingError(
				409,
				"INVALID_RECORDING",
				"Recording segments must use the format selected when recording started.",
			);
		}
		const [segment] = await db
			.insert(workspaceRecordingSegments)
			.values({
				recordingItemId: input.itemId,
				sequence: input.sequence,
				objectKey: input.objectKey,
				mimeType: input.mimeType,
				sizeBytes: input.sizeBytes,
				durationMs: input.durationMs,
				etag: input.etag,
			})
			.onConflictDoNothing()
			.returning();
		return segment ?? (await requireSegment(db, input.itemId, input.sequence));
	});
}

/** Validate and transition an uploaded recording into durable processing. */
export async function finalizeWorkspaceRecording(input: {
	readonly itemId: string;
	readonly workspaceId: string;
	readonly userId: string;
	readonly expectedSegmentCount: number;
	readonly workflowId: string;
}) {
	return await withDb(async (db) =>
		db.transaction(async (transaction) => {
			await transaction.execute(
				sql`select item_id from ${workspaceRecordings} where ${workspaceRecordings.itemId} = ${input.itemId} for update`,
			);
			const recording = await requireOwnedWorkspaceRecording(transaction, input);
			if (recording.status === "failed") {
				throw new WorkspaceRecordingError(
					409,
					"INVALID_RECORDING",
					"This recording failed during transcription.",
				);
			}
			if (recording.status === "ready" || recording.status === "processing") {
				if (recording.expectedSegmentCount !== input.expectedSegmentCount) {
					throw new WorkspaceRecordingError(
						409,
						"INVALID_RECORDING",
						"This recording was finalized with a different segment count.",
					);
				}
				return recording;
			}
			const segments = await transaction
				.select({
					durationMs: workspaceRecordingSegments.durationMs,
					sequence: workspaceRecordingSegments.sequence,
					sizeBytes: workspaceRecordingSegments.sizeBytes,
				})
				.from(workspaceRecordingSegments)
				.where(eq(workspaceRecordingSegments.recordingItemId, input.itemId))
				.orderBy(asc(workspaceRecordingSegments.sequence));
			const manifest = parseWorkspaceRecordingManifest({
				expectedSegmentCount: input.expectedSegmentCount,
				segments,
			});
			if (!manifest.ok) {
				throw new WorkspaceRecordingError(409, "RECORDING_NOT_READY", manifest.message);
			}
			const [updated] = await transaction
				.update(workspaceRecordings)
				.set({
					durationMs: manifest.durationMs,
					expectedSegmentCount: input.expectedSegmentCount,
					workflowId: input.workflowId,
					status: "processing",
					errorMessage: null,
					updatedAt: new Date(),
				})
				.where(eq(workspaceRecordings.itemId, input.itemId))
				.returning();
			if (!updated) throw new Error("Recording was not finalized.");
			await updateRecordingItemMetadata(transaction, input.itemId, {
				durationMs: manifest.durationMs,
				status: "processing",
			});
			return updated;
		}),
	);
}

/** Read the immutable manifest used by the transcription Workflow. */
export async function readWorkspaceRecordingForTranscription(itemId: string) {
	return await withDb(async (db) => {
		const [recording] = await db
			.select()
			.from(workspaceRecordings)
			.where(eq(workspaceRecordings.itemId, itemId))
			.limit(1);
		if (!recording) {
			throw new WorkspaceRecordingError(404, "RECORDING_NOT_FOUND", "Recording not found.");
		}
		const segments = await db
			.select()
			.from(workspaceRecordingSegments)
			.where(eq(workspaceRecordingSegments.recordingItemId, itemId))
			.orderBy(asc(workspaceRecordingSegments.sequence));
		return { recording, segments };
	});
}

/** Publish time-aligned transcript cues and mark the recording ready exactly once. */
export async function publishWorkspaceRecordingTranscript(
	env: Cloudflare.Env,
	input: { readonly itemId: string; readonly transcript: WorkspaceRecordingTranscript },
) {
	const publication = await withWorkspaceTransaction(async (transaction) => {
		await transaction.execute(
			sql`select item_id from ${workspaceRecordings} where ${workspaceRecordings.itemId} = ${input.itemId} for update`,
		);
		const [recording] = await transaction
			.select()
			.from(workspaceRecordings)
			.where(eq(workspaceRecordings.itemId, input.itemId))
			.limit(1);
		if (!recording) {
			throw new WorkspaceRecordingError(404, "RECORDING_NOT_FOUND", "Recording not found.");
		}
		const [itemRow] = await transaction
			.select()
			.from(workspaceItems)
			.where(
				and(
					eq(workspaceItems.id, input.itemId),
					eq(workspaceItems.workspaceId, recording.workspaceId),
				),
			)
			.limit(1);
		if (!itemRow) return { outcome: "discarded" as const };
		if (recording.status === "ready") return { outcome: "ready" as const };

		const content = stringifyWorkspaceRecordingTranscript(input.transcript);
		await transaction
			.update(workspaceItemContents)
			.set(workspaceItemContentValues("recording", content))
			.where(eq(workspaceItemContents.itemId, input.itemId));
		await transaction
			.update(workspaceRecordings)
			.set({ status: "ready", errorMessage: null, updatedAt: new Date() })
			.where(eq(workspaceRecordings.itemId, input.itemId));
		await transaction
			.update(workspaceItems)
			.set({
				metadata: {
					...toWorkspaceMetadata(itemRow.metadata),
					recordingDurationMs: recording.durationMs,
					recordingStatus: "ready",
				},
				updatedAt: new Date(),
			})
			.where(eq(workspaceItems.id, input.itemId));
		return {
			outcome: "applied" as const,
			item: await requireActiveWorkspaceItem(transaction, recording.workspaceId, input.itemId),
			revision: await nextWorkspaceRevision(transaction, recording.workspaceId),
		};
	});
	if (publication.outcome === "applied") {
		await notifyWorkspaceRoom(env, {
			type: "workspace.items.upserted",
			workspaceId: publication.item.workspaceId,
			revision: publication.revision,
			items: [publication.item],
		});
	}
	return publication.outcome;
}

/** Set a failed recording state without replacing a ready transcript. */
export async function failWorkspaceRecording(env: Cloudflare.Env, itemId: string, message: string) {
	const failure = await withWorkspaceTransaction(async (transaction) => {
		const [recording] = await transaction
			.select()
			.from(workspaceRecordings)
			.where(eq(workspaceRecordings.itemId, itemId))
			.limit(1);
		if (!recording || recording.status !== "processing") return null;
		await transaction
			.update(workspaceRecordings)
			.set({ status: "failed", errorMessage: message.slice(0, 500), updatedAt: new Date() })
			.where(eq(workspaceRecordings.itemId, itemId));
		await updateRecordingItemMetadata(transaction, itemId, {
			durationMs: recording.durationMs,
			status: "failed",
		});
		return {
			item: await requireActiveWorkspaceItem(transaction, recording.workspaceId, itemId),
			revision: await nextWorkspaceRevision(transaction, recording.workspaceId),
		};
	});
	if (failure) {
		await notifyWorkspaceRoom(env, {
			type: "workspace.items.upserted",
			workspaceId: failure.item.workspaceId,
			revision: failure.revision,
			items: [failure.item],
		});
	}
}

/** Read only the stored transcript for AI and export callers. */
export async function readWorkspaceRecordingTranscript(itemId: string) {
	return await withDb((db) => readRecordingTranscriptContent(db, itemId));
}

async function requireWorkspaceRecording(
	db: QueryExecutor,
	input: { readonly itemId: string; readonly workspaceId: string },
) {
	const [recording] = await db
		.select()
		.from(workspaceRecordings)
		.where(
			and(
				eq(workspaceRecordings.itemId, input.itemId),
				eq(workspaceRecordings.workspaceId, input.workspaceId),
			),
		)
		.limit(1);
	if (!recording) {
		throw new WorkspaceRecordingError(404, "RECORDING_NOT_FOUND", "Recording not found.");
	}
	return recording;
}

async function requireOwnedWorkspaceRecording(
	db: QueryExecutor,
	input: { readonly itemId: string; readonly workspaceId: string; readonly userId: string },
) {
	const [recording] = await db
		.select()
		.from(workspaceRecordings)
		.where(
			and(
				eq(workspaceRecordings.itemId, input.itemId),
				eq(workspaceRecordings.workspaceId, input.workspaceId),
				eq(workspaceRecordings.ownerId, input.userId),
			),
		)
		.limit(1);
	if (!recording) {
		throw new WorkspaceRecordingError(404, "RECORDING_NOT_FOUND", "Recording not found.");
	}
	return recording;
}

async function readRecordingTranscriptContent(db: QueryExecutor, itemId: string) {
	const [content] = await db
		.select({ content: workspaceItemContents.content })
		.from(workspaceItemContents)
		.where(eq(workspaceItemContents.itemId, itemId))
		.limit(1);
	return content ? parseWorkspaceRecordingTranscript(content.content) : null;
}

async function requireSegment(db: QueryExecutor, itemId: string, sequence: number) {
	const [segment] = await db
		.select()
		.from(workspaceRecordingSegments)
		.where(
			and(
				eq(workspaceRecordingSegments.recordingItemId, itemId),
				eq(workspaceRecordingSegments.sequence, sequence),
			),
		)
		.limit(1);
	if (!segment) throw new Error("Recording segment was not saved.");
	return segment;
}

async function updateRecordingItemMetadata(
	db: QueryExecutor,
	itemId: string,
	input: { readonly durationMs: number; readonly status: "failed" | "processing" | "ready" },
) {
	const [item] = await db
		.select()
		.from(workspaceItems)
		.where(eq(workspaceItems.id, itemId))
		.limit(1);
	if (!item) throw new Error("Recording item not found.");
	await db
		.update(workspaceItems)
		.set({
			metadata: {
				...toWorkspaceMetadata(item.metadata),
				recordingDurationMs: input.durationMs,
				recordingStatus: input.status,
			},
			updatedAt: new Date(),
		})
		.where(eq(workspaceItems.id, itemId));
}

function projectWorkspaceRecording(
	item: Awaited<ReturnType<typeof requireActiveWorkspaceItem>>,
	transcript: WorkspaceRecordingTranscript | null,
	segments: readonly SegmentRow[],
	recording?: RecordingRow,
) {
	return {
		item,
		mimeType: recording?.mimeType ?? "",
		status: recording?.status ?? "recording",
		durationMs: recording?.durationMs ?? 0,
		errorMessage: recording?.errorMessage ?? null,
		receivedSequences: segments.map((segment) => segment.sequence),
		segments: segments.map((segment) => ({
			durationMs: segment.durationMs,
			sequence: segment.sequence,
			sizeBytes: segment.sizeBytes,
		})),
		transcript: transcript ?? { cues: [] },
	};
}
