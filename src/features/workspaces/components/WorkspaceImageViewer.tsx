import { useCallback, useRef, useState } from "react";
import { Spinner } from "#/components/ui/spinner";
import { useWorkspaceImageViewerTransform } from "#/features/workspaces/components/use-workspace-image-viewer-transform";
import {
	WorkspaceCaptureShortcuts,
	WorkspaceCaptureViewerFrame,
} from "#/features/workspaces/components/WorkspaceCaptureChrome";
import { useFileItemToolbar } from "#/features/workspaces/components/WorkspaceItemToolbarSlot";
import { WorkspaceImageRegionCaptureOverlay } from "#/features/workspaces/components/WorkspaceRegionCaptureOverlay";
import { useWorkspaceViewCapabilities } from "#/features/workspaces/components/workspace-view-policy";
import { renderImageRegionCapture } from "#/features/workspaces/components/workspace-image-capture";
import { createCaptureAttachmentFile } from "#/features/workspaces/components/workspace-region-capture";
import { stageCaptureAttachmentToComposerWithFeedback } from "#/features/workspaces/composer/workspace-composer-actions";
import type { WorkspaceItem } from "#/features/workspaces/model/types";
import { getWorkspaceFileContentUrl } from "#/features/workspaces/model/workspace-file";
import { cn } from "#/lib/utils";

interface WorkspaceImageViewerProps {
	item: WorkspaceItem;
	toolbarSlotId?: string;
	workspaceId: string;
}

export default function WorkspaceImageViewer({
	item,
	toolbarSlotId,
	workspaceId,
}: WorkspaceImageViewerProps) {
	const fileUrl = getWorkspaceFileContentUrl(workspaceId, item.id);

	return (
		<WorkspaceImageViewerContent
			key={fileUrl}
			fileUrl={fileUrl}
			item={item}
			toolbarSlotId={toolbarSlotId}
			workspaceId={workspaceId}
		/>
	);
}

function WorkspaceImageViewerContent({
	fileUrl,
	item,
	toolbarSlotId,
	workspaceId,
}: {
	fileUrl: string;
	item: WorkspaceItem;
	toolbarSlotId?: string;
	workspaceId: string;
}) {
	const imageRef = useRef<HTMLImageElement>(null);
	const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
	const [isCaptureActive, setIsCaptureActive] = useState(false);
	const enableFileCapture = useWorkspaceViewCapabilities().fileCapture;
	const captureActive = enableFileCapture && isCaptureActive;
	const exitCapture = useCallback(() => {
		setIsCaptureActive(false);
	}, []);
	const toggleCapture = useCallback(() => {
		setIsCaptureActive((current) => !current);
	}, []);
	const { containerRef, contentStyle, deferCaptureSelection } = useWorkspaceImageViewerTransform({
		enabled: status !== "error",
		isCaptureActive: captureActive,
	});

	useFileItemToolbar({
		capture: enableFileCapture
			? {
					isActive: captureActive,
					onToggle: toggleCapture,
				}
			: undefined,
		fileName: item.name,
		fileUrl,
		slotId: toolbarSlotId ?? item.id,
	});

	const handleImageLoad = useCallback(() => {
		setStatus("ready");
	}, []);

	const handleCapture = useCallback(
		async (region: Parameters<typeof renderImageRegionCapture>[1]) => {
			const image = imageRef.current;
			const viewer = containerRef.current;

			if (!image || !viewer) {
				throw new Error("Image viewer is not ready.");
			}

			const blob = await renderImageRegionCapture(image, region, viewer);
			stageCaptureAttachmentToComposerWithFeedback(
				workspaceId,
				createCaptureAttachmentFile({
					blob,
					fileName: item.name,
					suffix: "capture",
				}),
			);
		},
		[containerRef, item.name, workspaceId],
	);

	return (
		<div
			ref={containerRef}
			className={cn(
				"relative h-full min-h-0 overflow-hidden bg-background touch-none",
				captureActive ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing",
			)}
		>
			{status === "loading" ? (
				<div className="absolute inset-0 flex items-center justify-center">
					<Spinner className="size-4" />
				</div>
			) : null}
			{status === "error" ? (
				<div className="flex h-full items-center justify-center">
					<div className="flex flex-col items-center gap-3 text-center text-muted-foreground text-sm">
						<p>Unable to load this image.</p>
						<a
							className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 font-medium text-foreground text-sm shadow-xs transition-colors hover:bg-muted"
							download={item.name}
							href={fileUrl}
						>
							Download original file
						</a>
					</div>
				</div>
			) : (
				<div className="h-full w-full" style={contentStyle}>
					<img
						ref={imageRef}
						alt={item.name}
						className="h-full w-full select-none object-contain"
						draggable={false}
						src={fileUrl}
						onError={() => {
							setStatus("error");
						}}
						onLoad={handleImageLoad}
					/>
				</div>
			)}
			{enableFileCapture && status === "ready" ? (
				<WorkspaceImageRegionCaptureOverlay
					active={captureActive}
					boundsRef={containerRef}
					onCapture={handleCapture}
					deferCaptureSelection={deferCaptureSelection}
				/>
			) : null}
			{enableFileCapture ? (
				<>
					<WorkspaceCaptureViewerFrame active={captureActive} />
					<WorkspaceCaptureShortcuts
						isActive={captureActive}
						onExit={exitCapture}
						onToggle={toggleCapture}
					/>
				</>
			) : null}
		</div>
	);
}
