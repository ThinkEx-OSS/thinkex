import type { UIMessage } from "ai";
import { and, asc, eq, gt, sql } from "drizzle-orm";

import { aiChatAttachments, aiChatMessages, aiChatThreads } from "#/db/schema";
import { withDb } from "#/db/server";
import {
	FALLBACK_THREAD_TITLE,
	type AiChatThreadSummary,
} from "#/features/workspaces/ai/chat/chat-model";
import { isStreamClaimFresh } from "#/features/workspaces/ai/chat/chat-claim";

// Postgres persistence for the option-zero chat implementation. All access is
// scoped by (threadId, userId): the caller passes the authenticated user and
// every query carries the ownership predicate, so a guessed thread id can
// never read or write another user's transcript.

export interface AiChatThreadRow {
	id: string;
	userId: string;
	workspaceId: string;
	title: string | null;
	activeStreamId: string | null;
	updatedAt: Date;
}

export type AiChatMessageStatus = "complete" | "interrupted" | "error";

// A caller-supplied thread id already belongs to a different user.
export class ChatThreadOwnershipError extends Error {
	constructor() {
		super("Chat thread belongs to another user");
	}
}

export async function ensureThread(input: {
	threadId: string;
	userId: string;
	workspaceId: string;
}): Promise<AiChatThreadRow> {
	return await withDb(async (db) => {
		const [existing] = await db
			.select()
			.from(aiChatThreads)
			.where(and(eq(aiChatThreads.id, input.threadId), eq(aiChatThreads.userId, input.userId)))
			.limit(1);

		if (existing) {
			return existing;
		}

		const [created] = await db
			.insert(aiChatThreads)
			.values({
				id: input.threadId,
				userId: input.userId,
				workspaceId: input.workspaceId,
			})
			.onConflictDoNothing()
			.returning();

		if (created) {
			return created;
		}

		// Lost a create race, or the thread exists under another user. Re-select
		// with the ownership predicate so the latter surfaces as "not found".
		const [row] = await db
			.select()
			.from(aiChatThreads)
			.where(and(eq(aiChatThreads.id, input.threadId), eq(aiChatThreads.userId, input.userId)))
			.limit(1);

		if (!row) {
			throw new ChatThreadOwnershipError();
		}

		return row;
	});
}

export async function getThread(input: {
	threadId: string;
	userId: string;
}): Promise<AiChatThreadRow | null> {
	return await withDb(async (db) => {
		const [row] = await db
			.select()
			.from(aiChatThreads)
			.where(and(eq(aiChatThreads.id, input.threadId), eq(aiChatThreads.userId, input.userId)))
			.limit(1);

		return row ?? null;
	});
}

export async function getThreadTranscript(input: {
	threadId: string;
	userId: string;
}): Promise<{ isTurnActive: boolean; messages: UIMessage[] }> {
	return await withDb((db) =>
		db.transaction(
			async (transaction) => {
				const [thread] = await transaction
					.select({
						activeStreamId: aiChatThreads.activeStreamId,
						updatedAt: aiChatThreads.updatedAt,
					})
					.from(aiChatThreads)
					.where(and(eq(aiChatThreads.id, input.threadId), eq(aiChatThreads.userId, input.userId)))
					.limit(1);
				const rows = await transaction
					.select({
						id: aiChatMessages.id,
						role: aiChatMessages.role,
						parts: aiChatMessages.parts,
						metadata: aiChatMessages.metadata,
						status: aiChatMessages.status,
					})
					.from(aiChatMessages)
					.innerJoin(aiChatThreads, eq(aiChatMessages.threadId, aiChatThreads.id))
					.where(
						and(
							eq(aiChatMessages.threadId, input.threadId),
							eq(aiChatThreads.userId, input.userId),
							// System rows (compaction summaries) are model plumbing, not chat.
							sql`${aiChatMessages.role} != 'system'`,
						),
					)
					.orderBy(asc(aiChatMessages.seq));

				// Malformed rows are dropped rather than poisoning the transcript
				// (OpenCode decodes at every load boundary; this is the light version).
				const messages = rows
					.filter((row) => Array.isArray(row.parts))
					.map((row) => {
						// Non-complete outcomes ride the metadata so a reload can explain a
						// mid-sentence cutoff ("You stopped this response") instead of
						// presenting the partial as a finished answer.
						const metadata =
							row.status === "complete"
								? row.metadata
								: { ...(row.metadata ?? {}), turnStatus: row.status };

						return {
							id: row.id,
							role: row.role,
							parts: row.parts as UIMessage["parts"],
							metadata,
						};
					});

				// A dead Worker cannot clear its claim. Present a stale claim as terminal
				// so the user can retry; claimTurn's compare-and-swap then replaces that
				// exact orphan without weakening live-turn serialization.
				return { isTurnActive: thread ? isStreamClaimFresh(thread) : false, messages };
			},
			{ isolationLevel: "repeatable read" },
		),
	);
}

