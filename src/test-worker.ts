import { Workspace as ShellWorkspace } from "@cloudflare/shell";
import { DurableObject } from "cloudflare:workers";

import { WorkspaceKernelEventBus } from "#/features/workspaces/kernel/workspace-kernel-events";
import { WorkspaceKernelItemCommands } from "#/features/workspaces/kernel/workspace-kernel-item-commands";
import {
	initializeWorkspaceKernelStorage,
	type WorkspaceKernelSql,
} from "#/features/workspaces/kernel/workspace-kernel-schema";
import { WorkspaceKernelStore } from "#/features/workspaces/kernel/workspace-kernel-store";
import {
	applyDocumentMarkdownEdits,
	type DocumentMarkdownEdit,
} from "#/features/workspaces/documents/document-markdown-edits";
import type {
	CreateWorkspaceKernelItemArgs,
	DeleteWorkspaceKernelItemsArgs,
	ListWorkspaceKernelItemsArgs,
	MoveWorkspaceKernelItemsArgs,
	ReadWorkspaceKernelItemArgs,
	RenameWorkspaceKernelItemArgs,
	UpdateWorkspaceKernelItemColorArgs,
	UpdateWorkspaceKernelItemLinksArgs,
	WriteWorkspaceKernelItemArgs,
} from "#/features/workspaces/kernel/workspace-kernel-types";

const workspaceKernelInlineThresholdBytes = 1_500_000;

export class DocumentSession extends DurableObject<Env> {
	async applyMarkdownEdits(input: { edits: DocumentMarkdownEdit[] }) {
		const result = applyDocumentMarkdownEdits("", input.edits);

		return {
			applied: result.applied,
			failed: result.failed,
			failures: result.failures,
			status: result.status,
			warnings: [],
		};
	}

	async purgeForDeletion() {
		await this.ctx.storage.deleteAll();
	}
}

export class WorkspaceKernel extends DurableObject<Env> {
	private workspaceName: string | null = null;
	private readonly kernelSql: WorkspaceKernelSql = <T = Record<string, unknown>>(
		strings: TemplateStringsArray,
		...values: (string | number | boolean | null)[]
	) => this.ctx.storage.sql.exec(createSqlQuery(strings), ...values).toArray() as unknown as T[];
	private readonly workspace = new ShellWorkspace({
		sql: this.ctx.storage.sql,
		r2: this.env.WORKSPACE_KERNEL_FILES,
		inlineThreshold: workspaceKernelInlineThresholdBytes,
		namespace: "workspace_kernel_files",
		name: () => this.name,
	});
	private readonly store = new WorkspaceKernelStore({
		sql: this.kernelSql,
		workspaceId: () => this.name,
	});
	private readonly events = new WorkspaceKernelEventBus({
		sql: this.kernelSql,
		workspaceId: () => this.name,
		getNextRevision: () => this.store.getNextRevision(),
		broadcast: () => {},
	});
	private readonly itemCommands = new WorkspaceKernelItemCommands({
		events: this.events,
		sql: this.kernelSql,
		store: this.store,
		workspace: this.workspace,
		workspaceId: () => this.name,
	});

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		initializeWorkspaceKernelStorage(this.kernelSql);
	}

	setName(name: string) {
		this.workspaceName = name;
	}

	async getPage() {
		return {
			workspaceId: this.name,
			items: this.store.getPageItems(),
			revision: this.store.getCurrentRevision(),
		};
	}

	async listItems(input: ListWorkspaceKernelItemsArgs = {}) {
		return this.store.listItems(input);
	}

	async createItem(input: CreateWorkspaceKernelItemArgs) {
		return await this.itemCommands.createItem(input);
	}

	async renameItem(input: RenameWorkspaceKernelItemArgs) {
		return await this.itemCommands.renameItem(input);
	}

	async moveItems(input: MoveWorkspaceKernelItemsArgs) {
		return await this.itemCommands.moveItems(input);
	}

	async updateItemColor(input: UpdateWorkspaceKernelItemColorArgs) {
		return await this.itemCommands.updateItemColor(input);
	}

	async updateItemLinks(input: UpdateWorkspaceKernelItemLinksArgs) {
		return await this.itemCommands.updateItemLinks(input);
	}

	async deleteItems(input: DeleteWorkspaceKernelItemsArgs) {
		return await this.itemCommands.deleteItems(input);
	}

	async readItem(input: ReadWorkspaceKernelItemArgs) {
		return await this.itemCommands.readItem(input);
	}

	async writeItem(input: WriteWorkspaceKernelItemArgs) {
		return await this.itemCommands.writeItem(input);
	}

	private get name() {
		return this.workspaceName ?? this.ctx.id.name ?? this.ctx.id.toString();
	}
}

function createSqlQuery(strings: TemplateStringsArray) {
	return strings.reduce((query, part, index) => {
		return `${query}${part}${index < strings.length - 1 ? "?" : ""}`;
	}, "");
}

export default {
	fetch() {
		return new Response("OK");
	},
} satisfies ExportedHandler<Env>;
