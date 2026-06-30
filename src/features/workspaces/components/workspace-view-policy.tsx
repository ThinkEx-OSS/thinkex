import { createContext, type ReactNode, use, useSyncExternalStore } from "react";

const WORKSPACE_DESKTOP_MEDIA_QUERY = "(min-width: 640px)";

export type WorkspaceViewportMode = "desktop" | "mobile";

export interface WorkspaceViewCapabilities {
	contextMenus: boolean;
	fileCapture: boolean;
}

const desktopWorkspaceViewCapabilities: WorkspaceViewCapabilities = {
	contextMenus: true,
	fileCapture: true,
};

const mobileWorkspaceViewCapabilities: WorkspaceViewCapabilities = {
	contextMenus: false,
	fileCapture: false,
};

const WorkspaceViewCapabilitiesContext = createContext<WorkspaceViewCapabilities>(
	desktopWorkspaceViewCapabilities,
);

function subscribeToWorkspaceViewportChange(onChange: () => void) {
	const media = window.matchMedia(WORKSPACE_DESKTOP_MEDIA_QUERY);

	media.addEventListener("change", onChange);

	return () => media.removeEventListener("change", onChange);
}

function getWorkspaceViewportSnapshot(): WorkspaceViewportMode {
	return window.matchMedia(WORKSPACE_DESKTOP_MEDIA_QUERY).matches ? "desktop" : "mobile";
}

function getWorkspaceViewportServerSnapshot(): WorkspaceViewportMode {
	return "desktop";
}

export function useWorkspaceViewPolicy() {
	const viewportMode = useSyncExternalStore(
		subscribeToWorkspaceViewportChange,
		getWorkspaceViewportSnapshot,
		getWorkspaceViewportServerSnapshot,
	);

	return {
		capabilities:
			viewportMode === "desktop"
				? desktopWorkspaceViewCapabilities
				: mobileWorkspaceViewCapabilities,
		viewportMode,
	};
}

export function WorkspaceViewCapabilitiesProvider({
	capabilities,
	children,
}: {
	capabilities: WorkspaceViewCapabilities;
	children: ReactNode;
}) {
	return (
		<WorkspaceViewCapabilitiesContext value={capabilities}>
			{children}
		</WorkspaceViewCapabilitiesContext>
	);
}

export function useWorkspaceViewCapabilities() {
	return use(WorkspaceViewCapabilitiesContext);
}