export interface ThreadMessageRow {
	seq: number;
	message: UIMessage;
	compaction: { summary: string; firstKeptSeq: number } | null;
}

// The model-context view: every row including compaction markers, with seqs.
export async function listThreadMessageRows(input: {
	threadId: string;
	userId: string;
}): Promise<ThreadMessageRow[]> {
	return await withDb(async (db) => {
		const rows = await db
			.select({
				id: aiChatMessages.id,
				seq: aiChatMessages.seq,
				role: aiChatMessages.role,
				parts: aiChatMessages.parts,
				metadata: aiChatMessages.metadata,
			})
			.from(aiChatMessages)
			.innerJoin(aiChatThreads, eq(aiChatMessages.threadId, aiChatThreads.id))
			.where(
				and(eq(aiChatMessages.threadId, input.threadId), eq(aiChatThreads.userId, input.userId)),
			)
			.orderBy(asc(aiChatMessages.seq));

		return rows
			.filter((row) => Array.isArray(row.parts))
			.map((row) => {
				const metadata = row.metadata as {
					kind?: string;
					summary?: string;
					firstKeptSeq?: number;
				} | null;
				const isCompaction =
					row.role === "system" &&
					metadata?.kind === "compaction" &&
					typeof metadata.summary === "string" &&
					typeof metadata.firstKeptSeq === "number";

				return {
					seq: row.seq,
					message: {
						id: row.id,
						role: row.role,
						parts: row.parts as UIMessage["parts"],
					},
					compaction: isCompaction
						? { summary: metadata.summary as string, firstKeptSeq: metadata.firstKeptSeq as number }
						: null,
				};
			});
	});
}

export async function insertCompactionMessage(input: {
	threadId: string;
	summary: string;
	firstKeptSeq: number;
}) {
	await withDb(async (db) => {
		await db.insert(aiChatMessages).values({
			id: `compaction-${crypto.randomUUID()}`,
			threadId: input.threadId,
			role: "system",
			parts: [{ type: "text", text: input.summary }],
			metadata: { kind: "compaction", summary: input.summary, firstKeptSeq: input.firstKeptSeq },
			status: "complete",
		});
	});
}

export async function saveMessage(input: {
	threadId: string;
	message: UIMessage;
	status?: AiChatMessageStatus;
}): Promise<boolean> {
	return await withDb(async (db) => {
		const written = await db
			.insert(aiChatMessages)
			.values({
				id: input.message.id,
				threadId: input.threadId,
				role: input.message.role,
				parts: input.message.parts,
				metadata: input.message.metadata ?? null,
				status: input.status ?? "complete",
			})
			.onConflictDoUpdate({
				target: [aiChatMessages.threadId, aiChatMessages.id],
				set: {
					parts: input.message.parts,
					metadata: input.message.metadata ?? null,
					status: input.status ?? "complete",
				},
				// The upsert exists for the assistant-row lifecycle (onEnd re-saving
				// its own id). A client-supplied id colliding with a different role's
				// row must not overwrite history — the mismatch makes this a no-op,
				// reported via the return so the caller can reject instead of
				// carrying on into a confusing downstream error.
				setWhere: sql`${aiChatMessages.role} = ${input.message.role}`,
			})
			.returning({ id: aiChatMessages.id });
		await db
			.update(aiChatThreads)
			.set({ updatedAt: new Date() })
			.where(eq(aiChatThreads.id, input.threadId));

		return written.length > 0;
	});
}

