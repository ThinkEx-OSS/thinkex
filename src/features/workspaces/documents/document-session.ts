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
	DocumentEditReceiptUndoResult,
} from "#/features/workspaces/documents/document-edit-receipt";
import type { WorkspaceMutationProvenance } from "#/features/workspaces/history/workspace-history-contract";
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
const pendingContributorIdsKey = "document-session:pending-contributors";
const documentEditReceiptKeyPrefix = "document-session:ai-edit-receipt:";
const checkpointDelayMs = 1_500;
const checkpointMaxWaitMs = 8_000;
const idleVersionDelayMs = 2 * 60 * 1_000;

export interface DocumentSessionApplyEditsInput {
	actorUserId: string;
	edits: DocumentAiEdit[];
	operationId: string;
	provenance?: WorkspaceMutationProvenance;
}

export interface DocumentSessionApplyEditsResult {
	applied: number;
	failed: number;
	/** Counted here, against the two documents this edit sat between, so the
	 * receipt states what the edit did rather than what is left of it later. */
	lineChanges?: DocumentEditLineChanges;
	failures: {
		code:
			| DocumentAiEditFailureCode
			| "content_changed"
			| "operation_id_conflict"
			| "path_not_found";
		detail?: string;
		index: number;
	}[];
	status: DocumentAiEditResultStatus;
}

