import { useAgent } from "agents/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
	getWorkspaceKernelRealtimePath,
	workspaceKernelAgentName,
	workspaceKernelBasePath,
} from "#/features/workspaces/agent-routes";
import {
	parseWorkspaceRealtimeServerMessage,
	type WorkspacePresenceUser,
	type WorkspaceRealtimeEvent,
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
	onEvent?: (event: WorkspaceRealtimeEvent) => void;
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
	onEvent,
	onDesync,
}: UseWorkspaceRealtimeInput) {
	const [presence, setPresence] = useState(() => getInitialPresenceState(workspaceId));
	const hasConnectedRef = useRef(false);
	const connectionWorkspaceRef = useRef(workspaceId);
	const lastSeenRevisionRef = useRef(lastSeenRevision ?? 0);
	const latestRevisionInputRef = useRef(lastSeenRevision ?? 0);
	const revisionWorkspaceRef = useRef(workspaceId);
	const onEventRef = useRef(onEvent);
	const onDesyncRef = useRef(onDesync);

	useEffect(() => {
		onEventRef.current = onEvent;
		onDesyncRef.current = onDesync;
	});

	let currentPresence = presence;
	if (presence.workspaceId !== workspaceId) {
		currentPresence = getInitialPresenceState(workspaceId);
		setPresence(currentPresence);
	}

	useEffect(() => {
		if (revisionWorkspaceRef.current !== workspaceId) {
			revisionWorkspaceRef.current = workspaceId;
			latestRevisionInputRef.current = lastSeenRevision ?? 0;
			lastSeenRevisionRef.current = lastSeenRevision ?? 0;
			return;
		}

		if (lastSeenRevision === undefined) {
			return;
		}

		latestRevisionInputRef.current = lastSeenRevision;
		lastSeenRevisionRef.current = Math.max(lastSeenRevisionRef.current, lastSeenRevision);
	}, [lastSeenRevision, workspaceId]);

	const handleOpen = useCallback(() => {
		if (connectionWorkspaceRef.current !== workspaceId) {
			connectionWorkspaceRef.current = workspaceId;
			hasConnectedRef.current = false;
		}

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
				onDesyncRef.current?.();
				return;
			}

			if (message?.type === "presence.snapshot" && message.workspaceId === workspaceId) {
				setPresence((current) => ({
					...current,
					users: message.users,
					workspaceId,
				}));
			}

			if (message?.type === "workspace.event" && message.workspaceId === workspaceId) {
				const lastSeenRevision = lastSeenRevisionRef.current;

				if (lastSeenRevision > 0 && message.event.revision > lastSeenRevision + 1) {
					onDesyncRef.current?.();
					lastSeenRevisionRef.current = message.event.revision;
					return;
				}

				lastSeenRevisionRef.current = Math.max(lastSeenRevisionRef.current, message.event.revision);
				onEventRef.current?.(message.event);
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