/** Persist a turn outcome and release its claim in one guarded transaction. */
export async function settleStream(input: {
	threadId: string;
	streamId: string;
	message: UIMessage | undefined;
	status: AiChatMessageStatus;
}): Promise<boolean> {
	return await withDb(async (db) =>
		db.transaction(async (tx) => {
			const [thread] = await tx
				.select({ activeStreamId: aiChatThreads.activeStreamId })
				.from(aiChatThreads)
				.where(eq(aiChatThreads.id, input.threadId))
				.for("update");
			if (
				thread?.activeStreamId !== input.streamId &&
				thread?.activeStreamId !== `stop:${input.streamId}`
			) {
				return false;
			}

			if (input.message) {
				await tx
					.insert(aiChatMessages)
					.values({
						id: input.message.id,
						threadId: input.threadId,
						role: input.message.role,
						parts: input.message.parts,
						metadata: input.message.metadata ?? null,
						status: input.status,
					})
					.onConflictDoUpdate({
						target: [aiChatMessages.threadId, aiChatMessages.id],
						set: {
							parts: input.message.parts,
							metadata: input.message.metadata ?? null,
							status: input.status,
						},
						setWhere: sql`${aiChatMessages.role} = ${input.message.role}`,
					});
			}

			await tx
				.update(aiChatThreads)
				.set({ activeStreamId: null, updatedAt: new Date() })
				.where(eq(aiChatThreads.id, input.threadId));
			return true;
		}),
	);
}

// Regeneration: drop everything after the last user message and re-run.
//
// Compaction invariant that makes this safe: compaction only ever ADDS summary
// rows — it never deletes the raw messages it summarized. So this delete can
// remove at most the newest summary (one that landed after the last user
// message), and recompaction rebuilds an equivalent one from the untouched
// source rows. Do not "optimize" compaction into pruning old rows — that
// would silently break regenerate.
export async function deleteMessagesAfterLastUserMessage(input: {
	threadId: string;
	userId: string;
}) {
	await withDb(async (db) => {
		const [lastUser] = await db
			.select({ seq: aiChatMessages.seq })
			.from(aiChatMessages)
			.innerJoin(aiChatThreads, eq(aiChatMessages.threadId, aiChatThreads.id))
			.where(
				and(
					eq(aiChatMessages.threadId, input.threadId),
					eq(aiChatThreads.userId, input.userId),
					eq(aiChatMessages.role, "user"),
				),
			)
			.orderBy(sql`${aiChatMessages.seq} desc`)
			.limit(1);

		if (!lastUser) {
			return;
		}

		await db
			.delete(aiChatMessages)
			.where(
				and(eq(aiChatMessages.threadId, input.threadId), gt(aiChatMessages.seq, lastUser.seq)),
			);
	});
}

// A resend of an already-persisted user message truncates everything after it
// and re-runs — the retry semantics (a queued message whose turn errored
// resends the same id) and, by the same token, edit-and-resend. Without the
// truncation, the upsert updates in place, the trailing error row stays last,
// and the retry dies on "Nothing to respond to" forever. No-op when the id is
// new. Same compaction caveats as deleteMessagesAfterLastUserMessage above.
export async function deleteMessagesAfterUserMessage(input: {
	threadId: string;
	userId: string;
	messageId: string;
}) {
	await withDb(async (db) => {
		const [existing] = await db
			.select({ seq: aiChatMessages.seq })
			.from(aiChatMessages)
			.innerJoin(aiChatThreads, eq(aiChatMessages.threadId, aiChatThreads.id))
			.where(
				and(
					eq(aiChatMessages.threadId, input.threadId),
					eq(aiChatMessages.id, input.messageId),
					eq(aiChatThreads.userId, input.userId),
					eq(aiChatMessages.role, "user"),
				),
			)
			.limit(1);

		if (!existing) {
			return;
		}

		await db
			.delete(aiChatMessages)
			.where(
				and(eq(aiChatMessages.threadId, input.threadId), gt(aiChatMessages.seq, existing.seq)),
			);
	});
}

