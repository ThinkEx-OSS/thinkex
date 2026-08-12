import { type WorkspacePage, workspacePageSchema } from "#/features/workspaces/contracts";

const VERSION_SKEW_RELOAD_KEY = "thinkex.workspace-page.version-skew-reload";

// The running bundle validates every workspace page payload against the schema
// it was built with. A mismatch means a newer deploy dropped or reshaped a
// field this bundle still reads, so the tab is stale. The bundle then reloads
// to pull the current build instead of letting a downstream read crash render.
export function parseWorkspacePagePayload(payload: unknown): WorkspacePage | null {
	const parsed = workspacePageSchema.safeParse(payload);
	return parsed.success ? parsed.data : null;
}

// Reload at most once per tab. If the payload still fails after the reload, the
// cause is not version skew, so the caller falls back to the error boundary
// instead of looping. Returns true when a reload starts.
export function reloadOnceForVersionSkew(): boolean {
	if (typeof window === "undefined") {
		return false;
	}
	try {
		if (window.sessionStorage.getItem(VERSION_SKEW_RELOAD_KEY) === "1") {
			return false;
		}
		window.sessionStorage.setItem(VERSION_SKEW_RELOAD_KEY, "1");
	} catch {
		// A blocked sessionStorage keeps no marker, so the tab may reload twice.
		// That stays recoverable and never loops.
	}
	window.location.reload();
	return true;
}

export function clearVersionSkewReload(): void {
	if (typeof window === "undefined") {
		return;
	}
	try {
		window.sessionStorage.removeItem(VERSION_SKEW_RELOAD_KEY);
	} catch {
		// A blocked sessionStorage leaves no marker to clear.
	}
}
