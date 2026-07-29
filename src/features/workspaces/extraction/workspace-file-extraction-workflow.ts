import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

import type { WorkspaceFileExtractionWorkflowParams } from "#/features/workspaces/extraction/types";
import { markWorkspaceFileExtractionProcessing } from "#/features/workspaces/extraction/workspace-file-extraction-state";
import { runWorkspaceImageExtraction } from "#/features/workspaces/extraction/workspace-image-extraction";
import { runWorkspacePdfExtraction } from "#/features/workspaces/extraction/workspace-pdf-extraction";

export class WorkspaceFileExtractionWorkflow extends WorkflowEntrypoint<
	Cloudflare.Env,
	WorkspaceFileExtractionWorkflowParams
> {
	async run(
		event: Readonly<WorkflowEvent<WorkspaceFileExtractionWorkflowParams>>,
		step: WorkflowStep,
	) {
		const params = assertWorkflowParams(event.payload);
		const schedule = (task: Promise<void>) => this.ctx.waitUntil(task);

		await markWorkspaceFileExtractionProcessing(this.env, step, params, event.instanceId);

		const input = {
			env: this.env,
			event,
			params,
			schedule,
			step,
		};

		return params.assetKind === "pdf"
			? runWorkspacePdfExtraction(input)
			: runWorkspaceImageExtraction(input);
	}
}

function assertWorkflowParams(
	value: Readonly<WorkspaceFileExtractionWorkflowParams>,
): WorkspaceFileExtractionWorkflowParams {
	if (!value.workspaceId || !value.itemId || !value.assetKind) {
		throw new Error("Invalid workspace file extraction payload.");
	}

	return {
		workspaceId: value.workspaceId,
		itemId: value.itemId,
		actorUserId: value.actorUserId ?? null,
		assetKind: value.assetKind,
		requestId: value.requestId ?? null,
	};
}
