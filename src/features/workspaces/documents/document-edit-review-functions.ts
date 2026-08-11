import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getDocumentSessionFromEnv } from "#/features/workspaces/document-session-access";
import type {
	DocumentEditReceiptReviewRpcResult,
	DocumentEditReceiptReviewResult,
	DocumentEditReceiptUndoResult,
} from "#/features/workspaces/documents/document-edit-receipt";
import { parseTiptapDocumentJson } from "#/features/workspaces/documents/tiptap-document";
import { withWorkspaceDb } from "#/features/workspaces/server/workspace-db";
import {
	assertCanMutateWorkspace,
	assertCanReadWorkspace,
} from "#/features/workspaces/server/permissions";

const documentEditReceiptInputSchema = z.strictObject({
	itemId: z.string().trim().min(1),
	receiptIds: z.array(z.string().trim().min(1).max(512)).min(1).max(40),
	workspaceId: z.string().trim().min(1),
});

export const getDocumentEditReceiptReviewFn = createServerFn({ method: "GET" })
	.validator(documentEditReceiptInputSchema)
	.handler(async ({ data }): Promise<DocumentEditReceiptReviewResult> => {
		await withWorkspaceDb(({ db, userId }) =>
			assertCanReadWorkspace(db, { userId, workspaceId: data.workspaceId }),
		);
		const session = await getDocumentEditSession(data);
		const result = await session.getDocumentEditReceiptReview({
			receiptIds: data.receiptIds,
		});

		return result.status === "ready"
			? {
					beforeDocument: parseTiptapDocumentJson(result.beforeContent),
					status: result.status,
				}
			: result;
	});

export const undoDocumentEditReceiptFn = createServerFn({ method: "POST" })
	.validator(documentEditReceiptInputSchema)
	.handler(async ({ data }): Promise<DocumentEditReceiptUndoResult> => {
		const userId = await withWorkspaceDb(async ({ db, userId }) => {
			await assertCanMutateWorkspace(db, { userId, workspaceId: data.workspaceId });
			return userId;
		});
		const session = await getDocumentEditSession(data);
		return await session.undoDocumentEditReceipt({
			actorUserId: userId,
			receiptIds: data.receiptIds,
		});
	});

async function getDocumentEditSession(input: {
	itemId: string;
	workspaceId: string;
}): Promise<DocumentEditSession> {
	const { env } = await import("cloudflare:workers");
	const session: unknown = getDocumentSessionFromEnv(env, input);
	return session as DocumentEditSession;
}

// Narrowing the generated stub here avoids recursively expanding every
// DocumentSession RPC type through createServerFn.
interface DocumentEditSession {
	getDocumentEditReceiptReview(input: {
		receiptIds: string[];
	}): Promise<DocumentEditReceiptReviewRpcResult>;
	undoDocumentEditReceipt(input: {
		actorUserId: string;
		receiptIds: string[];
	}): Promise<DocumentEditReceiptUndoResult>;
}
