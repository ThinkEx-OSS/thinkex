import type { Dispatch, RefObject, SetStateAction } from "react";
import { useEffect, useRef } from "react";

import { eventTargetsPreventTypeToFocus } from "#/lib/keyboard-event-target";

type TypeToFocusElement = HTMLInputElement | HTMLTextAreaElement;

export function useTypeToFocusTextInput({
	enabled,
	inputRef,
	setValue,
}: {
	enabled: boolean;
	inputRef: RefObject<TypeToFocusElement | null>;
	setValue: Dispatch<SetStateAction<string>>;
}) {
	const pendingCaretPositionRef = useRef<number | null>(null);

	useEffect(() => {
		if (!enabled) {
			return;
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (!shouldRouteTypingToTextInput(event)) {
				return;
			}

			const input = inputRef.current;
			if (!input || input.disabled || input.readOnly) {
				return;
			}

			event.preventDefault();
			setValue((currentValue) => {
				const nextValue = `${currentValue}${event.key}`;
				pendingCaretPositionRef.current = nextValue.length;
				return nextValue;
			});

			requestAnimationFrame(() => {
				const textInput = inputRef.current;
				if (!textInput) {
					return;
				}

				const caretPosition = pendingCaretPositionRef.current ?? textInput.value.length;
				pendingCaretPositionRef.current = null;
				textInput.focus({ preventScroll: true });
				textInput.setSelectionRange(caretPosition, caretPosition);
			});
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [enabled, inputRef, setValue]);
}

function shouldRouteTypingToTextInput(event: KeyboardEvent) {
	if (
		event.defaultPrevented ||
		event.metaKey ||
		event.ctrlKey ||
		event.altKey ||
		event.isComposing
	) {
		return false;
	}

	if (event.key.length !== 1) {
		return false;
	}

	return !eventTargetsPreventTypeToFocus(event);
}
