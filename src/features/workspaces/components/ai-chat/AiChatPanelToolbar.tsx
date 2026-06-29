import {
	AlertCircle,
	Check,
	History,
	LoaderCircle,
	Maximize2,
	Minimize2,
	Plus,
	RefreshCw,
	Trash2,
	X,
} from "lucide-react";
import { useState } from "react";

import { Badge } from "#/components/ui/badge";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import type { AIThreadSummary } from "#/features/workspaces/ai/user-ai-agents";
import {
	WorkspaceToolbarGroup,
	WorkspaceToolbarIconButton,
} from "#/features/workspaces/components/WorkspaceToolbar";
import { formatWorkspaceRecency } from "#/features/workspaces/model/display";
import { statusBadgeClassName } from "#/lib/design-system-colors";
import { cn } from "#/lib/utils";

interface AiChatPanelToolbarProps {
	activeThreadId?: string;
	activeThreadIsRecovering?: boolean;
	isMaximized: boolean;
	isNewChatDisabled?: boolean;
	onClose: () => void;
	onDeleteThread: (thread: AIThreadSummary) => void;
	onMaximize: () => void;
	onNewChat: () => void;
	onRestore: () => void;
	onSelectThread: (threadId: string) => void;
	threads: AIThreadSummary[];
}

export default function AiChatPanelToolbar({
	activeThreadId,
	activeThreadIsRecovering = false,
	isMaximized,
	isNewChatDisabled = false,
	onClose,
	onDeleteThread,
	onMaximize,
	onNewChat,
	onRestore,
	onSelectThread,
	threads,
}: AiChatPanelToolbarProps) {
	const [isHistoryOpen, setIsHistoryOpen] = useState(false);

	const handleNewChat = () => {
		onNewChat();
		setIsHistoryOpen(false);
	};

	const handleSelectThread = (threadId: string) => {
		onSelectThread(threadId);
		setIsHistoryOpen(false);
	};

	const handleDeleteThread = (thread: AIThreadSummary) => {
		onDeleteThread(thread);
		setIsHistoryOpen(false);
	};

	return (
		<header className="pointer-events-none absolute top-0 right-0 z-20 inline-flex">
			<nav
				aria-label="AI chat actions"
				className="pointer-events-auto inline-flex rounded-bl-md bg-background p-1 shadow-[0_18px_40px_-28px_rgba(0,0,0,0.35)]"
			>
				<WorkspaceToolbarGroup className="gap-1">
					<DropdownMenu open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
						<DropdownMenuTrigger
							render={<WorkspaceToolbarIconButton aria-label="Open chat history" />}
						>
							<History aria-hidden="true" />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-72">
							<DropdownMenuGroup>
								<DropdownMenuItem disabled={isNewChatDisabled} onClick={handleNewChat}>
									<Plus className="size-4" aria-hidden="true" />
									New chat
								</DropdownMenuItem>
							</DropdownMenuGroup>
							{threads.length > 0 ? (
								<>
									<DropdownMenuSeparator />
									<DropdownMenuGroup>
										{threads.map((thread) => (
											<div key={thread.id} className="group/thread-row relative">
												<DropdownMenuItem
													className={cn(
														"min-w-0 items-start py-2 pr-9",
														thread.id === activeThreadId && "bg-accent",
													)}
													onClick={() => handleSelectThread(thread.id)}
												>
													<span className="grid min-w-0 flex-1 gap-1">
														<span className="truncate font-medium text-sm leading-none">
															{thread.title}
														</span>
														<span className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs leading-none">
															<span className="truncate">
																{formatWorkspaceRecency(thread.lastActivityAt)}
															</span>
															<ThreadStatusBadge
																thread={thread}
																isActive={thread.id === activeThreadId}
																isRecovering={
																	thread.id === activeThreadId && activeThreadIsRecovering
																}
															/>
														</span>
													</span>
												</DropdownMenuItem>
												<DropdownMenuItem
													className="-translate-y-1/2 absolute top-1/2 right-1 size-7 justify-center p-0 text-muted-foreground opacity-0 hover:text-destructive hover:*:[svg]:text-destructive focus-visible:opacity-100 group-hover/thread-row:opacity-100"
													onClick={() => handleDeleteThread(thread)}
												>
													<Trash2 className="size-3.5" aria-hidden="true" />
													<span className="sr-only">Delete {thread.title}</span>
												</DropdownMenuItem>
											</div>
										))}
									</DropdownMenuGroup>
								</>
							) : null}
						</DropdownMenuContent>
					</DropdownMenu>

					<WorkspaceToolbarIconButton
						aria-label={isMaximized ? "Restore AI chat" : "Maximize AI chat"}
						onClick={isMaximized ? onRestore : onMaximize}
					>
						{isMaximized ? <Minimize2 /> : <Maximize2 />}
					</WorkspaceToolbarIconButton>

					<WorkspaceToolbarIconButton aria-label="Close AI chat" onClick={onClose}>
						<X />
					</WorkspaceToolbarIconButton>
				</WorkspaceToolbarGroup>
			</nav>
		</header>
	);
}

function ThreadStatusBadge({
	isActive,
	isRecovering,
	thread,
}: {
	isActive: boolean;
	isRecovering: boolean;
	thread: AIThreadSummary;
}) {
	if (isActive && isRecovering) {
		return (
			<Badge
				variant="secondary"
				className="h-4 shrink-0 gap-1 rounded-full px-1.5 font-normal text-[10px] leading-none"
			>
				<RefreshCw className="size-2.5 animate-spin" aria-hidden="true" />
				Recovering
			</Badge>
		);
	}

	if (thread.isRunning) {
		return (
			<Badge
				variant="secondary"
				className="h-4 shrink-0 gap-1 rounded-full px-1.5 font-normal text-[10px] leading-none"
			>
				<LoaderCircle className="size-2.5 animate-spin" aria-hidden="true" />
				Running
			</Badge>
		);
	}

	if (thread.lastRunResult === "error") {
		return (
			<Badge
				variant="outline"
				className={cn(
					"h-4 shrink-0 gap-1 rounded-full px-1.5 font-normal text-[10px] leading-none",
					statusBadgeClassName.destructive,
				)}
				title={thread.lastErrorMessage ?? undefined}
			>
				<AlertCircle className="size-2.5" aria-hidden="true" />
				{thread.hasUnreadUpdate ? "Needs attention" : "Error"}
			</Badge>
		);
	}

	if (thread.hasUnreadUpdate) {
		return (
			<Badge
				variant="outline"
				className={cn(
					"h-4 shrink-0 gap-1 rounded-full px-1.5 font-normal text-[10px] leading-none",
					statusBadgeClassName.success,
				)}
			>
				<Check className="size-2.5" aria-hidden="true" />
				Unread
			</Badge>
		);
	}

	return null;
}
