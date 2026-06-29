import { type RefObject, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
	getLocalPointerPosition,
	isValidCaptureRegion,
	regionRectFromTwoPoints,
	type WorkspaceRegionRect,
} from "#/features/workspaces/components/workspace-region-capture";

type CaptureDraft = {
	current: { x: number; y: number };
	start: { x: number; y: number };
};

export function useWorkspaceRegionCaptureOverlay({
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
	const [draft, setDraft] = useState<CaptureDraft | null>(null);
	const draftRef = useRef(draft);
	const activeRef = useRef(active);
	const isCapturingRef = useRef(false);
	const onCaptureRef = useRef(onCapture);
	const deferCaptureSelectionRef = useRef(deferCaptureSelection);

	useEffect(() => {
		draftRef.current = draft;
	}, [draft]);

	useEffect(() => {
		activeRef.current = active;
	}, [active]);

	useEffect(() => {
		onCaptureRef.current = onCapture;
	}, [onCapture]);

	useEffect(() => {
		deferCaptureSelectionRef.current = deferCaptureSelection;
	}, [deferCaptureSelection]);

	const visible = active || draft;
	const selectionRect = draft ? regionRectFromTwoPoints(draft.start, draft.current) : null;

	useEffect(() => {
		if (!visible) {
			return;
		}

		const bounds = boundsRef.current;

		if (!bounds) {
			return;
		}

		const handlePointerDown = (event: PointerEvent) => {
			if (!activeRef.current || isCapturingRef.current || event.button !== 0) {
				return;
			}

			if (deferCaptureSelectionRef.current?.()) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();
			bounds.setPointerCapture(event.pointerId);

			const start = getLocalPointerPosition(event, bounds);
			setDraft({ current: start, start });
		};

		const handlePointerMove = (event: PointerEvent) => {
			if (!draftRef.current) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();

			const pointerPosition = getLocalPointerPosition(event, bounds);

			setDraft((current) =>
				current
					? {
							...current,
							current: pointerPosition,
						}
					: current,
			);
		};

		const handlePointerUp = (event: PointerEvent) => {
			void finishCapture(
				event,
				bounds,
				draftRef.current,
				isCapturingRef,
				setDraft,
				onCaptureRef.current,
			);
		};

		const handlePointerCancel = () => {
			setDraft(null);
		};

		const listenerOptions = { capture: true };

		bounds.addEventListener("pointerdown", handlePointerDown, listenerOptions);
		bounds.addEventListener("pointermove", handlePointerMove, listenerOptions);
		bounds.addEventListener("pointerup", handlePointerUp, listenerOptions);
		bounds.addEventListener("pointercancel", handlePointerCancel, listenerOptions);

		return () => {
			bounds.removeEventListener("pointerdown", handlePointerDown, listenerOptions);
			bounds.removeEventListener("pointermove", handlePointerMove, listenerOptions);
			bounds.removeEventListener("pointerup", handlePointerUp, listenerOptions);
			bounds.removeEventListener("pointercancel", handlePointerCancel, listenerOptions);
		};
	}, [boundsRef, visible]);

	return { selectionRect, visible };
}

async function finishCapture(
	event: PointerEvent,
	boundsElement: HTMLElement,
	draft: CaptureDraft | null,
	isCapturingRef: { current: boolean },
	setDraft: (value: null) => void,
	onCapture: (region: WorkspaceRegionRect) => Promise<void>,
) {
	if (!draft) {
		return;
	}

	event.preventDefault();
	event.stopPropagation();

	if (boundsElement.hasPointerCapture(event.pointerId)) {
		boundsElement.releasePointerCapture(event.pointerId);
	}

	const region = regionRectFromTwoPoints(
		draft.start,
		getLocalPointerPosition(event, boundsElement),
	);
	setDraft(null);

	if (!isValidCaptureRegion(region)) {
		return;
	}

	isCapturingRef.current = true;

	try {
		await onCapture(region);
	} catch (error) {
		console.warn("[WorkspaceRegionCapture] Failed to capture region", error);
		toast.error("Could not capture that region. Try again.");
	} finally {
		isCapturingRef.current = false;
	}
}
