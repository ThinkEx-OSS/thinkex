import { LazyMotion, domAnimation, m } from "motion/react";
import { useCallback, useEffect, useState } from "react";

import { usePromptInputAttachments } from "#/features/workspaces/components/ai-chat/ai-chat-prompt-input";
import AiChatPromptAttachments from "#/features/workspaces/components/ai-chat/AiChatPromptAttachments";
import WorkspaceAiChatContextChips from "#/features/workspaces/components/ai-chat/WorkspaceAiChatContextChips";
import { getWorkspaceAiContextChips } from "#/features/workspaces/model/workspace-ai-context-chips";
import type { WorkspaceAiContextScope } from "#/features/workspaces/model/workspace-ai-context-types";

const contextBarTransition = { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };

export default function AiChatPromptContextBar({ context }: { context: WorkspaceAiContextScope }) {
	const attachments = usePromptInputAttachments();
	const hasAttachments = attachments.files.length > 0;
	const hasWorkspaceContext =
		getWorkspaceAiContextChips(context).length > 0 || context.selectedQuotes.length > 0;
	const visible = hasAttachments || hasWorkspaceContext;

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
				transition={contextBarTransition}
			>
				<div ref={contentRef} className="w-full min-w-0">
					{visible ? (
						<div className="flex w-full min-w-0 flex-col gap-3 pt-3">
							<AiChatPromptAttachments />
							<WorkspaceAiChatContextChips context={context} />
						</div>
					) : null}
				</div>
			</m.div>
		</LazyMotion>
	);
}
