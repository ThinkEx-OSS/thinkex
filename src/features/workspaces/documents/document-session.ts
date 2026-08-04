import {
	prosemirrorJSONToYDoc,
	prosemirrorJSONToYXmlFragment,
	yXmlFragmentToProseMirrorRootNode,
} from "@tiptap/y-tiptap";
import type { Connection, ConnectionContext } from "partyserver";
import * as Y from "yjs";
import { YServer } from "y-partyserver";
import type { DocumentSessionRouteParams } from "#/features/workspaces/agent-routes";
import {
	applyDocumentAiEdits,
	summarizeDocumentAiLineChanges,
	type DocumentAiEdit,
	type DocumentAiEditFailureCode,
	type DocumentAiEditResultStatus,
} from "#/features/workspaces/documents/document-ai-edits";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import {
	createDocumentAiBlockSnapshot,
	type DocumentAiBlockSnapshot,
	ensureProseMirrorDocumentBlockIds,
	parseDocumentAiEditRef,
	readTiptapNodeBlockId,
} from "#/features/workspaces/documents/document-ai-html";
import {
	type DocumentHtmlChunkReadInput,
	type DocumentHtmlChunkReadResult,
	readDocumentHtmlChunk,
} from "#/features/workspaces/documents/document-html-chunk";
import {
	type DocumentSessionConnectionState,
	readForwardedDocumentSessionConnectionAccess,
} from "#/features/workspaces/documents/document-session-connection-access";
import type {
	DocumentEditLineChanges,
	DocumentEditReceiptReviewRpcResult,
	DocumentEditReceiptStatus,
	DocumentEditReceiptUndoResult,
} from "#/features/workspaces/documents/document-edit-receipt";
import {
	coerceTiptapDocumentJson,
	parseTiptapDocumentJson,
	stringifyTiptapDocumentJson,
	type TiptapDocumentJson,
} from "#/features/workspaces/documents/tiptap-document";
import {
	getTiptapDocumentSchema,
	tiptapDocumentYjsField,
} from "#/features/workspaces/documents/tiptap-schema";
import {
	getWorkspaceKernelFromEnv,
	type WorkspaceKernelClient,
} from "#/features/workspaces/kernel/workspace-kernel-access";
import { sha256Base64Url, sha256Base64UrlText } from "#/lib/binary";

const persistedYDocUpdateKey = "document-session:yjs-update";
const latestDocumentEditReceiptKey = "document-session:ai-edit-receipt:latest";
const documentEditReceiptIndexKey = "document-session:ai-edit-receipt:index";
const documentEditReceiptKeyPrefix = "document-session:ai-edit-receipt:";
const maximumRetainedDocumentEditReceipts = 8;
const maximumDocumentEditReceiptSnapshotBytes = 1_500_000;
const checkpointDelayMs = 1_500;
const checkpointMaxWaitMs = 8_000;

export interface DocumentSessionApplyEditsInput {
	edits: DocumentAiEdit[];
	operationId: string;
}

export interface DocumentSessionApplyEditsResult {
	applied: number;
	failed: number;
	/** Counted here, against the two documents this edit sat between, so the
	 * receipt states what the edit did rather than what is left of it later. */
	lineChanges?: DocumentEditLineChanges;
	failures: {
		code: DocumentAiEditFailureCode | "content_changed" | "operation_id_conflict";
		detail?: string;
		index: number;
	}[];
	status: DocumentAiEditResultStatus;
}

interface StoredDocumentEditReceipt {
	afterHash: string;
	beforeDocument?: TiptapDocumentJson;
	id: string;
	inputHash: string;
	previousReceiptId: string | null;
	result: DocumentSessionApplyEditsResult;
	status: "applied" | "reverted";
}

type ResolvedDocumentEditReceiptGroup =
	| {
			beforeDocument: TiptapDocumentJson;
			lastReceiptId: string;
			previousReceiptId: string | null;
			receipts: StoredDocumentEditReceipt[];
			status: "ready";
	  }
	| {
			status: Exclude<DocumentEditReceiptStatus, "ready">;
	  };

export class DocumentSession extends YServer {
	static override options = {
		hibernate: true,
	};

	private deleted = false;

	static override callbackOptions = {
		debounceWait: checkpointDelayMs,
		debounceMaxWait: checkpointMaxWaitMs,
	};

	override async onConnect(
		connection: Connection<DocumentSessionConnectionState>,
		context: ConnectionContext,
	) {
		if (this.deleted) {
			connection.close(1008, "Document deleted");
			return;
		}

		const access = readForwardedDocumentSessionConnectionAccess(context.request);

		if (!access) {
			connection.close(1011, "Unauthorized");
			return;
		}

		connection.setState({
			canMutate: access.canMutate,
			userId: access.userId,
		});
		void super.onConnect(connection, context);
	}

