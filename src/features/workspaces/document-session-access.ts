import { getServerByName } from "partyserver";

import { getDocumentSessionRoomName } from "#/features/workspaces/agent-routes";

export function getDocumentSessionFromEnv(
	env: Cloudflare.Env,
	input: { itemId: string; workspaceId: string },
) {
	return getServerByName(env.DocumentSession, getDocumentSessionRoomName(input));
}

export function getDocumentSessionStubFromEnv(
	env: Cloudflare.Env,
	input: { itemId: string; workspaceId: string },
) {
	// Lifecycle control must not initialize Yjs. In particular, deletion could
	// otherwise hydrate from a workspace item after that item has been removed.
	return env.DocumentSession.getByName(getDocumentSessionRoomName(input));
}
