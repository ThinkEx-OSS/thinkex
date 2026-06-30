import { Link } from "@tanstack/react-router";
import { MessageSquare, Share2 } from "lucide-react";
import { type ReactElement, type ReactNode, useState } from "react";

import ThinkExLogo from "#/components/ThinkExLogo";
import UserProfileDropdown from "#/components/UserProfileDropdown";
import WorkspaceFrame from "#/features/workspaces/components/WorkspaceFrame";
import { WorkspaceShareDialog } from "#/features/workspaces/components/WorkspaceShareDialog";
import {
	WorkspaceToolbarIconButton,
	WorkspaceToolbarTextButton,
} from "#/features/workspaces/components/WorkspaceToolbar";
import type { WorkspaceSummary } from "#/features/workspaces/contracts";
import type { WorkspaceAiChatSurfaceMode } from "#/features/workspaces/state/workspace-ui-store";

interface WorkspaceMobileLayoutProps {
	workspace: WorkspaceSummary;
	contextBar: ReactNode;
	content: ReactNode;
	chatPanel?: ReactElement;
	chatSurfaceMode: WorkspaceAiChatSurfaceMode;
	onOpenChat: () => void;
}

export default function WorkspaceMobileLayout({
	workspace,
	contextBar,
	content,
	chatPanel,
	chatSurfaceMode,
	onOpenChat,
}: WorkspaceMobileLayoutProps) {
	const [shareOpen, setShareOpen] = useState(false);
	const isChatOpen = chatSurfaceMode !== "hidden";

	return (
		<div data-app-shell className="h-dvh overflow-hidden bg-background text-foreground">
			<WorkspaceFrame
				chrome={
					<header className="sticky top-0 z-40 bg-muted">
						<div className="flex h-12 w-full items-stretch justify-between gap-3 px-4">
							<Link
								to="/home"
								className="flex shrink-0 items-center rounded-md text-foreground no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring"
								aria-label="Back to workspaces"
							>
								<ThinkExLogo size={28} />
							</Link>

							<nav
								className="flex shrink-0 items-center gap-2"
								aria-label="Workspace mobile actions"
							>
								<WorkspaceToolbarIconButton
									aria-label="Share workspace"
									onClick={() => setShareOpen(true)}
								>
									<Share2 />
								</WorkspaceToolbarIconButton>
								<UserProfileDropdown />
								{!isChatOpen ? (
									<WorkspaceToolbarTextButton
										variant="outline"
										className="border-border bg-background shadow-xs hover:bg-muted"
										onClick={onOpenChat}
									>
										<MessageSquare />
										<span>Chat</span>
									</WorkspaceToolbarTextButton>
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
				}
				content={content}
			/>

			{chatPanel && isChatOpen ? (
				<div className="fixed inset-0 z-50 h-dvh w-dvw bg-background">{chatPanel}</div>
			) : null}
		</div>
	);
}