	override isReadOnly(connection: Connection<DocumentSessionConnectionState>) {
		return this.deleted || connection.state?.canMutate !== true;
	}

	override async onLoad() {
		const persistedUpdate = await this.ctx.storage.get<Uint8Array>(persistedYDocUpdateKey);
		if (this.deleted) {
			return;
		}

		if (persistedUpdate) {
			Y.applyUpdate(this.document, persistedUpdate, this);
			return;
		}

		const room = getDocumentSessionRoomNameParts(this.name);
		const kernel = await this.getWorkspaceKernel(room.workspaceId);
		const { content } = await kernel.readDocumentCheckpoint({ itemId: room.itemId });
		if (this.deleted) {
			return;
		}
		const snapshot = parseTiptapDocumentJson(content);
		const seededDoc = prosemirrorJSONToYDoc(
			getTiptapDocumentSchema(),
			snapshot,
			tiptapDocumentYjsField,
		);

		Y.applyUpdate(this.document, Y.encodeStateAsUpdate(seededDoc), this);
		seededDoc.destroy();
		await this.persistYDoc();
	}

	override async onSave() {
		if (this.deleted) {
			return;
		}

		await this.persistYDoc();
		if (this.deleted) {
			return;
		}
		await this.checkpointToKernel();
	}

	async applyEdits(
		input: DocumentSessionApplyEditsInput,
	): Promise<DocumentSessionApplyEditsResult> {
		this.assertActive();
		const [inputHash, existingReceipt] = await Promise.all([
			sha256Base64UrlText(JSON.stringify(input.edits)),
			this.getDocumentEditReceipt(input.operationId),
		]);

		if (existingReceipt) {
			return existingReceipt.inputHash === inputHash
				? existingReceipt.result
				: operationIdConflictResult(input.edits.length);
		}

		const latestReceiptId = await this.ctx.storage.get<string>(latestDocumentEditReceiptKey);
		const latestReceipt = latestReceiptId
			? await this.getDocumentEditReceipt(latestReceiptId)
			: undefined;
		const referencedDocument = await this.getReferencedDocumentSnapshot();
		const currentDocument = coerceTiptapDocumentJson(referencedDocument.document.toJSON());
		const editResult = await applyDocumentAiEdits(currentDocument, input.edits);

		if (editResult.applied === 0) {
			return {
				applied: editResult.applied,
				failed: editResult.failed,
				failures: editResult.failures,
				status: editResult.status,
			};
		}

		const beforeDocumentText = stringifyTiptapDocumentJson(currentDocument);
		const afterDocumentText = stringifyTiptapDocumentJson(editResult.document);
		const [beforeHash, afterHash] = await Promise.all([
			sha256Base64UrlText(beforeDocumentText),
			sha256Base64UrlText(afterDocumentText),
		]);

		if (stringifyTiptapDocumentJson(this.getCurrentTiptapDocument()) !== beforeDocumentText) {
			return {
				applied: 0,
				failed: input.edits.length,
				failures: input.edits.map((_, index) => ({
					code: "content_changed",
					index,
				})),
				status: "rejected",
			};
		}

		const result: DocumentSessionApplyEditsResult = {
			applied: editResult.applied,
			failed: editResult.failed,
			failures: editResult.failures,
			lineChanges: summarizeDocumentAiLineChanges(currentDocument, editResult.document),
			status: editResult.status,
		};
		const receipt: StoredDocumentEditReceipt = {
			afterHash,
			...(fitsDocumentEditReceiptSnapshot(beforeDocumentText)
				? { beforeDocument: currentDocument }
				: {}),
			id: input.operationId,
			inputHash,
			previousReceiptId:
				latestReceipt?.status === "applied" && latestReceipt.afterHash === beforeHash
					? latestReceipt.id
					: null,
			result,
			status: "applied",
		};

		// Only the newest edit can still be undone, so older receipts are dead
		// weight — and each one holds a whole copy of the document. Keep enough for
		// a turn that edited this document several times, and drop the rest.
		const recentReceiptIds = [
			...((await this.ctx.storage.get<string[]>(documentEditReceiptIndexKey)) ?? []),
			receipt.id,
		];
		const expiredReceiptIds = recentReceiptIds.splice(
			0,
			Math.max(0, recentReceiptIds.length - maximumRetainedDocumentEditReceipts),
		);

		this.reconcileCurrentDocument(editResult.document);
		const persistedUpdate = Y.encodeStateAsUpdate(this.document);
		await this.ctx.storage.transaction(async (transaction) => {
			await Promise.all([
				transaction.put(persistedYDocUpdateKey, persistedUpdate),
				transaction.put(getDocumentEditReceiptKey(receipt.id), receipt),
				transaction.put(latestDocumentEditReceiptKey, receipt.id),
				transaction.put(documentEditReceiptIndexKey, recentReceiptIds),
				...(expiredReceiptIds.length > 0
					? [transaction.delete(expiredReceiptIds.map(getDocumentEditReceiptKey))]
					: []),
			]);
		});
		this.assertActive();
		await this.checkpointToKernel(input.operationId);
		this.assertActive();

		return result;
	}

