import { useRef } from "react";
import { useWorkspaceRegionCaptureOverlay } from "#/features/workspaces/components/use-workspace-region-capture-overlay";
import { WorkspaceCaptureSelectionRect } from "#/features/workspaces/components/WorkspaceCaptureSelectionRect";
import type { WorkspaceRegionRect } from "#/features/workspaces/components/workspace-region-capture";

/** PDF pages need a top hit layer; EmbedPDF layers eat pointer events on the page shell. */
export function WorkspacePdfRegionCaptureOverlay({
	active,
	onCapture,
}: {
	active: boolean;
	onCapture: (region: WorkspaceRegionRect) => Promise<void>;
}) {
	const boundsRef = useRef<HTMLDivElement>(null);
	const { selectionRect, visible } = useWorkspaceRegionCaptureOverlay({
		active,
		boundsRef,
		onCapture,
	});

	if (!visible) {
		return null;
	}

	return (
		<div ref={boundsRef} className="absolute inset-0 z-[60] cursor-crosshair touch-none">
			{selectionRect ? <WorkspaceCaptureSelectionRect region={selectionRect} /> : null}
		</div>
	);
}
