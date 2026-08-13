import { type ReactElement, type ReactNode, useLayoutEffect, useRef } from "react";
import type { GroupProps, PanelImperativeHandle } from "react-resizable-panels";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "#/components/ui/resizable";
import WorkspaceFrame from "#/features/workspaces/components/WorkspaceFrame";
import { defaultWorkspaceUiSession } from "#/features/workspaces/model/workspace-ui";
import type { WorkspaceAiChatSurfaceMode } from "#/features/workspaces/state/workspace-ui-store";
import { cn } from "#/lib/utils";

const CHAT_PANEL_ID = "ai-chat";

interface WorkspaceChatLayoutProps {
	chrome: ReactNode;
	content: ReactNode;
	chatPanel?: ReactElement;
	chatSurfaceMode?: WorkspaceAiChatSurfaceMode;
	onDockedChatCollapse?: () => void;
}

export default function WorkspaceChatLayout({
	chrome,
	content,
	chatPanel,
	chatSurfaceMode = defaultWorkspaceUiSession.chatSurfaceMode,
	onDockedChatCollapse,
}: WorkspaceChatLayoutProps) {
	const chatPanelRef = useRef<PanelImperativeHandle | null>(null);
	const lastDockedChatSizeRef = useRef<number | null>(null);
	const hasChatPanel = Boolean(chatPanel);
	const isChatHidden = chatSurfaceMode === "hidden";
	const isChatFullscreen = chatSurfaceMode === "fullscreen";
	const isDockedChat = chatSurfaceMode === "docked";

	useLayoutEffect(() => {
		if (!hasChatPanel || !chatPanelRef.current) {
			return;
		}

		if (!isDockedChat) {
			chatPanelRef.current.collapse();
			return;
		}

		// `expand()` only restores the width remembered by a preceding imperative
		// `collapse()`, so reopening after a drag-to-close would fall back to minSize.
		if (lastDockedChatSizeRef.current) {
			chatPanelRef.current.resize(`${lastDockedChatSizeRef.current}%`);
			return;
		}

		chatPanelRef.current.expand();
	}, [hasChatPanel, isDockedChat]);

	// Fires only once the pointer is released, so dragging past the collapse
	// threshold and back never flips chat surface mode mid-drag.
	const handleLayoutChanged: GroupProps["onLayoutChanged"] = (layout, { isUserInteraction }) => {
		const chatSize = layout[CHAT_PANEL_ID];

		if (chatSize) {
			lastDockedChatSizeRef.current = chatSize;
		}

		if (!isUserInteraction || !isDockedChat || !chatPanelRef.current?.isCollapsed()) {
			return;
		}

		onDockedChatCollapse?.();
	};

	return (
		<div data-app-shell className="h-screen overflow-hidden bg-background text-foreground">
			<ResizablePanelGroup
				id="workspace-layout"
				orientation="horizontal"
				className="h-full min-h-0"
				resizeTargetMinimumSize={{ coarse: 24, fine: 15 }}
				onLayoutChanged={handleLayoutChanged}
			>
				<ResizablePanel id="workspace" minSize="45%" className="min-h-0 overflow-hidden">
					<WorkspaceFrame chrome={chrome} content={content} />
				</ResizablePanel>

				{chatPanel ? (
					<>
						<ResizableHandle
							id="workspace-ai-chat-separator"
							disabled={!isDockedChat}
							className={cn(
								"relative z-[45] -mx-[7px] flex w-[15px] items-stretch justify-center bg-transparent outline-none after:hidden [&[data-separator=active]>div]:w-[3px] [&[data-separator=active]>div]:bg-ring [&[data-separator=hover]>div]:w-[3px] [&[data-separator=hover]>div]:bg-ring/70",
								!isDockedChat && "-mx-0 w-0 pointer-events-none opacity-0",
							)}
							onPointerUp={(event) => event.currentTarget.blur()}
						>
							<div className="my-0 w-px bg-border transition-[background-color,width] duration-150" />
						</ResizableHandle>
						<ResizablePanel
							id={CHAT_PANEL_ID}
							defaultSize="34rem"
							minSize="26rem"
							maxSize="60%"
							collapsible={true}
							collapsedSize={0}
							panelRef={chatPanelRef}
							className="min-h-0 overflow-hidden"
						>
							<div
								className={cn(
									"h-full min-h-0",
									isChatHidden && "pointer-events-none invisible",
									isChatFullscreen && "fixed inset-0 z-50 h-screen w-screen bg-background",
								)}
							>
								{chatPanel}
							</div>
						</ResizablePanel>
					</>
				) : null}
			</ResizablePanelGroup>
		</div>
	);
}
