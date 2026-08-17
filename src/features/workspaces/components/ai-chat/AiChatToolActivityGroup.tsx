import { isToolUIPart } from "ai";
import { ChevronDown } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import {
	getToolActivityForPart,
	isVisibleToolPart,
	getToolPartName,
	type AiChatToolActivity,
} from "#/features/workspaces/components/ai-chat/ai-chat-display-state";
import {
	AiChatToolActivityRow,
	ToolActivityIcon,
} from "#/features/workspaces/components/ai-chat/AiChatToolActivityRow";
import type {
	AiChatMessagePart,
	AiChatToolPart,
} from "#/features/workspaces/components/ai-chat/types";
import { asRecord } from "#/lib/record";
import { cn } from "#/lib/utils";

/**
 * A run of consecutive tool calls rendered as one line. While any member is
 * still running, only the latest action shows — its text swaps in place, so
 * the transcript height stays stable during streaming. Once the run settles it
 * collapses to "latest action · ran N actions", with the full list in a
 * popover (no layout shift on expand).
 */
export function AiChatToolActivityGroup({
	interrupted = false,
	parts,
}: {
	interrupted?: boolean;
	parts: AiChatToolPart[];
}) {
	const visibleParts = parts.filter(isVisibleToolPart);
	const lastVisible = visibleParts.at(-1);

	if (!lastVisible) {
		return null;
	}

	if (visibleParts.length === 1) {
		return <AiChatToolActivityRow interrupted={interrupted} part={lastVisible} />;
	}

	const hasUnfinished = !interrupted && visibleParts.some((part) => !isSettledToolPart(part));
	if (hasUnfinished) {
		return <AiChatToolActivityRow part={lastVisible} />;
	}

	const activities = visibleParts
		.map((part) => getToolActivityForPart(part, { interrupted }))
		.filter((activity): activity is AiChatToolActivity => activity !== null);
	const latest = activities.at(-1);

	if (!latest) {
		return null;
	}

	const failedCount = activities.filter((activity) => activity.status === "failed").length;

	return (
		<Popover>
			<PopoverTrigger className="block min-w-0 max-w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
				<div
					title={latest.summary}
					className="group/tool-row inline-flex min-w-0 max-w-full items-center gap-1.5 py-0.5 text-muted-foreground text-xs"
				>
					<span className="grid size-3.5 shrink-0 place-items-center self-center text-muted-foreground/70">
						<ToolActivityIcon icon={latest.presentation.icon} />
					</span>
					<span className="min-w-0 truncate font-medium">{latest.summary}</span>
					<span className="shrink-0 whitespace-pre text-muted-foreground/70">
						· ran {activities.length} actions
						{failedCount > 0 ? `, ${failedCount} failed` : ""}
					</span>
					<ChevronDown
						className="size-3.5 shrink-0 self-center text-muted-foreground/70"
						aria-hidden="true"
					/>
				</div>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-72 p-1.5">
				<div className="grid gap-0.5" aria-label="Actions in this run">
					{activities.map((activity, index) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: activities mirror settled, ordered parts
							key={index}
							title={activity.summary}
							className="flex items-center gap-1.5 rounded-sm px-1.5 py-1 text-muted-foreground text-xs"
						>
							<span className="grid size-3.5 shrink-0 place-items-center text-muted-foreground/70">
								<ToolActivityIcon icon={activity.presentation.icon} />
							</span>
							<span
								className={cn(
									"min-w-0 truncate font-medium",
									activity.status === "failed" && "text-destructive/80",
								)}
							>
								{activity.summary}
							</span>
						</div>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}

function isSettledToolPart(part: AiChatToolPart) {
	return (
		part.state === "output-available" ||
		part.state === "output-error" ||
		part.state === "output-denied"
	);
}

/**
 * Parts whose rendering is content, not just an activity line, stay out of
 * groups so collapsing never hides them — today that is an image search's
 * result gallery.
 */
export function isToolGroupBreaker(part: AiChatMessagePart): boolean {
	return (
		isToolUIPart(part) &&
		getToolPartName(part) === "web_search" &&
		asRecord(part.input).source === "images"
	);
}
