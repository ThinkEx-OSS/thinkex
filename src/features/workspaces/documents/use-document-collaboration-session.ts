import { useCallback, useSyncExternalStore } from "react";
import { WebsocketProvider } from "y-partyserver/provider";
import * as Y from "yjs";

import { getDocumentSessionBaseUrl } from "#/features/workspaces/agent-routes";
import { getCollaborationUserColor } from "#/lib/design-system-colors";

const idleDestroyDelayMs = 300_000;
const maxIdleSessions = 8;

export type DocumentCollaborationStatus = "connecting" | "connected" | "disconnected";

interface DocumentCollaborationUser {
	id: string;
	image?: string | null;
	name: string;
}

export interface DocumentCollaborationSession {
	itemId: string;
	provider: WebsocketProvider;
	ready: boolean;
	status: DocumentCollaborationStatus;
	workspaceId: string;
	ydoc: Y.Doc;
}

interface CachedDocumentCollaborationSession extends DocumentCollaborationSession {
	destroy(): void;
	destroyTimer: ReturnType<typeof setTimeout> | null;
	key: string;
	lastUsedAt: number;
	publicSession: DocumentCollaborationSession | null;
	refs: number;
	subscribe(listener: () => void): () => void;
	subscribers: Set<() => void>;
}

const documentSessionCache = new Map<string, CachedDocumentCollaborationSession>();

export function useDocumentCollaborationSession(input: {
	itemId: string;
	userId: string | null;
	userImage?: string | null;
	userName: string | null;
	workspaceId: string;
}) {
	const { itemId, userId, userImage, userName, workspaceId } = input;
	const sessionKey =
		userId && userName ? getDocumentSessionCacheKey({ itemId, workspaceId }) : null;

	const subscribe = useCallback(
		(listener: () => void) => {
			if (!userId || !userName) {
				return () => {};
			}

			const cachedSession = acquireDocumentSession({
				itemId,
				user: {
					id: userId,
					image: userImage ?? null,
					name: userName,
				},
				workspaceId,
			});
			const unsubscribe = cachedSession.subscribe(listener);

			queueMicrotask(listener);

			return () => {
				unsubscribe();
				releaseDocumentSession(cachedSession);
			};
		},
		[itemId, userId, userImage, userName, workspaceId],
	);

	const getSnapshot = useCallback(() => {
		if (!userId || !userName) {
			return null;
		}

		return sessionKey ? (documentSessionCache.get(sessionKey)?.publicSession ?? null) : null;
	}, [sessionKey, userId, userName]);

	const session = useSyncExternalStore(subscribe, getSnapshot, () => null);

	return session?.workspaceId === input.workspaceId &&
		session.itemId === input.itemId &&
		input.userId &&
		input.userName &&
		session.ready
		? session
		: null;
}

function acquireDocumentSession(input: {
	itemId: string;
	user: DocumentCollaborationUser;
	workspaceId: string;
}) {
	const key = getDocumentSessionCacheKey(input);
	const cachedSession = documentSessionCache.get(key);

	if (cachedSession) {
		cachedSession.refs += 1;
		cachedSession.lastUsedAt = Date.now();
		if (cachedSession.destroyTimer) {
			clearTimeout(cachedSession.destroyTimer);
			cachedSession.destroyTimer = null;
		}
		cachedSession.provider.awareness.setLocalStateField("user", getCollaborationUser(input.user));
		return cachedSession;
	}

	const ydoc = new Y.Doc();
	const provider = new WebsocketProvider(
		getDocumentSessionBaseUrl(input.workspaceId),
		encodeURIComponent(input.itemId),
		ydoc,
		{
			disableBc: true,
			resyncInterval: 10_000,
		},
	);
	const session = createCachedDocumentSession({
		key,
		itemId: input.itemId,
		provider,
		workspaceId: input.workspaceId,
		ydoc,
	});

	provider.awareness.setLocalStateField("user", getCollaborationUser(input.user));
	documentSessionCache.set(key, session);
	pruneIdleDocumentSessions();

	return session;
}

function createCachedDocumentSession(input: {
	itemId: string;
	key: string;
	provider: WebsocketProvider;
	workspaceId: string;
	ydoc: Y.Doc;
}): CachedDocumentCollaborationSession {
	const session: CachedDocumentCollaborationSession = {
		destroy() {
			input.provider.off("status", handleStatus);
			input.provider.off("sync", handleSync);
			input.provider.destroy();
			input.ydoc.destroy();
			documentSessionCache.delete(input.key);
		},
		destroyTimer: null,
		itemId: input.itemId,
		key: input.key,
		lastUsedAt: Date.now(),
		provider: input.provider,
		publicSession: null,
		ready: input.provider.synced,
		refs: 1,
		status: input.provider.wsconnected ? "connected" : "connecting",
		subscribe(listener: () => void) {
			session.subscribers.add(listener);
			return () => {
				session.subscribers.delete(listener);
			};
		},
		subscribers: new Set<() => void>(),
		workspaceId: input.workspaceId,
		ydoc: input.ydoc,
	};
	session.publicSession = session.ready ? getPublicSession(session) : null;
	const handleStatus = (event: { status: DocumentCollaborationStatus }) => {
		session.status = event.status;
		session.publicSession = session.ready ? getPublicSession(session) : null;
		notifyDocumentSessionSubscribers(session);
	};
	const handleSync = (synced: boolean) => {
		session.ready ||= synced;
		session.publicSession = session.ready ? getPublicSession(session) : null;
		notifyDocumentSessionSubscribers(session);
	};

	input.provider.on("status", handleStatus);
	input.provider.on("sync", handleSync);

	return session;
}

function releaseDocumentSession(session: CachedDocumentCollaborationSession) {
	session.refs = Math.max(0, session.refs - 1);
	session.lastUsedAt = Date.now();

	if (session.refs > 0) {
		return;
	}

	session.provider.awareness.setLocalState(null);
	session.destroyTimer = setTimeout(() => {
		if (session.refs === 0) {
			session.destroy();
		}
	}, idleDestroyDelayMs);
}

function pruneIdleDocumentSessions() {
	const idleSessions = Array.from(documentSessionCache.values())
		.filter((session) => session.refs === 0)
		.sort((a, b) => a.lastUsedAt - b.lastUsedAt);

	while (documentSessionCache.size > maxIdleSessions && idleSessions.length) {
		idleSessions.shift()?.destroy();
	}
}

function notifyDocumentSessionSubscribers(
	session: Pick<CachedDocumentCollaborationSession, "subscribers">,
) {
	for (const subscriber of session.subscribers) {
		subscriber();
	}
}

function getPublicSession(
	session: CachedDocumentCollaborationSession,
): DocumentCollaborationSession {
	return {
		itemId: session.itemId,
		provider: session.provider,
		ready: session.ready,
		status: session.status,
		workspaceId: session.workspaceId,
		ydoc: session.ydoc,
	};
}

function getDocumentSessionCacheKey(input: { itemId: string; workspaceId: string }) {
	return `${input.workspaceId}:${input.itemId}`;
}

function getCollaborationUser(user: DocumentCollaborationUser) {
	return {
		id: user.id,
		name: user.name || "User",
		image: user.image ?? null,
		color: getCollaborationUserColor(user.id),
	};
}
