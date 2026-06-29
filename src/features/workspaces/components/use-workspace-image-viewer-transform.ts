import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

import {
	DEFAULT_IMAGE_VIEWER_TRANSFORM,
	type ImageViewerTransform,
	setupImageViewerGestures,
} from "#/features/workspaces/components/workspace-image-viewer-gestures";

export function useWorkspaceImageViewerTransform({
	enabled,
	isCaptureActive,
}: {
	enabled: boolean;
	isCaptureActive: boolean;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [transform, setTransform] = useState<ImageViewerTransform>(DEFAULT_IMAGE_VIEWER_TRANSFORM);
	const transformRef = useRef(transform);
	const gestureStateRef = useRef({
		captureActive: isCaptureActive,
		spacePressed: false,
	});

	useEffect(() => {
		transformRef.current = transform;
	}, [transform]);

	useEffect(() => {
		gestureStateRef.current.captureActive = isCaptureActive;
	}, [isCaptureActive]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container || !enabled) {
			return;
		}

		return setupImageViewerGestures({
			container,
			gestureState: gestureStateRef,
			getTransform: () => transformRef.current,
			setTransform,
		});
	}, [enabled]);

	const deferCaptureSelection = useCallback(
		() => gestureStateRef.current.captureActive && gestureStateRef.current.spacePressed,
		[],
	);

	return {
		containerRef: containerRef as RefObject<HTMLDivElement>,
		contentStyle: {
			height: "100%",
			transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
			transformOrigin: "0 0",
			width: "100%",
		},
		deferCaptureSelection,
	};
}
