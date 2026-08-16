import { Check, History, Maximize2, Minimize2, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import type { AiChatThreadSummary } from "#/features/workspaces/ai/chat/chat-model";
import {
	WorkspaceToolbarGroup,
	WorkspaceToolbarIconButton,
} from "#/features/workspaces/components/WorkspaceToolbar";
import { formatWorkspaceRecency } from "#/features/workspaces/model/display";
import { cn } from "#/lib/utils";

const PENDING_DELETE_TIMEOUT_MS = 2500;

interface AiChatPanelToolbarProps {
	activeThreadId?: string;
	isLoading?: boolean;
	isMaximized: boolean;
	onClose: () => void;
	onDeleteThread: (thread: AiChatThreadSummary) => void;
	onMaximize: () => void;
	onNewChat: () => void;
	onRestore: () => void;
	onSelectThread: (threadId: string) => void;
	threads: AiChatThreadSummary[];
}

export default function AiChatPanelToolbar({
	activeThreadId,
	isLoading = false,
	isMaximized,
	onClose,
	onDeleteThread,
	onMaximize,
	onNewChat,
	onRestore,
	onSelectThread,
	threads,
}: AiChatPanelToolbarProps) {
	const [isHistoryOpen, setIsHistoryOpen] = useState(false);
	const [pendingDeleteThreadId, setPendingDeleteThreadId] = useState<string>();

	useEffect(() => {
		if (!pendingDeleteThreadId) {
			return;
		}

		const timeoutId = window.setTimeout(() => {
			setPendingDeleteThreadId(undefined);
		}, PENDING_DELETE_TIMEOUT_MS);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [pendingDeleteThreadId]);

	const handleHistoryOpenChange = (open: boolean) => {
		setIsHistoryOpen(open);
		if (!open) {
			setPendingDeleteThreadId(undefined);
		}
	};

	const handleNewChat = () => {
		onNewChat();
		setIsHistoryOpen(false);
	};

	const handleSelectThread = (threadId: string) => {
		onSelectThread(threadId);
		setIsHistoryOpen(false);
	};

	const handleDeleteThread = (thread: AiChatThreadSummary) => {
		if (pendingDeleteThreadId !== thread.id) {
			setPendingDeleteThreadId(thread.id);
			return;
		}

		onDeleteThread(thread);
		setPendingDeleteThreadId(undefined);
	};

	return (
		<header className="pointer-events-none absolute top-0 right-0 z-20 inline-flex">
			<nav
				aria-label="AI chat actions"
				className="pointer-events-auto inline-flex rounded-bl-md bg-background p-1 shadow-[0_18px_40px_-28px_rgba(0,0,0,0.35)]"
			>
				<WorkspaceToolbarGroup className="gap-1">
					<DropdownMenu open={isHistoryOpen && !isLoading} onOpenChange={handleHistoryOpenChange}>
						<DropdownMenuTrigger
							render={
								<WorkspaceToolbarIconButton aria-label="Open chat history" disabled={isLoading} />
							}
						>
							<History aria-hidden="true" />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-72">
							<DropdownMenuGroup>
								<DropdownMenuItem disabled={isLoading} onClick={handleNewChat}>
									<Plus className="size-4" aria-hidden="true" />
									New chat
								</DropdownMenuItem>
							</DropdownMenuGroup>
							{threads.length > 0 ? (
								<>
									<DropdownMenuSeparator />
									<DropdownMenuGroup>
										{threads.map((thread) => {
											const isPendingDelete = pendingDeleteThreadId === thread.id;

											return (
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
															</span>
														</span>
													</DropdownMenuItem>
													<DropdownMenuItem
														closeOnClick={false}
														variant={isPendingDelete ? "destructive" : "default"}
														className={cn(
															"-translate-y-1/2 absolute top-1/2 right-1 size-7 justify-center p-0 opacity-0 focus-visible:opacity-100 group-hover/thread-row:opacity-100",
															isPendingDelete
																? "text-destructive opacity-100 hover:text-destructive"
																: "text-muted-foreground hover:text-destructive hover:*:[svg]:text-destructive",
														)}
														onClick={() => handleDeleteThread(thread)}
													>
														{isPendingDelete ? (
															<Check className="size-3.5" aria-hidden="true" />
														) : (
															<Trash2 className="size-3.5" aria-hidden="true" />
														)}
														<span className="sr-only">
															{isPendingDelete
																? `Confirm delete ${thread.title}`
																: `Delete ${thread.title}`}
														</span>
													</DropdownMenuItem>
												</div>
											);
										})}
									</DropdownMenuGroup>
								</>
							) : null}
						</DropdownMenuContent>
					</DropdownMenu>

					<WorkspaceToolbarIconButton
						aria-label={isMaximized ? "Restore AI chat" : "Maximize AI chat"}
						className="hidden sm:inline-flex"
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

// Run-state/unread badges retired with the DO-era summary fields; a thread row
// is now just title + recency, ChatGPT-style.
