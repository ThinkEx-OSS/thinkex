import { useAgent } from "agents/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
	getWorkspaceRoomRealtimePath,
	workspaceRoomAgentName,
	workspaceRoomBasePath,
} from "#/features/workspaces/agent-routes";
import {
	parseWorkspaceRealtimeServerMessage,
	type WorkspacePageDelta,
	type WorkspacePresenceUser,
} from "./messages";

type ConnectionStatus = "connecting" | "connected" | "disconnected";

interface PresenceState {
	status: ConnectionStatus;
	users: WorkspacePresenceUser[];
	workspaceId: string;
}

interface UseWorkspaceRealtimeInput {
	workspaceId: string;
	onPageChange?: (change: WorkspacePageDelta) => void;
	onDesync?: () => void;
}

function parseServerMessage(data: unknown) {
	if (typeof data !== "string") {
		return null;
	}

	try {
		return parseWorkspaceRealtimeServerMessage(JSON.parse(data));
	} catch {
		return null;
	}
}

function getInitialPresenceState(workspaceId: string): PresenceState {
	return {
		status: "connecting",
		users: [],
		workspaceId,
	};
}

export function useWorkspaceRealtime({
	workspaceId,
	onPageChange,
	onDesync,
}: UseWorkspaceRealtimeInput) {
	const [presence, setPresence] = useState(() => getInitialPresenceState(workspaceId));
	const onPageChangeRef = useRef(onPageChange);
	const onDesyncRef = useRef(onDesync);

	useEffect(() => {
		onPageChangeRef.current = onPageChange;
		onDesyncRef.current = onDesync;
	});

	const currentPresence =
		presence.workspaceId === workspaceId ? presence : getInitialPresenceState(workspaceId);

	const handleOpen = useCallback(() => {
		setPresence((current) => ({
			...current,
			status: "connected",
			workspaceId,
		}));
		onDesyncRef.current?.();
	}, [workspaceId]);

	const handleClose = useCallback(() => {
		setPresence({
			status: "disconnected",
			users: [],
			workspaceId,
		});
	}, [workspaceId]);

	const handleError = useCallback(() => {
		setPresence((current) => ({
			...current,
			status: "disconnected",
			workspaceId,
		}));
	}, [workspaceId]);

	const handleMessage = useCallback(
		(event: MessageEvent) => {
			const message = parseServerMessage(event.data);
			if (!message) {
				return;
			}

			if (message.type === "presence.snapshot" && message.workspaceId === workspaceId) {
				setPresence((current) => ({
					...current,
					users: message.users,
					workspaceId,
				}));
			}

			if (message.type !== "presence.snapshot" && message.workspaceId === workspaceId) {
				if (message.type === "workspace.page.refresh") {
					onDesyncRef.current?.();
				} else {
					onPageChangeRef.current?.(message);
				}
			}
		},
		[workspaceId],
	);

	useAgent({
		agent: workspaceRoomAgentName,
		basePath: workspaceRoomBasePath,
		path: getWorkspaceRoomRealtimePath(workspaceId),
		onClose: handleClose,
		onError: handleError,
		onMessage: handleMessage,
		onOpen: handleOpen,
	});

	return useMemo(
		() => ({
			users: currentPresence.users,
			status: currentPresence.status,
		}),
		[currentPresence.status, currentPresence.users],
	);
}
