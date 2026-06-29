import type { ComponentProps, ReactNode } from "react";

import { aiChatMessageRailClassName } from "#/features/workspaces/components/ai-chat/ai-chat-layout";
import { cn } from "#/lib/utils";

interface AiChatTranscriptRailProps extends ComponentProps<"div"> {
	children: ReactNode;
}

export default function AiChatTranscriptRail({
	children,
	className,
	...props
}: AiChatTranscriptRailProps) {
	return (
		<div className={cn(aiChatMessageRailClassName, className)} {...props}>
			{children}
		</div>
	);
}
