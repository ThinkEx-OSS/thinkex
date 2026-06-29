import type { WorkspaceRealtimeEvent } from "#/features/workspaces/realtime/messages";

export const WORKSPACE_LOCAL_MUTATION_ECHO_TTL_MS = 30_000;

type WorkspaceClientMutationInput = {
	clientMutationId?: string;
};

const localClientMutationIds = new Set<string>();
const localClientMutationTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

export function trackWorkspaceClientMutationId(clientMutationId: string) {
	localClientMutationIds.add(clientMutationId);
	const existingTimeout = localClientMutationTimeouts.get(clientMutationId);

	if (existingTimeout) {
		clearTimeout(existingTimeout);
	}

	localClientMutationTimeouts.set(
		clientMutationId,
		setTimeout(() => {
			forgetWorkspaceClientMutationId(clientMutationId);
		}, WORKSPACE_LOCAL_MUTATION_ECHO_TTL_MS),
	);
}

export function forgetWorkspaceClientMutationId(clientMutationId: string) {
	localClientMutationIds.delete(clientMutationId);
	const existingTimeout = localClientMutationTimeouts.get(clientMutationId);

	if (existingTimeout) {
		clearTimeout(existingTimeout);
		localClientMutationTimeouts.delete(clientMutationId);
	}
}

export function shouldIgnoreWorkspaceClientMutationEcho(event: WorkspaceRealtimeEvent) {
	if (!event.clientMutationId) {
		return false;
	}

	if (!localClientMutationIds.has(event.clientMutationId)) {
		return false;
	}

	forgetWorkspaceClientMutationId(event.clientMutationId);
	return true;
}

export function prepareWorkspaceClientMutationInput<TInput extends WorkspaceClientMutationInput>(
	input: TInput,
) {
	const clientMutationId = input.clientMutationId ?? crypto.randomUUID();
	trackWorkspaceClientMutationId(clientMutationId);

	return {
		...input,
		clientMutationId,
	};
}
