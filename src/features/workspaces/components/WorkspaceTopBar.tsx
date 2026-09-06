import { Ellipsis, MessageSquare, Square } from "lucide-react";
import type { ReactNode } from "react";

import UserProfileDropdown from "#/components/UserProfileDropdown";
import { Kbd } from "#/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import WorkspaceHeaderChrome from "#/features/workspaces/components/WorkspaceHeaderChrome";
import { WorkspacePresence } from "#/features/workspaces/components/WorkspacePresence";
import { useWorkspaceRecording } from "#/features/workspaces/components/WorkspaceRecordingProvider";
import WorkspaceRootActionsMenu from "#/features/workspaces/components/WorkspaceRootActionsMenu";
import WorkspaceTabBar from "#/features/workspaces/components/WorkspaceTabBar";
import {
	WorkspaceToolbarGroup,
	WorkspaceToolbarIconButton,
	WorkspaceToolbarTextButton,
} from "#/features/workspaces/components/WorkspaceToolbar";
import type { WorkspaceItem, WorkspaceSummary } from "#/features/workspaces/contracts";
import type { WorkspacePresenceUser } from "#/features/workspaces/realtime/messages";
import type { WorkspaceTab } from "#/features/workspaces/state/workspace-tabs-store";
import { formatRecordingTimestamp } from "#/features/workspaces/recordings/workspace-recording-transcript";
import {
	useWorkspaceAiChatSurfaceMode,
	useWorkspaceUiStore,
} from "#/features/workspaces/state/workspace-ui-store";
import { formatAppHotkey, getAppHotkey } from "#/lib/hotkeys-core";

type PresenceStatus = "connecting" | "connected" | "disconnected";

interface WorkspaceTopBarProps {
	workspace: WorkspaceSummary;
	itemsById: Map<string, WorkspaceItem>;
	tabs: WorkspaceTab[];
	activeTab: WorkspaceTab;
	contextBar: ReactNode;
	presence: {
		status: PresenceStatus;
		users: WorkspacePresenceUser[];
	};
	onActivateTab: (tab: WorkspaceTab) => void;
	onCloseTab: (tab: WorkspaceTab) => void;
	onCloseOtherTabs: (tab: WorkspaceTab) => void;
	onCloseTabsToRight: (tab: WorkspaceTab) => void;
	onCreateRootTab: () => void;
	onCreateRootTabAfter: (tab: WorkspaceTab) => void;
	onDuplicateTab: (tab: WorkspaceTab) => void;
}

export default function WorkspaceTopBar({
	workspace,
	itemsById,
	tabs,
	activeTab,
	contextBar,
	presence,
	onActivateTab,
	onCloseTab,
	onCloseOtherTabs,
	onCloseTabsToRight,
	onCreateRootTab,
	onCreateRootTabAfter,
	onDuplicateTab,
}: WorkspaceTopBarProps) {
	const chatSurfaceMode = useWorkspaceAiChatSurfaceMode(workspace.id);
	const setChatSurfaceMode = useWorkspaceUiStore((state) => state.setChatSurfaceMode);
	const aiChatHotkey = formatAppHotkey(getAppHotkey("workspace.aiChat.toggle").hotkey);
	const recording = useWorkspaceRecording();
	const recordingItem = recording.captureItemId
		? itemsById.get(recording.captureItemId)
		: undefined;
	const showRecording =
		recording.captureItemId &&
		recording.phase !== "setup" &&
		activeTab.viewItemId !== recording.captureItemId;

	return (
		<WorkspaceHeaderChrome
			actions={
				<>
					{showRecording ? (
						<div className="flex items-center gap-0.5">
							<button
								type="button"
								className="flex h-7 min-w-0 items-center gap-1.5 rounded-md px-1.5 text-muted-foreground text-xs hover:bg-muted hover:text-foreground"
								aria-label={`Open ${recordingItem?.name ?? "recording"}`}
								onClick={recording.openCaptureItem}
							>
								<span className="size-1.5 rounded-full bg-rose-500" />
								<span className="font-medium tabular-nums">
									{recording.phase === "recording"
										? formatRecordingTimestamp(recording.elapsedMs)
										: recording.phase === "paused"
											? "Paused"
											: "Finishing…"}
								</span>
							</button>
							<WorkspaceToolbarIconButton
								className="size-7 text-muted-foreground hover:text-rose-600"
								disabled={recording.phase === "finishing"}
								aria-label="Finish recording"
								onClick={recording.stopRecording}
							>
								<Square className="size-2.5 fill-current" />
							</WorkspaceToolbarIconButton>
						</div>
					) : null}
					<WorkspacePresence status={presence.status} users={presence.users} />
					{/* ponytail: Share/more keep the Search/New token; a little more space before the avatar so it reads as account, not a third toolbar icon. */}
					<div className="flex items-center gap-1.5">
						<WorkspaceToolbarGroup>
							<WorkspaceRootActionsMenu
								workspace={workspace}
								align="end"
								showShareButton
								trigger={
									<WorkspaceToolbarIconButton aria-label="Open workspace actions">
										<Ellipsis />
									</WorkspaceToolbarIconButton>
								}
							/>
						</WorkspaceToolbarGroup>
						<UserProfileDropdown />
					</div>
					{chatSurfaceMode === "hidden" ? (
						<Tooltip>
							<TooltipTrigger
								render={
									<WorkspaceToolbarTextButton
										variant="outline"
										className="border-border bg-background shadow-xs hover:bg-muted"
										onClick={() => setChatSurfaceMode(workspace.id, "docked")}
									>
										<MessageSquare />
										<span>Chat</span>
									</WorkspaceToolbarTextButton>
								}
							/>
							<TooltipContent>
								<span>AI Chat</span>
								<Kbd>{aiChatHotkey}</Kbd>
							</TooltipContent>
						</Tooltip>
					) : null}
				</>
			}
			actionsLabel="Workspace global actions"
			center={
				<WorkspaceTabBar
					workspace={workspace}
					itemsById={itemsById}
					tabs={tabs}
					activeTab={activeTab}
					onActivateTab={onActivateTab}
					onCloseTab={onCloseTab}
					onCloseOtherTabs={onCloseOtherTabs}
					onCloseTabsToRight={onCloseTabsToRight}
					onCreateRootTab={onCreateRootTab}
					onCreateRootTabAfter={onCreateRootTabAfter}
					onDuplicateTab={onDuplicateTab}
				/>
			}
			contextBar={contextBar}
		/>
	);
}
