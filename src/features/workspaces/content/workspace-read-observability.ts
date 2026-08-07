import type { WorkspaceContentReadResult } from "#/features/workspaces/content/workspace-content-contract";
import { capturePostHogServerEvent } from "#/integrations/posthog/server";

/**
 * Records the readiness state every file read was served in, across every surface
 * that reads — assistant tools and MCP both route through the same operation.
 *
 * This is the consumption side of the extraction pipeline's telemetry: the
 * extraction event says how long the fast-pass window lasted, and this says whether
 * anyone was actually in it — reads served `provisional`, reads that hit the
 * pending spinner, and reads that found a stalled or failed document.
 */
export function recordWorkspaceFileReadOutcomes(input: {
	operationId: string;
	results: readonly WorkspaceContentReadResult[];
	userId: string;
	workspaceId: string;
}) {
	for (const result of input.results) {
		if (result.status === "pending") {
			capture(input, {
				elapsed_seconds: result.elapsedSeconds,
				empty_page_count: null,
				failure_code: null,
				item_id: null,
				phase: result.phase,
				provisional: null,
				returned_page_count: null,
				status: "pending",
			});
			continue;
		}

		if (result.status === "failed" && result.type === "file") {
			capture(input, {
				elapsed_seconds: null,
				empty_page_count: null,
				failure_code: result.code,
				item_id: null,
				phase: null,
				provisional: null,
				returned_page_count: null,
				status: "failed",
			});
			continue;
		}

		if (result.status === "ready" && result.type === "file") {
			capture(input, {
				elapsed_seconds: null,
				empty_page_count: result.emptyPages?.length ?? 0,
				failure_code: null,
				item_id: result.itemId,
				phase: null,
				provisional: result.provisional ?? false,
				returned_page_count: result.location.returned.length,
				status: "ready",
			});
		}
	}
}

function capture(
	input: { operationId: string; userId: string; workspaceId: string },
	properties: {
		elapsed_seconds: number | null;
		empty_page_count: number | null;
		failure_code: string | null;
		item_id: string | null;
		phase: "queued" | "extracting" | null;
		provisional: boolean | null;
		returned_page_count: number | null;
		status: "ready" | "pending" | "failed";
	},
) {
	capturePostHogServerEvent({
		distinctId: input.userId,
		event: "workspace_file_read_completed",
		// Legitimate interest: operational readiness telemetry — ids and states only,
		// no file names or content.
		consentExempt: true,
		properties: {
			...properties,
			operation_id: input.operationId,
			workspace_id: input.workspaceId,
		},
	});
}
