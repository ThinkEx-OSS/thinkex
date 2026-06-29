import type { Connection } from "agents";

import type {
	WorkspaceConnectionState,
	WorkspacePresenceUser,
} from "#/features/workspaces/realtime/messages";

const USER_ID_HEADER = "x-thinkex-user-id";
const USER_NAME_HEADER = "x-thinkex-user-name";
const USER_IMAGE_HEADER = "x-thinkex-user-image";

export function setWorkspaceKernelUserHeaders(
	request: Request,
	user: Omit<WorkspacePresenceUser, "connectionId">,
) {
	const headers = new Headers(request.headers);
	headers.set(USER_ID_HEADER, user.id);
	headers.set(USER_NAME_HEADER, user.name);

	if (user.image) {
		headers.set(USER_IMAGE_HEADER, user.image);
	} else {
		headers.delete(USER_IMAGE_HEADER);
	}

	return new Request(request, { headers });
}

export function getWorkspaceKernelUserFromHeaders(request: Request) {
	const userId = request.headers.get(USER_ID_HEADER);
	const name = request.headers.get(USER_NAME_HEADER);

	if (!userId || !name) {
		return null;
	}

	return {
		id: userId,
		name,
		image: request.headers.get(USER_IMAGE_HEADER),
	};
}

export function getWorkspaceKernelPresenceUsers(
	connections: Iterable<Connection<WorkspaceConnectionState>>,
) {
	const usersByConnectionId = new Map<string, WorkspacePresenceUser>();

	for (const connection of connections) {
		const user = connection.state?.user;

		if (!user) {
			continue;
		}

		usersByConnectionId.set(connection.id, {
			...user,
			connectionId: connection.id,
		});
	}

	return Array.from(usersByConnectionId.values()).sort((first, second) =>
		first.name.localeCompare(second.name),
	);
}
