import type { WorkspaceRegionRect } from "#/features/workspaces/components/workspace-region-capture";

export function WorkspaceCaptureSelectionRect({ region }: { region: WorkspaceRegionRect }) {
	return (
		<div
			className="pointer-events-none absolute rounded-sm border border-blue-500 bg-blue-500/20 shadow-[0_0_0_1px_rgba(59,130,246,0.35)]"
			style={{
				height: region.size.height,
				left: region.origin.x,
				top: region.origin.y,
				width: region.size.width,
			}}
		/>
	);
}
