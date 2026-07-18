import { getDocumentSessionRoomName } from "#/features/workspaces/agent-routes";

export function getDocumentSessionFromEnv(
	env: Cloudflare.Env,
	input: { itemId: string; workspaceId: string },
) {
	return env.DocumentSession.getByName(getDocumentSessionRoomName(input));
}
