import { createContext, type ReactNode, type RefObject, use, useRef, useState } from "react";

import { usePromptInputAttachments } from "#/features/workspaces/components/ai-chat/ai-chat-prompt-input";
import {
	isPromptInputLocalDropTarget,
	useNativeFileDropTarget,
} from "#/lib/use-native-file-drop-target";

type AiChatAttachmentDropContextValue = {
	isDropActive: boolean;
	mergePanelRef: (element: HTMLElement | null) => void;
	panelRef: RefObject<HTMLElement | null>;
	setDropActive: (isActive: boolean) => void;
};

const AiChatAttachmentDropContext = createContext<AiChatAttachmentDropContextValue | null>(null);

export function AiChatAttachmentDropProvider({ children }: { children: ReactNode }) {
	const panelRef = useRef<HTMLElement | null>(null);
	const [isDropActive, setDropActive] = useState(false);
	const mergePanelRef = (element: HTMLElement | null) => {
		panelRef.current = element;
	};

	return (
		<AiChatAttachmentDropContext.Provider
			value={{
				isDropActive,
				mergePanelRef,
				panelRef,
				setDropActive,
			}}
		>
			{children}
		</AiChatAttachmentDropContext.Provider>
	);
}

export function useAiChatAttachmentDrop() {
	const context = use(AiChatAttachmentDropContext);
	if (!context) {
		throw new Error("useAiChatAttachmentDrop must be used within AiChatAttachmentDropProvider");
	}

	return context;
}

export function AiChatAttachmentDropBridge() {
	const { panelRef, setDropActive } = useAiChatAttachmentDrop();
	const { add } = usePromptInputAttachments();

	useNativeFileDropTarget({
		onActiveChange: setDropActive,
		onDrop: add,
		shouldHandle: (event) => !isPromptInputLocalDropTarget(event),
		targetRef: panelRef,
	});

	return null;
}
