import { getClientOrigin } from "#/lib/client-url";

export const userAIAgentName = "UserAIStore";
export const aiThreadAgentName = "AIThread";
export const userAIPathPrefix = "/user-ai";
export const userAIBasePath = "user-ai";

export const workspaceKernelAgentName = "WorkspaceKernel";
export const workspaceKernelPathPrefix = "/workspace-kernel";
export const workspaceKernelBasePath = "workspace-kernel";
export const workspaceKernelRealtimeSegment = "realtime";
export const documentSessionPathPrefix = "/document-session";

export interface DocumentSessionRouteParams {
	workspaceId: string;
	itemId: string;
}

export function isUserAIRequestPath(pathname: string) {
	return matchesPathPrefix(pathname, userAIPathPrefix);
}

export function isWorkspaceKernelRequestPath(pathname: string) {
	return pathname.startsWith(`${workspaceKernelPathPrefix}/`);
}

export function isDocumentSessionRequestPath(pathname: string) {
	return pathname.startsWith(`${documentSessionPathPrefix}/`);
}

export function getWorkspaceKernelRouteWorkspaceId(pathname: string) {
	if (!isWorkspaceKernelRequestPath(pathname)) {
		return null;
	}

	const [workspaceId] = pathname.slice(workspaceKernelPathPrefix.length + 1).split("/");

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

export function getWorkspaceKernelRealtimePath(workspaceId: string) {
	return `${workspaceId}/${workspaceKernelRealtimeSegment}`;
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
