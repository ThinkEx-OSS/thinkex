import type { Dispatch, RefObject, SetStateAction } from "react";

import { useTypeToFocusTextInput } from "#/hooks/use-type-to-focus-text-input";

export function useTypeToFocusPrompt({
	enabled,
	setInput,
	textareaRef,
}: {
	enabled: boolean;
	setInput: Dispatch<SetStateAction<string>>;
	textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
	useTypeToFocusTextInput({
		enabled,
		inputRef: textareaRef,
		setValue: setInput,
	});
}
