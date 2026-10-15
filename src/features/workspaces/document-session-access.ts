import { getServerByName } from "partyserver";

import { getDocumentSessionRoomName } from "#/features/workspaces/agent-routes";
import { isTransientDurableObjectError } from "#/features/workspaces/durable-object-errors";
import { recordOperationalOutcome } from "#/integrations/observability/operational-events";

const maxSessionOpenAttempts = 3;
const sessionOpenRetryDelayMs = 100;

type DocumentSessionInput = { itemId: string; workspaceId: string };

export async function getDocumentSessionFromEnv(env: Cloudflare.Env, input: DocumentSessionInput) {
	const name = getDocumentSessionRoomName(input);
	// partyserver retries only `retryable` errors; a storage reset needs this wider check.
	for (let attempt = 1; ; attempt += 1) {
		try {
			const session = await getServerByName(env.DocumentSession, name, { routingRetry: false });
			if (attempt > 1) {
				recordSessionOpenRetry(input, attempt, true);
			}
			return session;
		} catch (error) {
			if (!isTransientDurableObjectError(error)) {
				throw error;
			}
			if (attempt === maxSessionOpenAttempts) {
				recordSessionOpenRetry(input, attempt, false);
				throw error;
			}
			await new Promise((resolve) => setTimeout(resolve, sessionOpenRetryDelayMs * attempt));
		}
	}
}

function recordSessionOpenRetry(input: DocumentSessionInput, attempts: number, recovered: boolean) {
	recordOperationalOutcome({
		event: "document_session_open_retry",
		fields: {
			attempts,
			item_id: input.itemId,
			recovered,
			workspace_id: input.workspaceId,
		},
		outcome: recovered ? "success" : "rejected",
	});
}

export function getDocumentSessionStubFromEnv(env: Cloudflare.Env, input: DocumentSessionInput) {
	// Lifecycle control must not initialize Yjs. In particular, deletion could
	// otherwise hydrate from a workspace item after that item has been removed.
	return env.DocumentSession.getByName(getDocumentSessionRoomName(input));
}
