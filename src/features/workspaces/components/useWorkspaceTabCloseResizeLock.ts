import { useCallback, useLayoutEffect, useRef, useState } from "react";

import {
	createWorkspaceTabCloseResizeLock,
	getWorkspaceTabCloseResizeLockView,
	IDLE_WORKSPACE_TAB_CLOSE_RESIZE_LOCK,
	reconcileWorkspaceTabCloseResizeLock,
	releaseWorkspaceTabCloseResizeLock,
	type WorkspaceTabCloseResizeLockState,
} from "#/features/workspaces/components/workspace-tab-close-resize-lock";

const WORKSPACE_TAB_CLOSE_RESIZE_LOCK_TIMEOUT_MS = 1200;
const WORKSPACE_TAB_CLOSE_RESIZE_RECLAIM_CLEANUP_MS = 200;

export function useWorkspaceTabCloseResizeLock(tabCount: number) {
	const [lockState, setLockState] = useState<WorkspaceTabCloseResizeLockState>(
		IDLE_WORKSPACE_TAB_CLOSE_RESIZE_LOCK,
	);
	const lockStateRef = useRef<WorkspaceTabCloseResizeLockState>(
		IDLE_WORKSPACE_TAB_CLOSE_RESIZE_LOCK,
	);
	const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const reclaimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const clearReleaseTimer = useCallback(() => {
		if (!releaseTimerRef.current) {
			return;
		}

		clearTimeout(releaseTimerRef.current);
		releaseTimerRef.current = null;
	}, []);
	const clearReclaimTimer = useCallback(() => {
		if (!reclaimTimerRef.current) {
			return;
		}

		clearTimeout(reclaimTimerRef.current);
		reclaimTimerRef.current = null;
	}, []);
	const setLock = useCallback((nextState: WorkspaceTabCloseResizeLockState) => {
		lockStateRef.current = nextState;
		setLockState(nextState);
	}, []);
	const release = useCallback(() => {
		clearReleaseTimer();
		clearReclaimTimer();

		const currentLock = lockStateRef.current;

		const reclaimingLock = releaseWorkspaceTabCloseResizeLock(currentLock);

		setLock(reclaimingLock);

		if (reclaimingLock.phase !== "reclaiming") {
			return;
		}

		reclaimTimerRef.current = setTimeout(() => {
			reclaimTimerRef.current = null;

			if (lockStateRef.current === reclaimingLock) {
				setLock(IDLE_WORKSPACE_TAB_CLOSE_RESIZE_LOCK);
			}
		}, WORKSPACE_TAB_CLOSE_RESIZE_RECLAIM_CLEANUP_MS);
	}, [clearReclaimTimer, clearReleaseTimer, setLock]);
	const lockFromElement = useCallback(
		(element: HTMLElement | null) => {
			const width = element?.getBoundingClientRect().width;

			if (!width) {
				return;
			}

			clearReleaseTimer();
			clearReclaimTimer();
			setLock(
				createWorkspaceTabCloseResizeLock({
					tabCount,
					tabWidth: width,
				}),
			);
			releaseTimerRef.current = setTimeout(release, WORKSPACE_TAB_CLOSE_RESIZE_LOCK_TIMEOUT_MS);
		},
		[clearReclaimTimer, clearReleaseTimer, release, setLock, tabCount],
	);

	useLayoutEffect(
		() => () => {
			clearReleaseTimer();
			clearReclaimTimer();
		},
		[clearReclaimTimer, clearReleaseTimer],
	);

	useLayoutEffect(() => {
		const nextLock = reconcileWorkspaceTabCloseResizeLock(lockStateRef.current, tabCount);

		if (nextLock === lockStateRef.current) {
			return;
		}

		if (nextLock.phase === "idle") {
			clearReleaseTimer();
			clearReclaimTimer();
		}

		setLock(nextLock);
	}, [clearReclaimTimer, clearReleaseTimer, setLock, tabCount]);

	return {
		...getWorkspaceTabCloseResizeLockView(lockState, tabCount),
		lockFromElement,
		release,
	};
}