	async getDocumentEditReceiptReview(input: {
		receiptIds: string[];
	}): Promise<DocumentEditReceiptReviewRpcResult> {
		const group = await this.resolveDocumentEditReceiptGroup(input.receiptIds);

		if (group.status !== "ready") {
			return { status: group.status };
		}

		return {
			beforeContent: stringifyTiptapDocumentJson(group.beforeDocument),
			status: "ready",
		};
	}

	async undoDocumentEditReceipt(input: {
		receiptIds: string[];
	}): Promise<DocumentEditReceiptUndoResult> {
		const group = await this.resolveDocumentEditReceiptGroup(input.receiptIds);

		if (group.status !== "ready") {
			return { status: group.status };
		}

		this.reconcileCurrentDocument(group.beforeDocument);
		const persistedUpdate = Y.encodeStateAsUpdate(this.document);

		await this.ctx.storage.transaction(async (transaction) => {
			await Promise.all([
				transaction.put(persistedYDocUpdateKey, persistedUpdate),
				...group.receipts.map((receipt) =>
					transaction.put(getDocumentEditReceiptKey(receipt.id), {
						...receipt,
						status: "reverted",
					} satisfies StoredDocumentEditReceipt),
				),
			]);

			if (group.previousReceiptId) {
				await transaction.put(latestDocumentEditReceiptKey, group.previousReceiptId);
			} else {
				await transaction.delete(latestDocumentEditReceiptKey);
			}
		});

		await this.checkpointToKernel(`undo:${group.lastReceiptId}`);

		return { status: "undone" };
	}

	async readHtmlChunk(input: DocumentHtmlChunkReadInput): Promise<DocumentHtmlChunkReadResult> {
		this.assertActive();
		const { document, stateVector } = await this.getReferencedDocumentSnapshot();
		const revision = await sha256Base64Url(stateVector);
		if (input.expectedRevision && input.expectedRevision !== revision) {
			return { status: "content_changed" };
		}

		const chunk = await readDocumentHtmlChunk(document, input.offset);
		return chunk ? { ...chunk, revision, status: "ready" } : { status: "invalid_offset" };
	}

	/**
	 * One block in full, addressed by an editRef from an earlier read.
	 *
	 * Document reads elide a widget's source to keep prose in the chunk, so this
	 * is how the assistant fetches it before editing — and it works for any block
	 * that is easier to read alone than to page to.
	 */
	async readBlock(input: {
		editRef: string;
	}): Promise<(DocumentAiBlockSnapshot & { status: "ready" }) | { status: "edit_ref_not_found" }> {
		this.assertActive();
		const { document } = await this.getReferencedDocumentSnapshot();
		const blockId = parseDocumentAiEditRef(input.editRef);
		if (!blockId) {
			return { status: "edit_ref_not_found" };
		}

		let found: ProseMirrorNode | null = null;
		document.forEach((node) => {
			if (!found && readTiptapNodeBlockId(node) === blockId) {
				found = node;
			}
		});

		return found
			? {
					...(await createDocumentAiBlockSnapshot(found)),
					status: "ready",
				}
			: { status: "edit_ref_not_found" };
	}

	async purgeForDeletion(): Promise<void> {
		// Deliberately does not hydrate the document: this only wipes durable
		// storage, and onLoad could otherwise reseed from the deleted item.
		this.deleted = true;
		for (const connection of this.getConnections()) {
			connection.close(1008, "Document deleted");
		}
		this.document.destroy();
		await this.ctx.storage.deleteAll();
	}

	private async checkpointToKernel(clientMutationId: string | null = null) {
		const room = getDocumentSessionRoomNameParts(this.name);
		const document = this.getCurrentTiptapDocument();
		const kernel = await this.getWorkspaceKernel(room.workspaceId);

		await kernel.commitDocumentCheckpoint({
			itemId: room.itemId,
			content: stringifyTiptapDocumentJson(document),
			actorUserId: null,
			clientMutationId,
		});
	}

	private async getDocumentEditReceipt(receiptId: string) {
		return await this.ctx.storage.get<StoredDocumentEditReceipt>(
			getDocumentEditReceiptKey(receiptId),
		);
	}