// Per-thread serialization claim. Returns true when this stream now owns the
// thread; false when another generation is already running. The claim is
// released in `releaseStream`, and a stale claim (crashed isolate) is broken
// by re-claiming with `replaceStreamId` after a timeout upstream.
export async function claimStream(input: {
	threadId: string;
	userId: string;
	streamId: string;
	// Break a presumed-stale claim, but only this exact one (compare-and-swap):
	// if a different stream claimed in the meantime, the takeover fails.
	replaceStreamId?: string;
}): Promise<boolean> {
	return await withDb(async (db) => {
		const result = await db
			.update(aiChatThreads)
			.set({ activeStreamId: input.streamId })
			.where(
				and(
					eq(aiChatThreads.id, input.threadId),
					eq(aiChatThreads.userId, input.userId),
					input.replaceStreamId
						? eq(aiChatThreads.activeStreamId, input.replaceStreamId)
						: sql`${aiChatThreads.activeStreamId} is null`,
				),
			)
			.returning({ id: aiChatThreads.id });

		return result.length > 0;
	});
}

// Liveness ping AND stop-observation in one query: refreshing the claim keeps
// `updatedAt` moving (so a live long turn is never mistaken for a crashed
// one), and a false return means the claim was lost — the user hit stop, or a
// stale-takeover replaced us — so the caller must abort its generation.
export async function pingStreamClaim(input: {
	threadId: string;
	streamId: string;
}): Promise<boolean> {
	return await withDb(async (db) => {
		const result = await db
			.update(aiChatThreads)
			.set({ activeStreamId: input.streamId })
			.where(
				and(eq(aiChatThreads.id, input.threadId), eq(aiChatThreads.activeStreamId, input.streamId)),
			)
			.returning({ id: aiChatThreads.id });

		return result.length > 0;
	});
}

// Explicit stop: the claim becomes a tombstone ("stop:<streamId>") rather
// than being cleared — the generator's next ping fails and it aborts, but the
// claim survives until settlement, so no new turn can start before the
// interrupted outcome is persisted (releaseStream clears the tombstone too).
// User-scoped — only the owner can stop.
export async function stopStream(input: { threadId: string; userId: string }): Promise<boolean> {
	return await withDb(async (db) => {
		const result = await db
			.update(aiChatThreads)
			.set({ activeStreamId: sql`'stop:' || ${aiChatThreads.activeStreamId}` })
			.where(
				and(
					eq(aiChatThreads.id, input.threadId),
					eq(aiChatThreads.userId, input.userId),
					sql`${aiChatThreads.activeStreamId} is not null`,
					sql`${aiChatThreads.activeStreamId} not like 'stop:%'`,
				),
			)
			.returning({ id: aiChatThreads.id });

		return result.length > 0;
	});
}

export async function releaseStream(input: { threadId: string; streamId: string }) {
	await withDb(async (db) => {
		await db
			.update(aiChatThreads)
			.set({ activeStreamId: null })
			.where(
				and(
					eq(aiChatThreads.id, input.threadId),
					sql`${aiChatThreads.activeStreamId} in (${input.streamId}, ${`stop:${input.streamId}`})`,
				),
			);
	});
}

export async function setThreadTitle(input: { threadId: string; title: string }) {
	await withDb(async (db) => {
		await db
			.update(aiChatThreads)
			.set({ title: input.title })
			.where(and(eq(aiChatThreads.id, input.threadId), sql`${aiChatThreads.title} is null`));
	});
}

// ─── Attachments (bytes live with the transcript; see schema comment) ───────

const MAX_ATTACHMENTS_PER_THREAD = 200;

export class ChatAttachmentLimitError extends Error {
	constructor() {
		super("Attachment limit reached for this chat");
	}
}

export async function insertThreadAttachment(input: {
	id: string;
	threadId: string;
	mediaType: string;
	fileName: string | null;
	bytes: Uint8Array;
}) {
	await withDb(async (db) => {
		const [{ count }] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(aiChatAttachments)
			.where(eq(aiChatAttachments.threadId, input.threadId));

		if (count >= MAX_ATTACHMENTS_PER_THREAD) {
			throw new ChatAttachmentLimitError();
		}

		await db.insert(aiChatAttachments).values({
			id: input.id,
			threadId: input.threadId,
			mediaType: input.mediaType,
			fileName: input.fileName,
			sizeBytes: input.bytes.byteLength,
			bytes: input.bytes,
		});
	});
}

