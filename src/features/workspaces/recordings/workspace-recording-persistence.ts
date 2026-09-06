import { and, eq, sql } from "drizzle-orm";

import { workspaceItemContents, workspaceItems, workspaceRecordings } from "#/db/schema";
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
	withWorkspaceTransaction,
} from "#/features/workspaces/persistence/workspace-postgres-support";
import { notifyWorkspaceRoom } from "#/features/workspaces/realtime/workspace-room-notifier";
import {
	parseWorkspaceRecordingTranscript,
	stringifyWorkspaceRecordingTranscript,
	type WorkspaceRecordingTranscript,
} from "#/features/workspaces/recordings/workspace-recording-transcript";
import { workspaceItemContentValues } from "#/features/workspaces/search/workspace-search-text";

type RecordingRow = typeof workspaceRecordings.$inferSelect;

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
			requestedName: input.name.trim() || "Recording",
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
		...projectWorkspaceRecording(command.item, null, command.recording),
		revision: command.revision,
	};
}

/** Read playback and transcript state after boundary authorization. */
export async function readWorkspaceRecording(input: {
	readonly itemId: string;
	readonly workspaceId: string;
}) {
	return withDb(async (db) => {
		const recording = await requireWorkspaceRecording(db, input);
		const [item, transcript] = await Promise.all([
			requireActiveWorkspaceItem(db, input.workspaceId, input.itemId),
			readRecordingTranscriptContent(db, input.itemId),
		]);
		return projectWorkspaceRecording(item, transcript, recording);
	});
}

/** Read the single uploaded file after workspace authorization. */
export async function readWorkspaceRecordingAudio(input: {
	readonly itemId: string;
	readonly workspaceId: string;
}) {
	return withDb((db) => requireWorkspaceRecording(db, input));
}

/** Claim a completed upload once; losing uploads can delete their own unique object. */
export async function saveWorkspaceRecordingAudio(input: {
	readonly itemId: string;
	readonly workspaceId: string;
	readonly objectKey: string;
	readonly mimeType: string;
	readonly sizeBytes: number;
	readonly durationMs: number;
}) {
	return withDb(async (db) =>
		db.transaction(async (transaction) => {
			await transaction.execute(
				sql`select item_id from ${workspaceRecordings} where ${workspaceRecordings.itemId} = ${input.itemId} for update`,
			);
			const recording = await requireWorkspaceRecording(transaction, input);
			if (recording.objectKey) return recording;
			const [saved] = await transaction
				.update(workspaceRecordings)
				.set({
					objectKey: input.objectKey,
					mimeType: input.mimeType,
					sizeBytes: input.sizeBytes,
					durationMs: input.durationMs,
				})
				.where(eq(workspaceRecordings.itemId, input.itemId))
				.returning();
			if (!saved) throw new Error("Recording upload was not saved.");
			return saved;
		}),
	);
}

/** Start or retry transcription of an immutable file; repeated requests reuse the attempt. */
export async function startWorkspaceRecordingTranscription(input: {
	readonly itemId: string;
	readonly workspaceId: string;
}) {
	return withDb(async (db) =>
		db.transaction(async (transaction) => {
			await transaction.execute(
				sql`select item_id from ${workspaceRecordings} where ${workspaceRecordings.itemId} = ${input.itemId} for update`,
			);
			const recording = await requireWorkspaceRecording(transaction, input);
			if (!recording.objectKey)
				throw new WorkspaceRecordingError(
					409,
					"RECORDING_NOT_READY",
					"Upload the recording first.",
				);
			if (recording.status === "ready" || recording.status === "processing") return recording;
			const [updated] = await transaction
				.update(workspaceRecordings)
				.set({
					status: "processing",
					errorMessage: null,
					transcriptionAttempt: recording.transcriptionAttempt + 1,
				})
				.where(eq(workspaceRecordings.itemId, input.itemId))
				.returning();
			if (!updated) throw new Error("Transcription was not started.");
			return updated;
		}),
	);
}

/** Read the completed audio for a workflow attempt. */
export async function readWorkspaceRecordingForTranscription(itemId: string) {
	return withDb(async (db) => {
		const [recording] = await db
			.select()
			.from(workspaceRecordings)
			.where(eq(workspaceRecordings.itemId, itemId))
			.limit(1);
		if (!recording)
			throw new WorkspaceRecordingError(404, "RECORDING_NOT_FOUND", "Recording not found.");
		return recording;
	});
}

/** Publish time-aligned transcript cues and mark the recording ready exactly once. */
export async function publishWorkspaceRecordingTranscript(
	env: Cloudflare.Env,
	input: {
		readonly itemId: string;
		readonly attempt: number;
		readonly transcript: WorkspaceRecordingTranscript;
	},
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
		if (recording.status !== "processing" || recording.transcriptionAttempt !== input.attempt)
			return { outcome: "discarded" as const };

		const content = stringifyWorkspaceRecordingTranscript(input.transcript);
		await transaction
			.update(workspaceItemContents)
			.set(workspaceItemContentValues("recording", content))
			.where(eq(workspaceItemContents.itemId, input.itemId));
		await transaction
			.update(workspaceRecordings)
			.set({ status: "ready", errorMessage: null })
			.where(eq(workspaceRecordings.itemId, input.itemId));
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
export async function failWorkspaceRecording(
	env: Cloudflare.Env,
	itemId: string,
	attempt: number,
	message: string,
) {
	const failure = await withWorkspaceTransaction(async (transaction) => {
		await transaction.execute(
			sql`select item_id from ${workspaceRecordings} where ${workspaceRecordings.itemId} = ${itemId} for update`,
		);
		const [recording] = await transaction
			.select()
			.from(workspaceRecordings)
			.where(eq(workspaceRecordings.itemId, itemId))
			.limit(1);
		if (
			!recording ||
			recording.status !== "processing" ||
			recording.transcriptionAttempt !== attempt
		)
			return null;
		await transaction
			.update(workspaceRecordings)
			.set({ status: "failed", errorMessage: message.slice(0, 500) })
			.where(eq(workspaceRecordings.itemId, itemId));
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

/** Read transcription state and content for the shared workspace reader. */
export async function readWorkspaceRecordingContent(input: {
	readonly itemId: string;
	readonly workspaceId: string;
}) {
	return await withDb(async (db) => {
		const recording = await requireWorkspaceRecording(db, input);
		return {
			errorMessage: recording.errorMessage,
			status: recording.status,
			transcript: await readRecordingTranscriptContent(db, input.itemId),
		};
	});
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

async function readRecordingTranscriptContent(db: QueryExecutor, itemId: string) {
	const [content] = await db
		.select({ content: workspaceItemContents.content })
		.from(workspaceItemContents)
		.where(eq(workspaceItemContents.itemId, itemId))
		.limit(1);
	return content ? parseWorkspaceRecordingTranscript(content.content) : null;
}

function projectWorkspaceRecording(
	item: Awaited<ReturnType<typeof requireActiveWorkspaceItem>>,
	transcript: WorkspaceRecordingTranscript | null,
	recording: RecordingRow,
) {
	return {
		item,
		mimeType: recording.mimeType,
		status: recording.status,
		durationMs: recording.durationMs,
		errorMessage: recording.errorMessage,
		hasAudio: recording.objectKey !== null,
		transcript: transcript ?? { cues: [] },
	};
}
