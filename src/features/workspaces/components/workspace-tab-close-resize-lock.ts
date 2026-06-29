export type WorkspaceTabCloseResizeLockState =
	| {
			phase: "idle";
	  }
	| {
			phase: "locked";
			tabCount: number;
			nextTabCount: number | null;
			tabWidth: number;
	  }
	| {
			phase: "reclaiming";
			tabCount: number;
	  };

export const IDLE_WORKSPACE_TAB_CLOSE_RESIZE_LOCK: WorkspaceTabCloseResizeLockState = {
	phase: "idle",
};

export function createWorkspaceTabCloseResizeLock(input: {
	tabCount: number;
	tabWidth: number;
}): WorkspaceTabCloseResizeLockState {
	return {
		phase: "locked",
		tabCount: input.tabCount,
		nextTabCount: input.tabCount > 0 ? input.tabCount - 1 : null,
		tabWidth: input.tabWidth,
	};
}

export function releaseWorkspaceTabCloseResizeLock(
	lockState: WorkspaceTabCloseResizeLockState,
): WorkspaceTabCloseResizeLockState {
	if (lockState.phase !== "locked") {
		return IDLE_WORKSPACE_TAB_CLOSE_RESIZE_LOCK;
	}

	return {
		phase: "reclaiming",
		tabCount: lockState.tabCount,
	};
}

export function reconcileWorkspaceTabCloseResizeLock(
	lockState: WorkspaceTabCloseResizeLockState,
	tabCount: number,
): WorkspaceTabCloseResizeLockState {
	if (lockState.phase === "idle" || lockState.tabCount === tabCount) {
		return lockState;
	}

	if (lockState.phase === "locked" && lockState.nextTabCount === tabCount) {
		return {
			...lockState,
			tabCount,
			nextTabCount: null,
		};
	}

	return IDLE_WORKSPACE_TAB_CLOSE_RESIZE_LOCK;
}

export function getWorkspaceTabCloseResizeLockView(
	lockState: WorkspaceTabCloseResizeLockState,
	tabCount: number,
) {
	const appliesToCurrentTabSet = doesWorkspaceTabCloseResizeLockApplyToTabCount(
		lockState,
		tabCount,
	);

	return {
		lockedTabWidth:
			appliesToCurrentTabSet && lockState.phase === "locked" ? lockState.tabWidth : null,
		shouldAnimateResize: appliesToCurrentTabSet,
	};
}

function doesWorkspaceTabCloseResizeLockApplyToTabCount(
	lockState: WorkspaceTabCloseResizeLockState,
	tabCount: number,
) {
	if (lockState.phase === "idle") {
		return false;
	}

	if (lockState.tabCount === tabCount) {
		return true;
	}

	return lockState.phase === "locked" && lockState.nextTabCount === tabCount;
}