	private async resolveDocumentEditReceiptGroup(
		receiptIds: string[],
	): Promise<ResolvedDocumentEditReceiptGroup> {
		if (receiptIds.length === 0 || new Set(receiptIds).size !== receiptIds.length) {
			return { status: "not_found" };
		}

		const receipts = await Promise.all(
			receiptIds.map((receiptId) => this.getDocumentEditReceipt(receiptId)),
		);
		const storedReceipts = receipts.filter(
			(receipt): receipt is StoredDocumentEditReceipt => receipt !== undefined,
		);
		if (storedReceipts.length !== receiptIds.length) {
			return { status: "not_found" };
		}
		if (storedReceipts.some((receipt) => receipt.status === "reverted")) {
			return { status: "reverted" };
		}
		for (let index = 1; index < storedReceipts.length; index += 1) {
			if (storedReceipts[index]?.previousReceiptId !== storedReceipts[index - 1]?.id) {
				return { status: "not_latest" };
			}
		}

		const firstReceipt = storedReceipts[0];
		const lastReceipt = storedReceipts.at(-1);
		if (!firstReceipt || !lastReceipt) {
			return { status: "not_found" };
		}

		const latestReceiptId = await this.ctx.storage.get<string>(latestDocumentEditReceiptKey);
		if (latestReceiptId !== lastReceipt.id) {
			return { status: "not_latest" };
		}
		if (!firstReceipt.beforeDocument) {
			return { status: "review_unavailable" };
		}

		this.assertActive();
		const currentDocumentText = stringifyTiptapDocumentJson(this.getCurrentTiptapDocument());
		const currentHash = await sha256Base64UrlText(currentDocumentText);

		return currentHash === lastReceipt.afterHash &&
			stringifyTiptapDocumentJson(this.getCurrentTiptapDocument()) === currentDocumentText
			? {
					beforeDocument: firstReceipt.beforeDocument,
					lastReceiptId: lastReceipt.id,
					previousReceiptId: firstReceipt.previousReceiptId,
					receipts: storedReceipts,
					status: "ready",
				}
			: { status: "content_changed" };
	}

	private getCurrentTiptapDocument() {
		return coerceTiptapDocumentJson(this.getCurrentProseMirrorDocument().toJSON());
	}

	private getCurrentProseMirrorDocument() {
		return yXmlFragmentToProseMirrorRootNode(
			this.document.getXmlFragment(tiptapDocumentYjsField),
			getTiptapDocumentSchema(),
		);
	}

	private reconcileCurrentDocument(document: TiptapDocumentJson) {
		const fragment = this.document.getXmlFragment(tiptapDocumentYjsField);
		prosemirrorJSONToYXmlFragment(getTiptapDocumentSchema(), document, fragment);
	}

	private async persistYDoc() {
		if (this.deleted) {
			return;
		}

		await this.ctx.storage.put(persistedYDocUpdateKey, Y.encodeStateAsUpdate(this.document));
	}

	private async getReferencedDocumentSnapshot() {
		const refs = ensureProseMirrorDocumentBlockIds(this.getCurrentProseMirrorDocument());
		if (refs.changed) {
			this.reconcileCurrentDocument(coerceTiptapDocumentJson(refs.document.toJSON()));
			await this.persistYDoc();
		}

		return {
			// Re-read through Yjs after reconciling so the snapshot matches what
			// collaborators see, not the detached node the refs pass produced.
			document: refs.changed ? this.getCurrentProseMirrorDocument() : refs.document,
			stateVector: Uint8Array.from(Y.encodeStateVector(this.document)),
		};
	}

	private assertActive() {
		if (this.deleted) {
			throw new Error("Document session has been deleted.");
		}
	}

	private async getWorkspaceKernel(workspaceId: string): Promise<WorkspaceKernelClient> {
		return getWorkspaceKernelFromEnv(this.env, workspaceId);
	}
}

function getDocumentSessionRoomNameParts(roomName: string): DocumentSessionRouteParams {
	const separatorIndex = roomName.indexOf(":");

	if (separatorIndex <= 0 || separatorIndex === roomName.length - 1) {
		throw new Error("Document session room name is invalid.");
	}

	return {
		workspaceId: roomName.slice(0, separatorIndex),
		itemId: roomName.slice(separatorIndex + 1),
	};
}

function getDocumentEditReceiptKey(receiptId: string) {
	return `${documentEditReceiptKeyPrefix}${receiptId}`;
}

function fitsDocumentEditReceiptSnapshot(documentText: string) {
	return (
		new TextEncoder().encode(documentText).byteLength <= maximumDocumentEditReceiptSnapshotBytes
	);
}

function operationIdConflictResult(editCount: number): DocumentSessionApplyEditsResult {
	return {
		applied: 0,
		failed: editCount,
		failures: Array.from({ length: editCount }, (_, index) => ({
			code: "operation_id_conflict",
			index,
		})),
		status: "rejected",
	};
}
