import type { RefObject } from "react";
import { useWorkspaceRegionCaptureOverlay } from "#/features/workspaces/components/use-workspace-region-capture-overlay";
import { WorkspaceCaptureSelectionRect } from "#/features/workspaces/components/WorkspaceCaptureSelectionRect";
import type { WorkspaceRegionRect } from "#/features/workspaces/components/workspace-region-capture";

/** Image viewer: listeners attach to the outer pan/zoom container. */
export function WorkspaceImageRegionCaptureOverlay({
	active,
	boundsRef,
	onCapture,
	deferCaptureSelection,
}: {
	active: boolean;
	boundsRef: RefObject<HTMLElement | null>;
	onCapture: (region: WorkspaceRegionRect) => Promise<void>;
	deferCaptureSelection?: () => boolean;
}) {
	const { selectionRect, visible } = useWorkspaceRegionCaptureOverlay({
		active,
		boundsRef,
		onCapture,
		deferCaptureSelection,
	});

	if (!visible) {
		return null;
	}

	return (
		<div className="pointer-events-none absolute inset-0 z-[60]">
			{selectionRect ? <WorkspaceCaptureSelectionRect region={selectionRect} /> : null}
		</div>
	);
}
