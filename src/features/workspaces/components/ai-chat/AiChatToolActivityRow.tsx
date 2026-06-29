import { ChevronDown } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/components/ui/collapsible";
import { Marker, MarkerContent } from "#/components/ui/marker";
import {
	AiChatComputeDetails,
	AiChatComputeImages,
} from "#/features/workspaces/components/ai-chat/AiChatComputeResult";
import {
	getToolActivityForPart,
	type AiChatToolChildActivity,
	type AiChatToolActivity,
} from "#/features/workspaces/components/ai-chat/ai-chat-display-state";
import type { AiChatToolPart } from "#/features/workspaces/components/ai-chat/types";

export function AiChatToolActivityRow({
	part,
	nestedChildren = [],
}: {
	part: AiChatToolPart;
	nestedChildren?: AiChatToolChildActivity[];
}) {
	const activity = getToolActivityForPart(part);

	if (!activity) {
		return null;
	}

	const details = getActivityDetails(activity);
	const inlineContent = getInlineActivityContent(activity);
	const hasDetails = nestedChildren.length > 0 || details !== null;

	if (!hasDetails && !inlineContent) {
		return <ActivitySummary activity={activity} />;
	}

	return (
		<div className="max-w-full space-y-2">
			{hasDetails ? (
				<Collapsible className="w-fit max-w-full">
					<CollapsibleTrigger className="w-fit max-w-full text-left">
						<ActivitySummary activity={activity} canExpand />
					</CollapsibleTrigger>
					<CollapsibleContent className="mt-2 space-y-2 pl-7">
						{details}
						{nestedChildren.length > 0 ? (
							<div className="space-y-1">
								{nestedChildren.map((child) => (
									<div
										key={`${child.toolName}:${child.summary}`}
										className="text-muted-foreground/80 text-sm"
									>
										{child.summary}
									</div>
								))}
							</div>
						) : null}
					</CollapsibleContent>
				</Collapsible>
			) : (
				<ActivitySummary activity={activity} />
			)}
			{inlineContent}
		</div>
	);
}

function getInlineActivityContent(activity: AiChatToolActivity) {
	if (activity.toolName !== "compute" || activity.status === "running") {
		return null;
	}

	return <AiChatComputeImages output={activity.detail.output} />;
}

function getActivityDetails(activity: AiChatToolActivity) {
	if (activity.toolName !== "compute" || activity.status === "running") {
		return null;
	}

	return <AiChatComputeDetails output={activity.detail.output} />;
}

function ActivitySummary({
	activity,
	canExpand = false,
}: {
	activity: AiChatToolActivity;
	canExpand?: boolean;
}) {
	const isRunning = activity.status === "running";

	if (isRunning) {
		return (
			<Marker role="status" aria-live="polite" className="w-fit max-w-full py-1 text-sm">
				<MarkerContent className="shimmer">{activity.summary}</MarkerContent>
				{canExpand ? <ChevronDown className="size-3 shrink-0" aria-hidden="true" /> : null}
			</Marker>
		);
	}

	return (
		<Marker className="w-fit max-w-full py-1 text-sm">
			<MarkerContent className="truncate text-muted-foreground/80">
				{activity.summary}
			</MarkerContent>
			{canExpand ? <ChevronDown className="size-3 shrink-0" aria-hidden="true" /> : null}
		</Marker>
	);
}
