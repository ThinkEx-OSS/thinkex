import type { RefObject } from "react";

import { WorkspaceFindBar } from "#/features/workspaces/components/WorkspaceFindBar";
import { useAiChatFindEngine } from "#/features/workspaces/find/use-ai-chat-find-engine";
import { useWorkspaceFind } from "#/features/workspaces/find/use-workspace-find";

/**
 * A leaf so find keystrokes re-render the bar rather than the transcript. The
 * hotkey is scoped to the panel element, so Mod+F opens chat find only when
 * focus is inside chat; the listener runs before the pane's document-level one
 * and stops propagation, so the two never open together.
 */
export function AiChatFindBar({ panelRef }: { panelRef: RefObject<HTMLElement | null> }) {
	const find = useWorkspaceFind({ hotkeyTarget: panelRef });
	const engine = useAiChatFindEngine(panelRef, find.query, find.caseSensitive);

	// Sits below the panel toolbar rather than over it.
	return <WorkspaceFindBar className="top-12" engine={engine} find={find} label="Find in chat" />;
}
