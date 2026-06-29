import { Link } from "@tanstack/react-router";
import { MessageSquare, Share2 } from "lucide-react";
import { type ReactNode, useState } from "react";

import ThinkExLogo from "#/components/ThinkExLogo";
import UserProfileDropdown from "#/components/UserProfileDropdown";
import { Kbd } from "#/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import { WorkspacePresence } from "#/features/workspaces/components/WorkspacePresence";
import { WorkspaceShareDialog } from "#/features/workspaces/components/WorkspaceShareDialog";
import WorkspaceTabBar from "#/features/workspaces/components/WorkspaceTabBar";
import {
	WorkspaceToolbarIconButton,
	WorkspaceToolbarTextButton,
} from "#/features/workspaces/components/WorkspaceToolbar";
import type { WorkspaceSummary } from "#/features/workspaces/contracts";
import type { WorkspaceItem } from "#/features/workspaces/model/types";
import type { WorkspacePresenceUser } from "#/features/workspaces/realtime/messages";
import type { WorkspaceTab } from "#/features/workspaces/state/workspace-tabs-store";
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
	const [shareOpen, setShareOpen] = useState(false);
	const aiChatHotkey = formatAppHotkey(getAppHotkey("workspace.aiChat.toggle").hotkey);

	return (
		<header className="sticky top-0 z-40 bg-muted">
			<div className="flex h-12 w-full items-stretch justify-between gap-3 px-4">
				<div className="flex min-w-0 flex-1 items-stretch gap-4">
					<Link
						to="/home"
						className="flex shrink-0 items-center gap-3 rounded-md text-foreground no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<ThinkExLogo size={28} />
						<span className="text-xl font-semibold tracking-tight sm:text-2xl">ThinkEx</span>
					</Link>
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
				</div>

				<nav className="flex shrink-0 items-center gap-2" aria-label="Workspace global actions">
					<WorkspacePresence status={presence.status} users={presence.users} />
					<WorkspaceToolbarIconButton
						aria-label="Share workspace"
						onClick={() => setShareOpen(true)}
					>
						<Share2 />
					</WorkspaceToolbarIconButton>
					<UserProfileDropdown />
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
				</nav>
			</div>
			{contextBar}
			<WorkspaceShareDialog
				membershipRole={workspace.membershipRole}
				onOpenChange={setShareOpen}
				open={shareOpen}
				workspaceId={workspace.id}
				workspaceName={workspace.name}
			/>
		</header>
	);
}
