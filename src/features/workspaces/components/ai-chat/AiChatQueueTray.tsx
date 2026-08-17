import { useDragDropMonitor } from "@dnd-kit/react";
import { isSortableOperation, useSortable } from "@dnd-kit/react/sortable";
import { ArrowUp, Pencil, X } from "lucide-react";
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m } from "motion/react";
import { useState } from "react";

import { Button } from "#/components/ui/button";
import { WORKSPACE_SORTABLE_TAB_TRANSITION } from "#/features/workspaces/components/workspace-tab-motion";
import { AI_CHAT_QUEUE_DRAG_TYPE } from "#/features/workspaces/model/drag-types";
import {
	useWorkspaceAiQueue,
	useWorkspaceAiQueuePaused,
	useWorkspaceAiQueueStore,
	type WorkspaceAiQueuedMessage,
} from "#/features/workspaces/state/workspace-ai-queue-store";
import { cn } from "#/lib/utils";

const trayTransition = { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };

/**
 * Messages written while the AI was still answering, shown above the composer.
 * They send themselves one at a time once the AI is free; each row can be sent
 * immediately, edited back into the composer, removed, or dragged into a
 * different order.
 */
export default function AiChatQueueTray({
	threadId,
	onEdit,
	onSendNow,
}: {
	threadId: string;
	onEdit: (entryId: string) => void;
	onSendNow?: (entryId: string) => void;
}) {
	const entries = useWorkspaceAiQueue(threadId);
	const paused = useWorkspaceAiQueuePaused(threadId);
	const discard = useWorkspaceAiQueueStore((state) => state.discard);
	const moveByIndex = useWorkspaceAiQueueStore((state) => state.moveByIndex);
	const resume = useWorkspaceAiQueueStore((state) => state.resume);

	useDragDropMonitor({
		onDragEnd(event) {
			const { operation } = event;
			if (
				event.canceled ||
				!isSortableOperation(operation) ||
				!operation.source ||
				operation.source.type !== AI_CHAT_QUEUE_DRAG_TYPE ||
				operation.source.initialGroup !== threadId
			) {
				return;
			}

			const { index, initialIndex } = operation.source;
			if (index === initialIndex) {
				return;
			}

			moveByIndex(threadId, initialIndex, index);
		},
	});

	return (
		<LazyMotion features={domAnimation}>
			<MotionConfig reducedMotion="user">
				<AnimatePresence initial={false} mode="popLayout">
					{entries.length > 0 ? (
						<m.div
							key="queue-tray"
							animate={{ opacity: 1, scale: 1, y: 0 }}
							className="flex w-full min-w-0 origin-bottom flex-col gap-1.5 pt-3"
							exit={{ opacity: 0, scale: 0.985, y: 4 }}
							initial={{ opacity: 0, scale: 0.985, y: 4 }}
							transition={trayTransition}
						>
							{paused ? (
								<div className="flex items-center justify-between gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-950 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100">
									<span className="min-w-0">Won&apos;t send until you resume.</span>
									<Button
										className="shrink-0"
										size="xs"
										type="button"
										variant="outline"
										onClick={() => resume(threadId)}
									>
										Resume
									</Button>
								</div>
							) : (
								<p className="px-0.5 text-xs text-muted-foreground">Waiting to send</p>
							)}
							<ul
								aria-label="Queued messages"
								className="flex max-h-40 min-w-0 flex-col gap-1.5 overflow-y-auto overscroll-contain pr-1"
							>
								{entries.map((entry, index) => (
									<AiChatQueueTrayItem
										key={entry.id}
										canReorder={entries.length > 1}
										entry={entry}
										group={threadId}
										index={index}
										onEdit={() => onEdit(entry.id)}
										onRemove={() => discard(threadId, entry.id)}
										onSendNow={onSendNow ? () => onSendNow(entry.id) : undefined}
									/>
								))}
							</ul>
						</m.div>
					) : null}
				</AnimatePresence>
			</MotionConfig>
		</LazyMotion>
	);
}

function AiChatQueueTrayItem({
	canReorder,
	entry,
	group,
	index,
	onEdit,
	onRemove,
	onSendNow,
}: {
	canReorder: boolean;
	entry: WorkspaceAiQueuedMessage;
	group: string;
	index: number;
	onEdit: () => void;
	onRemove: () => void;
	onSendNow?: () => void;
}) {
	const [element, setElement] = useState<Element | null>(null);
	const { isDragSource, isDropTarget } = useSortable({
		id: entry.id,
		group,
		index,
		element,
		disabled: !canReorder,
		type: AI_CHAT_QUEUE_DRAG_TYPE,
		accept: AI_CHAT_QUEUE_DRAG_TYPE,
		transition: {
			...WORKSPACE_SORTABLE_TAB_TRANSITION,
			idle: false,
		},
	});
	const attachmentSummary =
		entry.files.length === 0
			? null
			: entry.files.length === 1
				? "1 attachment"
				: `${entry.files.length} attachments`;

	return (
		<li
			ref={setElement}
			className={cn(
				"flex w-full min-w-0 items-center gap-1.5 rounded-lg bg-muted/60 py-1 pr-1 pl-2 text-xs motion-safe:will-change-transform dark:bg-input/30",
				canReorder && "cursor-grab",
				isDragSource && "cursor-grabbing opacity-70",
				isDropTarget && !isDragSource && "bg-muted",
			)}
		>
			<div className="min-w-0 flex-1" title={entry.text || undefined}>
				<p className="truncate">{entry.text || attachmentSummary}</p>
				{entry.text && attachmentSummary ? (
					<p className="text-[11px] text-muted-foreground">{attachmentSummary}</p>
				) : null}
			</div>
			{onSendNow ? (
				<Button
					aria-label="Send now"
					className="shrink-0 text-muted-foreground hover:text-foreground"
					size="icon-xs"
					type="button"
					variant="ghost"
					onClick={onSendNow}
				>
					<ArrowUp />
				</Button>
			) : null}
			<Button
				aria-label="Edit message"
				className="shrink-0 text-muted-foreground hover:text-foreground"
				size="icon-xs"
				type="button"
				variant="ghost"
				onClick={onEdit}
			>
				<Pencil />
			</Button>
			<Button
				aria-label="Remove message"
				className="shrink-0 text-muted-foreground hover:text-destructive"
				size="icon-xs"
				type="button"
				variant="ghost"
				onClick={onRemove}
			>
				<X />
			</Button>
		</li>
	);
}
