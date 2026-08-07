import type { WorkspaceContentReadResult } from "#/features/workspaces/content/workspace-content-contract";
import { capturePostHogServerEvent } from "#/integrations/posthog/server";

/**
 * Records the readiness state each file read was served in — ready, still extracting,
 * or failed — for every surface, since assistant tools and MCP share this operation.
 * The extraction event says how long the fast-pass window was; this says who was in it.
 */
export function recordWorkspaceFileReadOutcomes(input: {
	operationId: string;
	results: readonly WorkspaceContentReadResult[];
	userId: string;
	workspaceId: string;
}) {
	for (const result of input.results) {
		const properties = getFileReadProperties(result);
		if (!properties) {
			continue;
		}

		capturePostHogServerEvent({
			distinctId: input.userId,
			event: "workspace_file_read_completed",
			// Legitimate interest: ids and readiness states, no file names or content.
			consentExempt: true,
			properties: {
				...properties,
				operation_id: input.operationId,
				workspace_id: input.workspaceId,
			},
		});
	}
}

function getFileReadProperties(result: WorkspaceContentReadResult) {
	if (result.status === "pending") {
		return {
			elapsed_seconds: result.elapsedSeconds,
			phase: result.phase,
			status: "pending",
		} as const;
	}

	if (result.type !== "file") {
		return null;
	}

	return result.status === "failed"
		? ({ failure_code: result.code, status: "failed" } as const)
		: ({
				empty_page_count: result.emptyPages?.length ?? 0,
				item_id: result.itemId,
				provisional: result.provisional ?? false,
				returned_page_count: result.location.returned.length,
				status: "ready",
			} as const);
}
