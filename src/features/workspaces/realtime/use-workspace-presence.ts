import { useAgent } from "agents/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
	getWorkspaceKernelRealtimePath,
	workspaceKernelAgentName,
	workspaceKernelBasePath,
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
	lastSeenRevision?: number;
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
	lastSeenRevision,
	onPageChange,
	onDesync,
}: UseWorkspaceRealtimeInput) {
	const [presence, setPresence] = useState(() => getInitialPresenceState(workspaceId));
	const cachedRevisionRef = useRef(lastSeenRevision ?? 0);
	const revisionWorkspaceRef = useRef(workspaceId);
	const hasConnectedRef = useRef(false);
	const onPageChangeRef = useRef(onPageChange);
	const onDesyncRef = useRef(onDesync);

	useEffect(() => {
		onPageChangeRef.current = onPageChange;
		onDesyncRef.current = onDesync;
	});

	const currentPresence =
		presence.workspaceId === workspaceId ? presence : getInitialPresenceState(workspaceId);

	useEffect(() => {
		if (revisionWorkspaceRef.current !== workspaceId) {
			revisionWorkspaceRef.current = workspaceId;
			cachedRevisionRef.current = lastSeenRevision ?? 0;
			hasConnectedRef.current = false;
			return;
		}

		if (lastSeenRevision === undefined) {
			return;
		}

		cachedRevisionRef.current = lastSeenRevision;
	}, [lastSeenRevision, workspaceId]);

	const handleOpen = useCallback(() => {
		setPresence((current) => ({
			...current,
			status: "connected",
			workspaceId,
		}));
		if (hasConnectedRef.current) {
			onDesyncRef.current?.();
		}
		hasConnectedRef.current = true;
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

			if (message?.type === "presence.snapshot" && message.workspaceId === workspaceId) {
				setPresence((current) => ({
					...current,
					users: message.users,
					workspaceId,
				}));
			}

			if (message.type !== "presence.snapshot" && message.workspaceId === workspaceId) {
				if (message.revision <= cachedRevisionRef.current) {
					return;
				}

				cachedRevisionRef.current = message.revision;
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
		agent: workspaceKernelAgentName,
		basePath: workspaceKernelBasePath,
		path: getWorkspaceKernelRealtimePath(workspaceId),
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