// Ownership rides the join to the thread row, same as message reads.
export async function getThreadAttachment(input: {
	attachmentId: string;
	threadId: string;
	userId: string;
}) {
	return await withDb(async (db) => {
		const [row] = await db
			.select({
				id: aiChatAttachments.id,
				mediaType: aiChatAttachments.mediaType,
				fileName: aiChatAttachments.fileName,
				bytes: aiChatAttachments.bytes,
			})
			.from(aiChatAttachments)
			.innerJoin(aiChatThreads, eq(aiChatAttachments.threadId, aiChatThreads.id))
			.where(
				and(
					eq(aiChatAttachments.id, input.attachmentId),
					eq(aiChatAttachments.threadId, input.threadId),
					eq(aiChatThreads.userId, input.userId),
				),
			)
			.limit(1);

		return row ?? null;
	});
}

export async function deleteThreadAttachment(input: {
	attachmentId: string;
	threadId: string;
	userId: string;
}) {
	await withDb(async (db) => {
		await db
			.delete(aiChatAttachments)
			.where(
				and(
					eq(aiChatAttachments.id, input.attachmentId),
					eq(aiChatAttachments.threadId, input.threadId),
					sql`exists (select 1 from ${aiChatThreads} where ${aiChatThreads.id} = ${aiChatAttachments.threadId} and ${aiChatThreads.userId} = ${input.userId})`,
				),
			);
	});
}

// ─── Thread directory (the sidebar), formerly the UserAIStore DO ────────────

export async function listThreadSummaries(input: {
	userId: string;
	workspaceId: string;
}): Promise<AiChatThreadSummary[]> {
	return await withDb(async (db) => {
		const rows = await db
			.select()
			.from(aiChatThreads)
			.where(
				and(
					eq(aiChatThreads.userId, input.userId),
					eq(aiChatThreads.workspaceId, input.workspaceId),
					// A thread row can exist before any message (an attachment uploaded
					// to a draft materializes it early). The sidebar's definition of a
					// thread is "has messages" — rows without them stay invisible drafts.
					sql`exists (select 1 from ${aiChatMessages} where ${aiChatMessages.threadId} = ${aiChatThreads.id})`,
				),
			)
			.orderBy(sql`${aiChatThreads.updatedAt} desc`);

		return rows.map(toThreadSummary);
	});
}

export async function deleteThread(input: { threadId: string; userId: string }) {
	return await withDb(async (db) => {
		const [deleted] = await db
			.delete(aiChatThreads)
			.where(and(eq(aiChatThreads.id, input.threadId), eq(aiChatThreads.userId, input.userId)))
			.returning({ workspaceId: aiChatThreads.workspaceId });

		return deleted ?? null;
	});
}

// Account lifecycle. Messages and attachments cascade with the thread rows —
// the delete is the whole cleanup.
export async function deleteUserThreads(input: { userId: string }) {
	await withDb(async (db) => {
		await db.delete(aiChatThreads).where(eq(aiChatThreads.userId, input.userId));
	});
}

// Anonymous → account linking: reassign the anonymous user's threads.
// Attachments hang off the thread rows, so they move with them.
export async function transferUserThreads(input: { fromUserId: string; toUserId: string }) {
	await withDb(async (db) => {
		await db
			.update(aiChatThreads)
			.set({ userId: input.toUserId, updatedAt: sql`${aiChatThreads.updatedAt}` })
			.where(eq(aiChatThreads.userId, input.fromUserId));
	});
}

function toThreadSummary(row: typeof aiChatThreads.$inferSelect): AiChatThreadSummary {
	return {
		id: row.id,
		workspaceId: row.workspaceId,
		title: row.title ?? FALLBACK_THREAD_TITLE,
		lastActivityAt: row.updatedAt.toISOString(),
	};
}
