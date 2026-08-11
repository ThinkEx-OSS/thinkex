import { useAgent } from "agents/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
	getWorkspaceKernelRealtimePath,
	workspaceKernelAgentName,
	workspaceKernelBasePath,
} from "#/features/workspaces/agent-routes";
import { parseWorkspaceRealtimeServerMessage, type WorkspacePresenceUser } from "./messages";

type ConnectionStatus = "connecting" | "connected" | "disconnected";

interface PresenceState {
	status: ConnectionStatus;
	users: WorkspacePresenceUser[];
	workspaceId: string;
}

interface UseWorkspaceRealtimeInput {
	workspaceId: string;
	lastSeenRevision?: number;
	onWorkspaceChanged?: () => void;
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
	onWorkspaceChanged,
}: UseWorkspaceRealtimeInput) {
	const [presence, setPresence] = useState(() => getInitialPresenceState(workspaceId));
	const cachedRevisionRef = useRef(lastSeenRevision ?? 0);
	const revisionWorkspaceRef = useRef(workspaceId);
	const onWorkspaceChangedRef = useRef(onWorkspaceChanged);

	useEffect(() => {
		onWorkspaceChangedRef.current = onWorkspaceChanged;
	});

	const currentPresence =
		presence.workspaceId === workspaceId ? presence : getInitialPresenceState(workspaceId);

	useEffect(() => {
		if (revisionWorkspaceRef.current !== workspaceId) {
			revisionWorkspaceRef.current = workspaceId;
			cachedRevisionRef.current = lastSeenRevision ?? 0;
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
		onWorkspaceChangedRef.current?.();
	}, [workspaceId]);

	const handleClose = useCallback(() => {
		setPresence({
			status: "disconnected",
			users: [],
			workspaceId,
		});
		onWorkspaceChangedRef.current?.();
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

			if (
				message?.type === "workspace.changed" &&
				message.workspaceId === workspaceId &&
				message.revision > cachedRevisionRef.current
			) {
				onWorkspaceChangedRef.current?.();
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
