import { MessageSquare } from "lucide-react";

import { Skeleton } from "#/components/ui/skeleton";
import AiChatThreadSkeleton from "#/features/workspaces/components/ai-chat/AiChatThreadSkeleton";
import WorkspaceChatLayout from "#/features/workspaces/components/WorkspaceChatLayout";
import WorkspaceHeaderChrome from "#/features/workspaces/components/WorkspaceHeaderChrome";
import { workspaceItemGridClass } from "#/features/workspaces/components/workspace-item-card-chrome";
import WorkspaceItemCardSkeleton from "#/features/workspaces/components/WorkspaceItemCardSkeleton";
import WorkspaceMobileFrame from "#/features/workspaces/components/WorkspaceMobileFrame";
import {
	defaultWorkspaceUiSession,
	getWorkspaceMobileChatSurfaceMode,
	type WorkspaceMobileChatSurfaceMode,
} from "#/features/workspaces/model/workspace-ui";
import {
	workspaceToolbarButtonSizeClass,
	workspaceToolbarTextButtonClass,
} from "#/features/workspaces/components/workspace-toolbar-styles";
import type { WorkspaceAiChatSurfaceMode } from "#/features/workspaces/state/workspace-ui-store";
import { cn } from "#/lib/utils";

const workspaceSkeletonCardKeys = [0, 1, 2, 3, 4, 5, 6];

interface WorkspaceShellSkeletonProps {
	chatSurfaceMode?: WorkspaceAiChatSurfaceMode;
}

export default function WorkspaceShellSkeleton({
	chatSurfaceMode = defaultWorkspaceUiSession.chatSurfaceMode,
}: WorkspaceShellSkeletonProps) {
	const mobileChatSurfaceMode = getWorkspaceMobileChatSurfaceMode(chatSurfaceMode);

	return (
		<>
			<div className="h-dvh sm:hidden">
				<WorkspaceMobileShellSkeleton chatSurfaceMode={mobileChatSurfaceMode} />
			</div>
			<div className="hidden sm:block">
				<WorkspaceChatLayout
					chatSurfaceMode={chatSurfaceMode}
					chrome={<WorkspaceSkeletonChrome />}
					content={<WorkspaceSkeletonContent />}
					chatPanel={chatSurfaceMode === "hidden" ? undefined : <WorkspaceSkeletonAiChatPanel />}
				/>
			</div>
		</>
	);
}

function WorkspaceSkeletonChrome() {
	return (
		<WorkspaceHeaderChrome
			actions={
				<>
					<Skeleton className={cn(workspaceToolbarButtonSizeClass, "rounded-md")} />
					<Skeleton className={cn(workspaceToolbarButtonSizeClass, "rounded-full")} />
				</>
			}
			actionsLabel="Workspace loading actions"
			center={
				<div className="flex min-w-0 flex-1 items-center gap-1 px-1">
					<Skeleton className="h-8 w-32 rounded-md" />
					<Skeleton className="h-4 w-px shrink-0 rounded-none" />
					<Skeleton className="h-8 w-28 rounded-md" />
				</div>
			}
			contextBar={<WorkspaceContextBarSkeleton />}
		/>
	);
}

function WorkspaceMobileShellSkeleton({
	chatSurfaceMode,
}: {
	chatSurfaceMode: WorkspaceMobileChatSurfaceMode;
}) {
	return (
		<WorkspaceMobileFrame
			actions={
				<>
					<Skeleton className={cn(workspaceToolbarButtonSizeClass, "rounded-md")} />
					<Skeleton className={cn(workspaceToolbarButtonSizeClass, "rounded-full")} />
					<div
						className={cn(
							"inline-flex items-center justify-center rounded-md border border-border bg-background shadow-xs",
							workspaceToolbarTextButtonClass,
						)}
					>
						<MessageSquare className="size-4" aria-hidden="true" />
						<Skeleton className="h-4 w-8 rounded-sm" />
					</div>
				</>
			}
			chatPanel={<WorkspaceSkeletonAiChatPanel />}
			chatSurfaceMode={chatSurfaceMode}
			contextBar={<WorkspaceMobileContextBarSkeleton />}
			content={<WorkspaceMobileSkeletonContent />}
		/>
	);
}

function WorkspaceContextBarSkeleton() {
	return (
		<div className="flex h-12 items-center justify-between gap-3 bg-background px-4 text-sm sm:h-11">
			<div className="flex min-w-0 items-center gap-1.5">
				<Skeleton className="size-3.5 rounded-sm" />
				<Skeleton className="h-4 w-36 rounded-sm" />
			</div>
			<div className="flex shrink-0 items-center gap-1">
				<Skeleton className="h-8.5 w-20 rounded-md" />
				<Skeleton className={cn(workspaceToolbarButtonSizeClass, "rounded-md")} />
			</div>
		</div>
	);
}

function WorkspaceMobileContextBarSkeleton() {
	return (
		<div className="flex h-12 items-center justify-between gap-3 bg-background px-4 text-sm sm:h-11">
			<div className="flex min-w-0 items-center gap-1.5">
				<Skeleton className="size-3.5 rounded-sm" />
				<Skeleton className="h-4 w-28 rounded-sm" />
			</div>
			<div className="flex shrink-0 items-center gap-1">
				<Skeleton className={cn(workspaceToolbarButtonSizeClass, "rounded-md")} />
				<Skeleton className={cn(workspaceToolbarButtonSizeClass, "rounded-md")} />
			</div>
		</div>
	);
}

function WorkspaceSkeletonContent() {
	return (
		<div className="h-full min-h-0 overflow-hidden">
			<div className="space-y-5 px-4 py-3">
				<section className={workspaceItemGridClass}>
					{workspaceSkeletonCardKeys.map((key) => (
						<WorkspaceItemCardSkeleton key={key} />
					))}
				</section>
			</div>
		</div>
	);
}

function WorkspaceMobileSkeletonContent() {
	return (
		<div className="h-full min-h-0 overflow-hidden">
			<div className={cn(workspaceItemGridClass, "px-4 py-3")}>
				{workspaceSkeletonCardKeys.slice(0, 5).map((key) => (
					<WorkspaceItemCardSkeleton key={key} />
				))}
			</div>
		</div>
	);
}

function WorkspaceSkeletonAiChatPanel() {
	return (
		<aside className="relative flex h-full min-h-0 flex-col overflow-hidden bg-background">
			<div className="absolute top-0 right-0 z-10 flex items-center gap-1 rounded-bl-md border border-border/70 bg-background/95 p-1 shadow-sm backdrop-blur">
				<Skeleton className={cn(workspaceToolbarButtonSizeClass, "rounded-md")} />
				<Skeleton className={cn(workspaceToolbarButtonSizeClass, "rounded-md")} />
				<Skeleton className={cn(workspaceToolbarButtonSizeClass, "rounded-md")} />
			</div>
			<div className="px-4 pt-14">
				<AiChatThreadSkeleton />
			</div>
		</aside>
	);
}