interface StoredDocumentEditReceipt {
	id: string;
	inputHash: string;
	result: DocumentSessionApplyEditsResult;
	status: "applied" | "reverted";
}

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
		const { content } = await kernel.readItemContent({ itemId: room.itemId });
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
		const activeContributorIds = Array.from(
			new Set(
				Array.from(this.getConnections<DocumentSessionConnectionState>()).flatMap((connection) =>
					connection.state?.userId ? [connection.state.userId] : [],
				),
			),
		);
		const pendingContributorIds = Array.from(
			new Set([
				...((await this.ctx.storage.get<string[]>(pendingContributorIdsKey)) ?? []),
				...activeContributorIds,
			]),
		);
		await this.ctx.storage.put(pendingContributorIdsKey, pendingContributorIds);
		await this.checkpointToKernel({
			actorUserId: pendingContributorIds.length === 1 ? pendingContributorIds[0] : null,
			provenance: { origin: "human" },
		});
		await this.ctx.storage.setAlarm(Date.now() + idleVersionDelayMs);
	}

	override async onAlarm() {
		if (this.deleted) return;
		const contributors = (await this.ctx.storage.get<string[]>(pendingContributorIdsKey)) ?? [];
		await this.checkpointToKernel({
			actorUserId: contributors.length === 1 ? contributors[0] : null,
			clearPendingContributors: true,
			createVersion: true,
			provenance: { origin: "human" },
		});
	}

	async readDocumentSnapshot() {
		this.assertActive();
		return {
			content: stringifyTiptapDocumentJson(this.getCurrentTiptapDocument()),
		};
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
				: rejectedDocumentEditResult("operation_id_conflict", input.edits.length);
		}

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
		if (stringifyTiptapDocumentJson(this.getCurrentTiptapDocument()) !== beforeDocumentText) {
			return rejectedDocumentEditResult("content_changed", input.edits.length);
		}

		const result: DocumentSessionApplyEditsResult = {
			applied: editResult.applied,
			failed: editResult.failed,
			failures: editResult.failures,
			lineChanges: summarizeDocumentAiLineChanges(currentDocument, editResult.document),
			status: editResult.status,
		};
		const receipt: StoredDocumentEditReceipt = {
			id: input.operationId,
			inputHash,
			result,
			status: "applied",
		};

		this.reconcileCurrentDocument(editResult.document);
		const persistedUpdate = Y.encodeStateAsUpdate(this.document);
		await this.ctx.storage.put({
			[persistedYDocUpdateKey]: persistedUpdate,
			[getDocumentEditReceiptKey(receipt.id)]: receipt,
		});
		this.assertActive();
		if (
			!(await this.checkpointToKernel({
				actorUserId: input.actorUserId,
				clientMutationId: input.operationId,
				provenance: input.provenance,
				versionId: input.operationId,
				createVersion: true,
			}))
		) {
			return rejectedDocumentEditResult("path_not_found", input.edits.length);
		}
		this.assertActive();

		return result;
	}

	async getDocumentEditReceiptReview(input: {
		receiptIds: string[];
	}): Promise<DocumentEditReceiptReviewRpcResult> {
		return await this.readVersionChange({ versionIds: input.receiptIds });
	}

	async restoreDocumentVersion(input: {
		actorUserId: string;
		versionId: string;
	}): Promise<DocumentEditReceiptUndoResult> {
		const room = getDocumentSessionRoomNameParts(this.name);
		const kernel = await this.getWorkspaceKernel(room.workspaceId);
		const target = await kernel.readItemVersion({
			itemId: room.itemId,
			versionId: input.versionId,
		});
		if (target.status !== "ready") return target;
		this.reconcileCurrentDocument(parseTiptapDocumentJson(target.content));
		await this.persistYDoc();
		if (
			!(await this.checkpointToKernel({
				actorUserId: input.actorUserId,
				clientMutationId: `restore:${input.versionId}:${crypto.randomUUID()}`,
				createVersion: true,
				provenance: { origin: "restore" },
			}))
		)
			return { status: "not_found" };
		return { status: "undone" };
	}

	async undoDocumentEditReceipt(input: {
		actorUserId: string;
		receiptIds: string[];
	}): Promise<DocumentEditReceiptUndoResult> {
		const receipts = await Promise.all(
			input.receiptIds.map((receiptId) => this.getDocumentEditReceipt(receiptId)),
		);
		if (receipts.some((receipt) => receipt?.status === "reverted")) return { status: "reverted" };
		if (receipts.some((receipt) => !receipt)) return { status: "not_found" };
		const target = await this.readVersionChange({ versionIds: input.receiptIds });
		if (target.status !== "ready") return target;
		const targetDocument = parseTiptapDocumentJson(target.beforeContent);
		this.reconcileCurrentDocument(targetDocument);
		const persistedUpdate = Y.encodeStateAsUpdate(this.document);
		await this.ctx.storage.put(persistedYDocUpdateKey, persistedUpdate);
		const lastReceiptId = input.receiptIds.at(-1);
		if (
			!lastReceiptId ||
			!(await this.checkpointToKernel({
				actorUserId: input.actorUserId,
				clientMutationId: `undo:${lastReceiptId}`,
				createVersion: true,
				provenance: { origin: "restore" },
			}))
		) {
			return { status: "not_found" };
		}
		await Promise.all(
			(receipts as StoredDocumentEditReceipt[]).map((receipt) =>
				this.ctx.storage.put(getDocumentEditReceiptKey(receipt.id), {
					...receipt,
					status: "reverted",
				}),
			),
		);

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
		await this.ctx.storage.deleteAlarm();
		await this.ctx.storage.deleteAll();
	}

	private async checkpointToKernel(
		input: {
			actorUserId?: string | null;
			clearPendingContributors?: boolean;
			clientMutationId?: string | null;
			createVersion?: boolean;
			provenance?: WorkspaceMutationProvenance;
			versionId?: string;
		} = {},
	) {
		const room = getDocumentSessionRoomNameParts(this.name);
		const document = this.getCurrentTiptapDocument();
		const kernel = await this.getWorkspaceKernel(room.workspaceId);

		const outcome = await kernel.commitItemContent({
			itemId: room.itemId,
			content: stringifyTiptapDocumentJson(document),
			actorUserId: input.actorUserId ?? null,
			clientMutationId: input.clientMutationId ?? null,
			createVersion: input.createVersion,
			provenance: input.provenance,
			versionId: input.versionId,
		});
		if (outcome.status === "discarded") {
			await this.purgeForDeletion();
			return false;
		}
		if ((outcome.versionId || outcome.eventId === null) && input.clearPendingContributors) {
			await this.ctx.storage.delete(pendingContributorIdsKey);
		}

		return true;
	}

	private async getDocumentEditReceipt(receiptId: string) {
		return await this.ctx.storage.get<StoredDocumentEditReceipt>(
			getDocumentEditReceiptKey(receiptId),
		);
	}

	private async readVersionChange(input: { versionIds: string[] }) {
		const room = getDocumentSessionRoomNameParts(this.name);
		const kernel = await this.getWorkspaceKernel(room.workspaceId);
		const target = await kernel.readItemVersionChange(input);
		if (target.status !== "ready") return target;
		const currentText = stringifyTiptapDocumentJson(this.getCurrentTiptapDocument());
		const currentHash = await sha256Base64UrlText(currentText);
		return (target.expectedCurrentHash === null || currentHash === target.expectedCurrentHash) &&
			stringifyTiptapDocumentJson(this.getCurrentTiptapDocument()) === currentText
			? { beforeContent: target.beforeContent, status: "ready" as const }
			: { status: "content_changed" as const };
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

function rejectedDocumentEditResult(
	code: DocumentSessionApplyEditsResult["failures"][number]["code"],
	editCount: number,
): DocumentSessionApplyEditsResult {
	return {
		applied: 0,
		failed: editCount,
		failures: Array.from({ length: editCount }, (_, index) => ({
			code,
			index,
		})),
		status: "rejected",
	};
}
