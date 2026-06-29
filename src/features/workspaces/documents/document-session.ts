import {
	prosemirrorJSONToYDoc,
	prosemirrorJSONToYXmlFragment,
	yDocToProsemirrorJSON,
} from "@tiptap/y-tiptap";
import type { Connection, ConnectionContext } from "partyserver";
import { YServer } from "y-partyserver";
import * as Y from "yjs";
import type { DocumentSessionRouteParams } from "#/features/workspaces/agent-routes";
import {
	parseMarkdownToTiptapDocumentProjection,
	serializeTiptapDocumentToMarkdown,
} from "#/features/workspaces/documents/document-markdown";
import {
	applyDocumentMarkdownEdits,
	type DocumentMarkdownEdit,
	type DocumentMarkdownEditResultStatus,
} from "#/features/workspaces/documents/document-markdown-edits";
import {
	type DocumentSessionConnectionState,
	resolveDocumentSessionConnectionAccess,
} from "#/features/workspaces/documents/document-session-connection-access";
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

const persistedYDocUpdateKey = "document-session:yjs-update";
const checkpointDelayMs = 1_500;
const checkpointMaxWaitMs = 8_000;

export interface DocumentSessionApplyMarkdownEditsInput {
	edits: DocumentMarkdownEdit[];
}

export interface DocumentSessionApplyMarkdownEditsResult {
	applied: number;
	failed: number;
	failures: { code: string; index: number }[];
	status: DocumentMarkdownEditResultStatus;
	warnings: string[];
}

export class DocumentSession extends YServer {
	static override options = {
		hibernate: true,
	};

	static override callbackOptions = {
		debounceWait: checkpointDelayMs,
		debounceMaxWait: checkpointMaxWaitMs,
	};

	override async onConnect(
		connection: Connection<DocumentSessionConnectionState>,
		context: ConnectionContext,
	) {
		const room = getDocumentSessionRoomNameParts(this.name);
		let access: Awaited<ReturnType<typeof resolveDocumentSessionConnectionAccess>>;

		try {
			access = await resolveDocumentSessionConnectionAccess(context.request, room.workspaceId);
		} catch {
			connection.close(1011, "Unauthorized");
			return;
		}

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
		return connection.state?.canMutate !== true;
	}

	override async onLoad() {
		const room = getDocumentSessionRoomNameParts(this.name);
		const kernel = await this.getWorkspaceKernel(room.workspaceId);
		const { item, content } = await kernel.readItem({ itemId: room.itemId });

		if (item.type !== "document") {
			throw new Error("Document session can only open document items.");
		}

		const persistedUpdate = await this.ctx.storage.get<Uint8Array>(persistedYDocUpdateKey);

		if (persistedUpdate) {
			Y.applyUpdate(this.document, persistedUpdate, this);
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
		await this.persistYDoc();
		await this.checkpointToKernel();
	}

	async applyMarkdownEdits(
		input: DocumentSessionApplyMarkdownEditsInput,
	): Promise<DocumentSessionApplyMarkdownEditsResult> {
		const currentDocument = this.getCurrentTiptapDocument();
		const markdown = serializeTiptapDocumentToMarkdown(currentDocument);
		const editResult = applyDocumentMarkdownEdits(markdown, input.edits);

		if (editResult.applied === 0) {
			return {
				applied: editResult.applied,
				failed: editResult.failed,
				failures: editResult.failures,
				status: editResult.status,
				warnings: [],
			};
		}

		let projection;

		try {
			projection = parseMarkdownToTiptapDocumentProjection(editResult.content);
			this.replaceCurrentDocument(projection.document);
		} catch {
			return {
				applied: 0,
				failed: input.edits.length,
				failures: [...editResult.failures, { code: "invalid_document_projection", index: -1 }],
				status: "rejected",
				warnings: [],
			};
		}

		await this.persistYDoc();
		await this.checkpointToKernel();

		return {
			applied: editResult.applied,
			failed: editResult.failed,
			failures: editResult.failures,
			status: editResult.status,
			warnings: projection.warnings,
		};
	}

	async purgeForDeletion(): Promise<void> {
		await this.ctx.storage.deleteAll();
	}

	private async checkpointToKernel() {
		const room = getDocumentSessionRoomNameParts(this.name);
		const document = coerceTiptapDocumentJson(
			yDocToProsemirrorJSON(this.document, tiptapDocumentYjsField),
		);
		const kernel = await this.getWorkspaceKernel(room.workspaceId);

		await kernel.writeItem({
			itemId: room.itemId,
			content: stringifyTiptapDocumentJson(document),
			actorUserId: null,
			clientMutationId: null,
		});
	}

	private getCurrentTiptapDocument() {
		return coerceTiptapDocumentJson(yDocToProsemirrorJSON(this.document, tiptapDocumentYjsField));
	}

	private replaceCurrentDocument(document: TiptapDocumentJson) {
		const fragment = this.document.getXmlFragment(tiptapDocumentYjsField);

		this.document.transact(() => {
			fragment.delete(0, fragment.length);
			prosemirrorJSONToYXmlFragment(getTiptapDocumentSchema(), document, fragment);
		}, this);
	}

	private async persistYDoc() {
		await this.ctx.storage.put(persistedYDocUpdateKey, Y.encodeStateAsUpdate(this.document));
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
