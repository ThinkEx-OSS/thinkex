import { useDragDropMonitor } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { GripVertical, Pencil, Play, X } from "lucide-react";
import { LazyMotion, domAnimation, m } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

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
			const source = event.operation.source as {
				type?: unknown;
				index?: unknown;
				initialIndex?: unknown;
			} | null;
			if (!source || source.type !== AI_CHAT_QUEUE_DRAG_TYPE || event.canceled) {
				return;
			}
			if (
				typeof source.index !== "number" ||
				typeof source.initialIndex !== "number" ||
				source.index === source.initialIndex
			) {
				return;
			}

			moveByIndex(threadId, source.initialIndex, source.index);
		},
	});

	const [contentNode, setContentNode] = useState<HTMLDivElement | null>(null);
	const [height, setHeight] = useState<number | "auto">("auto");
	const contentRef = useCallback((node: HTMLDivElement | null) => {
		setContentNode(node);
	}, []);

	useEffect(() => {
		if (!contentNode) {
			return;
		}

		const updateHeight = () => {
			setHeight(contentNode.getBoundingClientRect().height);
		};

		updateHeight();
		const observer = new ResizeObserver(updateHeight);
		observer.observe(contentNode);
		return () => observer.disconnect();
	}, [contentNode]);

	return (
		<LazyMotion features={domAnimation}>
			<m.div
				animate={{ height }}
				className="w-full min-w-0 overflow-hidden"
				initial={false}
				transition={trayTransition}
			>
				<div ref={contentRef} className="w-full min-w-0">
					{entries.length > 0 ? (
						<div className="flex w-full min-w-0 flex-col gap-1.5 pt-3">
							{paused ? (
								<div className="flex items-center justify-between gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-950 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100">
									<span className="min-w-0">
										Paused — these won&apos;t send until you press Resume.
									</span>
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
								<p className="px-0.5 text-xs text-muted-foreground">
									Waiting to send — {entries.length === 1 ? "this" : "these"} will go when the AI
									finishes.
								</p>
							)}
							{entries.map((entry, index) => (
								<AiChatQueueTrayItem
									key={entry.id}
									entry={entry}
									index={index}
									showHandle={entries.length > 1}
									onEdit={() => onEdit(entry.id)}
									onRemove={() => discard(threadId, entry.id)}
									onSendNow={onSendNow ? () => onSendNow(entry.id) : undefined}
								/>
							))}
						</div>
					) : null}
				</div>
			</m.div>
		</LazyMotion>
	);
}

function AiChatQueueTrayItem({
	entry,
	index,
	showHandle,
	onEdit,
	onRemove,
	onSendNow,
}: {
	entry: WorkspaceAiQueuedMessage;
	index: number;
	showHandle: boolean;
	onEdit: () => void;
	onRemove: () => void;
	onSendNow?: () => void;
}) {
	const [element, setElement] = useState<Element | null>(null);
	const handleRef = useRef<HTMLButtonElement | null>(null);
	const { isDragSource, isDropTarget } = useSortable({
		id: entry.id,
		index,
		element,
		handle: handleRef,
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
		<div
			ref={setElement}
			className={cn(
				"flex w-full min-w-0 items-center gap-1.5 rounded-lg bg-muted/60 py-1 pr-1 pl-2 text-xs motion-safe:will-change-transform dark:bg-input/30",
				isDragSource && "opacity-70",
				isDropTarget && !isDragSource && "bg-muted",
			)}
		>
			{showHandle ? (
				<button
					ref={handleRef}
					aria-label="Drag to reorder"
					className="-ml-1 flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/70 hover:text-foreground"
					type="button"
				>
					<GripVertical className="size-3.5" />
				</button>
			) : null}
			<div className="min-w-0 flex-1" title={entry.text || undefined}>
				<p className="truncate">{entry.text || attachmentSummary}</p>
				{entry.text && attachmentSummary ? (
					<p className="text-[11px] text-muted-foreground">{attachmentSummary}</p>
				) : null}
			</div>
			{onSendNow ? (
				<Button
					className="shrink-0 text-muted-foreground hover:text-foreground"
					size="xs"
					type="button"
					variant="ghost"
					onClick={onSendNow}
				>
					<Play data-icon="inline-start" />
					Send now
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
		</div>
	);
}
