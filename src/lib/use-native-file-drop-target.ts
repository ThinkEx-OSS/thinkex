import { type RefObject, useEffect } from "react";

import { hasNativeFiles } from "#/lib/native-file-drag";

export function isPromptInputLocalDropTarget(event: Event) {
	return (
		event.target instanceof Element &&
		Boolean(event.target.closest("[data-prompt-input-local-drop-target]"))
	);
}

function isPointerInsideElement(element: HTMLElement, relatedTarget: EventTarget | null) {
	return relatedTarget instanceof Node && element.contains(relatedTarget);
}

export function useNativeFileDropTarget({
	enabled = true,
	onActiveChange,
	onDrop,
	shouldHandle = () => true,
	targetRef,
}: {
	enabled?: boolean;
	onActiveChange?: (isActive: boolean) => void;
	onDrop: (files: FileList) => void;
	shouldHandle?: (event: DragEvent) => boolean;
	targetRef: RefObject<HTMLElement | null>;
}) {
	useEffect(() => {
		if (!enabled) {
			return;
		}

		const target = targetRef.current;
		if (!target) {
			return;
		}

		const setActive = (isActive: boolean) => {
			onActiveChange?.(isActive);
		};

		const canHandle = (event: DragEvent) => {
			if (!shouldHandle(event)) {
				setActive(false);
				return false;
			}

			if (!event.dataTransfer || !hasNativeFiles(event.dataTransfer)) {
				return false;
			}

			return true;
		};

		const handleDragEnterOrOver = (event: DragEvent) => {
			if (!canHandle(event)) {
				return;
			}

			const dataTransfer = event.dataTransfer;
			if (!dataTransfer) {
				return;
			}

			event.preventDefault();
			dataTransfer.dropEffect = "copy";
			setActive(true);
		};

		const handleDragLeave = (event: DragEvent) => {
			if (isPointerInsideElement(target, event.relatedTarget)) {
				return;
			}

			setActive(false);
		};

		const handleDrop = (event: DragEvent) => {
			if (!canHandle(event)) {
				return;
			}

			const dataTransfer = event.dataTransfer;
			if (!dataTransfer) {
				return;
			}

			event.preventDefault();
			setActive(false);

			if (dataTransfer.files.length > 0) {
				onDrop(dataTransfer.files);
			}
		};

		target.addEventListener("dragenter", handleDragEnterOrOver);
		target.addEventListener("dragover", handleDragEnterOrOver);
		target.addEventListener("dragleave", handleDragLeave);
		target.addEventListener("drop", handleDrop);

		return () => {
			target.removeEventListener("dragenter", handleDragEnterOrOver);
			target.removeEventListener("dragover", handleDragEnterOrOver);
			target.removeEventListener("dragleave", handleDragLeave);
			target.removeEventListener("drop", handleDrop);
			setActive(false);
		};
	}, [enabled, onActiveChange, onDrop, shouldHandle, targetRef]);
}
