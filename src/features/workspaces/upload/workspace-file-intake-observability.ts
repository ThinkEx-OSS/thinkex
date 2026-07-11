import { recordOperationalOutcome } from "#/integrations/observability/operational-events";
import type { PostHogEventPropertiesByName } from "#/integrations/posthog/events";
import { capturePostHogServerEvent } from "#/integrations/posthog/server";
import {
	getTelemetryRequestContext,
	getTelemetryRequestDetails,
} from "#/integrations/posthog/server-context";

export type WorkspaceFileIntakeKind = "chat_attachment" | "workspace_file";
export type WorkspaceFileIntakePlan = "document" | "file";

export interface WorkspaceFileIntakeObservation {
	assetKind?: string;
	conversion?: string;
	error?: unknown;
	inputBytes?: number;
	itemId?: string;
	outputBytes?: number;
	plan?: WorkspaceFileIntakePlan;
	userId?: string;
}

export async function observeWorkspaceFileIntake(input: {
	kind: WorkspaceFileIntakeKind;
	request: Request;
	requestId: string;
	run: (observation: WorkspaceFileIntakeObservation) => Promise<Response>;
	workspaceId: string;
}) {
	const observation: WorkspaceFileIntakeObservation = {};
	const startedAt = Date.now();
	let response: Response | undefined;

	try {
		response = await input.run(observation);
		return response;
	} catch (error) {
		observation.error = error;
		throw error;
	} finally {
		const outcome = getFileIntakeOutcome(response, observation.error);
		const requestDetails = getTelemetryRequestDetails(
			input.request,
			"workspace_file_intake",
			input.requestId,
		);
		const requestContext = getTelemetryRequestContext(requestDetails);
		const fields: PostHogEventPropertiesByName["workspace_file_intake_completed"] = {
			asset_kind: observation.assetKind ?? null,
			conversion: observation.conversion ?? null,
			duration_ms: Date.now() - startedAt,
			error_code: response?.headers.get("x-error-code") ?? null,
			input_bytes: observation.inputBytes ?? null,
			intake_kind: input.kind,
			item_id: observation.itemId ?? null,
			outcome,
			output_bytes: observation.outputBytes ?? null,
			plan_kind: observation.plan ?? null,
			status_code: response?.status ?? 500,
			workspace_id: input.workspaceId,
		};

		recordOperationalOutcome({
			distinctId: observation.userId,
			error: observation.error,
			event: "workspace_file_intake",
			fields: { ...fields, user_id: observation.userId },
			outcome,
			requestContext,
		});
		capturePostHogServerEvent({
			distinctId: observation.userId ?? input.requestId,
			event: "workspace_file_intake_completed",
			properties: fields,
			requestContext,
		});
	}
}

function getFileIntakeOutcome(
	response: Response | undefined,
	error: unknown,
): "error" | "rejected" | "success" {
	if (response?.ok) {
		return "success";
	}

	return error === undefined ? "rejected" : "error";
}
