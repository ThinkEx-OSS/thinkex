import { getClientOrigin } from "#/lib/client-url";

// Postgres-backed AI chat ("option zero"): plain HTTP routes served straight
// from the Worker, no Durable Object in the chat path.
export const aiChatPathPrefix = "/ai-chat";

export function isAiChatRequestPath(pathname: string) {
	return matchesPathPrefix(pathname, aiChatPathPrefix);
}

export function getAiChatThreadUrl(threadId: string) {
	return `${aiChatPathPrefix}/threads/${encodeURIComponent(threadId)}`;
}

export const workspaceRoomAgentName = "WorkspaceRoom";
export const workspaceRoomPathPrefix = "/workspace-room";
export const workspaceRoomBasePath = "workspace-room";
export const workspaceRoomRealtimeSegment = "realtime";
export const documentSessionPathPrefix = "/document-session";

export interface DocumentSessionRouteParams {
	workspaceId: string;
	itemId: string;
}

export function isWorkspaceRoomRequestPath(pathname: string) {
	return pathname.startsWith(`${workspaceRoomPathPrefix}/`);
}

export function isDocumentSessionRequestPath(pathname: string) {
	return pathname.startsWith(`${documentSessionPathPrefix}/`);
}

export function getWorkspaceRoomRouteWorkspaceId(pathname: string) {
	if (!isWorkspaceRoomRequestPath(pathname)) {
		return null;
	}

	const [workspaceId] = pathname.slice(workspaceRoomPathPrefix.length + 1).split("/");

	return workspaceId || null;
}

export function getDocumentSessionRouteParams(pathname: string) {
	if (!isDocumentSessionRequestPath(pathname)) {
		return null;
	}

	const [workspaceId, itemId] = pathname.slice(documentSessionPathPrefix.length + 1).split("/");

	if (!workspaceId || !itemId) {
		return null;
	}

	return {
		workspaceId: decodeURIComponent(workspaceId),
		itemId: decodeURIComponent(itemId),
	} satisfies DocumentSessionRouteParams;
}

export function getWorkspaceRoomRealtimePath(workspaceId: string) {
	return `${workspaceId}/${workspaceRoomRealtimeSegment}`;
}

export function getDocumentSessionRoomName(input: { itemId: string; workspaceId: string }) {
	return `${input.workspaceId}:${input.itemId}`;
}

export function getDocumentSessionBaseUrl(workspaceId: string) {
	const origin = getClientOrigin();

	if (!origin) {
		return "";
	}

	const url = new URL(`${documentSessionPathPrefix}/${encodeURIComponent(workspaceId)}`, origin);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

	return url.toString();
}

function matchesPathPrefix(pathname: string, pathPrefix: string) {
	return pathname === pathPrefix || pathname.startsWith(`${pathPrefix}/`);
}
