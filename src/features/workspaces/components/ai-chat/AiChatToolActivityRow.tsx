import { BookOpen, ChevronDown, FileText, Globe2, PencilLine, Search } from "lucide-react";
import { LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/components/ui/collapsible";
import {
	getAiToolPresentation,
	type AiToolActivityIconKind,
	type AiToolPresentation,
} from "#/features/workspaces/ai/ai-tool-registry";
import { AiChatImageSearchResults } from "#/features/workspaces/components/ai-chat/AiChatImageSearchResults";
import {
	getToolActivityForPart,
	type AiChatToolActivity,
} from "#/features/workspaces/components/ai-chat/ai-chat-display-state";
import { useLiveCodemodeActivity } from "#/features/workspaces/components/ai-chat/ai-chat-live-activity";
import {
	isVisibleOrchestrateCallTool,
	type AiChatToolSummarySegment,
} from "#/features/workspaces/components/ai-chat/ai-chat-tool-summaries";
import {
	getToolSourceHostname,
	getToolSourcePreviews,
	type ToolSourcePreview,
} from "#/features/workspaces/components/ai-chat/ai-chat-tool-source-previews";
import type { AiChatToolPart } from "#/features/workspaces/components/ai-chat/types";
import { asRecord } from "#/lib/record";
import { cn } from "#/lib/utils";

const INLINE_SOURCE_LIMIT = 3;
const DETAIL_SOURCE_LIMIT = 8;

export function AiChatToolActivityRow({
	interrupted = false,
	part,
}: {
	interrupted?: boolean;
	part: AiChatToolPart;
}) {
	const shouldReduceMotion = useReducedMotion();
	const liveActivity = useLiveCodemodeActivity(part.toolCallId);
	const baseActivity = getToolActivityForPart(part, { interrupted });

	if (!baseActivity) {
		return null;
	}

	// A running orchestrate row appends the nested tool it is currently
	// driving ("Analyzing quiz scores · Read workspace") from the live
	// transient stream events. Registry-hidden tools stay hidden here too.
	const activity =
		baseActivity.toolName === "orchestrate" &&
		baseActivity.status === "running" &&
		liveActivity &&
		isVisibleOrchestrateCallTool(liveActivity.call.toolName)
			? withLiveNestedAction(baseActivity, liveActivity.call.toolName)
			: baseActivity;
	const orchestrateCalls =
		activity.toolName === "orchestrate" && activity.status !== "running"
			? getOrchestrateCalls(part)
			: [];

	if (orchestrateCalls.length > 0) {
		// Inline expansion, same shape as the sources list: the detail renders in
		// the chat's own flow and background instead of a floating surface.
		return (
			<ToolActivityMotion disabled={shouldReduceMotion}>
				<Collapsible className="w-fit max-w-full">
					<CollapsibleTrigger className="group/collapsible min-w-0 max-w-full text-left">
						<ActivitySummary activity={activity} canExpand sourcePreviews={[]} />
					</CollapsibleTrigger>
					<CollapsibleContent className="mt-1">
						<OrchestrateCallList calls={orchestrateCalls} />
					</CollapsibleContent>
				</Collapsible>
			</ToolActivityMotion>
		);
	}

	const inlineContent = getInlineActivityContent(activity);
	const sourcePreviews = getToolSourcePreviews(activity);
	const content =
		!inlineContent && sourcePreviews.length === 0 ? (
			<ActivitySummary activity={activity} sourcePreviews={sourcePreviews} />
		) : (
			<div className="max-w-full space-y-2">
				{sourcePreviews.length > 0 ? (
					<Collapsible className="w-fit max-w-full">
						<div className="inline-flex min-w-0 max-w-full items-center gap-1.5">
							<CollapsibleTrigger className="group/collapsible min-w-0 max-w-full text-left">
								<ActivitySummary activity={activity} canExpand sourcePreviews={[]} />
							</CollapsibleTrigger>
							<InlineSourceFavicons sources={sourcePreviews.slice(0, INLINE_SOURCE_LIMIT)} />
						</div>
						<CollapsibleContent className="mt-2 space-y-3">
							<SourceDetailList sources={sourcePreviews} />
						</CollapsibleContent>
					</Collapsible>
				) : (
					<ActivitySummary activity={activity} sourcePreviews={sourcePreviews} />
				)}
				{inlineContent}
			</div>
		);

	return <ToolActivityMotion disabled={shouldReduceMotion}>{content}</ToolActivityMotion>;
}

function ToolActivityMotion({
	children,
	disabled,
}: {
	children: ReactNode;
	disabled: boolean | null;
}) {
	if (disabled) {
		return children;
	}

	return (
		<LazyMotion features={domAnimation}>
			<m.div
				layout="position"
				initial={{ opacity: 0, y: 2 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
				className="max-w-full origin-top-left will-change-transform"
			>
				{children}
			</m.div>
		</LazyMotion>
	);
}

interface OrchestrateCallView {
	toolName: string;
	status: "completed" | "failed";
	summary?: string;
}

function withLiveNestedAction(
	activity: AiChatToolActivity,
	nestedToolName: string,
): AiChatToolActivity {
	const nestedLabel = getAiToolPresentation(nestedToolName).title;

	return {
		...activity,
		summary: `${activity.summary} · ${nestedLabel}`,
		segments: [
			{ kind: "text", value: activity.summary },
			{ kind: "text", value: " · " },
			{ kind: "name", value: nestedLabel },
		],
	};
}

/** The nested calls a settled orchestrate part recorded, parsed defensively. */
function getOrchestrateCalls(part: AiChatToolPart): OrchestrateCallView[] {
	if (part.state !== "output-available") {
		return [];
	}

	const calls = asRecord(part.output).calls;
	if (!Array.isArray(calls)) {
		return [];
	}

	const views: OrchestrateCallView[] = [];
	for (const call of calls) {
		const record = asRecord(call);
		if (typeof record.toolName === "string" && isVisibleOrchestrateCallTool(record.toolName)) {
			views.push({
				toolName: record.toolName,
				status: record.status === "failed" ? "failed" : "completed",
				...(typeof record.summary === "string" ? { summary: record.summary } : {}),
			});
		}
	}

	return views;
}

function OrchestrateCallList({ calls }: { calls: OrchestrateCallView[] }) {
	return (
		// Indented under the parent row's text so the steps read as its children.
		<div className="grid gap-1 pl-5" aria-label="Steps in this run">
			{calls.map((call, index) => {
				const presentation = getAiToolPresentation(call.toolName);
				const label = call.summary ?? presentation.title;

				return (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: calls are append-only per run
						key={index}
						title={label}
						className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-muted-foreground text-xs"
					>
						<span className="grid size-3.5 shrink-0 place-items-center text-muted-foreground/70">
							<ToolActivityIcon icon={presentation.icon} />
						</span>
						<span
							className={cn(
								"min-w-0 truncate font-medium",
								call.status === "failed" && "text-destructive/80",
							)}
						>
							{label}
						</span>
					</div>
				);
			})}
		</div>
	);
}

function getInlineActivityContent(activity: AiChatToolActivity) {
	if (activity.status === "running" || activity.status === "interrupted") {
		return null;
	}

	if (activity.toolName === "web_search") {
		return <AiChatImageSearchResults output={activity.detail.output} />;
	}

	return null;
}

function ActivitySummary({
	activity,
	canExpand = false,
	sourcePreviews,
}: {
	activity: {
		presentation: AiToolPresentation;
		status: AiChatToolActivity["status"];
		summary: string;
		segments?: AiChatToolSummarySegment[];
	};
	canExpand?: boolean;
	sourcePreviews: ToolSourcePreview[];
}) {
	const isRunning = activity.status === "running";
	const { presentation } = activity;

	return (
		<div
			role={isRunning ? "status" : undefined}
			aria-live={isRunning ? "polite" : undefined}
			title={activity.summary}
			className="group/tool-row inline-flex min-w-0 max-w-full items-center gap-1.5 py-0.5 text-muted-foreground text-xs"
		>
			<span className="grid size-3.5 shrink-0 place-items-center self-center text-muted-foreground/70">
				<ToolActivityIcon icon={presentation.icon} />
			</span>
			<ActivitySummaryText
				summary={activity.summary}
				segments={activity.segments}
				isRunning={isRunning}
			/>
			<InlineSourceFavicons sources={sourcePreviews.slice(0, INLINE_SOURCE_LIMIT)} />
			{canExpand ? (
				<ChevronDown
					className="size-3.5 shrink-0 self-center text-muted-foreground/70 transition-transform group-data-[panel-open]/collapsible:rotate-180"
					aria-hidden="true"
				/>
			) : null}
		</div>
	);
}

function ActivitySummaryText({
	summary,
	segments,
	isRunning,
}: {
	summary: string;
	segments: AiChatToolSummarySegment[] | undefined;
	isRunning: boolean;
}) {
	if (!segments || segments.length === 0) {
		return (
			<span className={cn("min-w-0 truncate font-medium", isRunning && "shimmer")}>{summary}</span>
		);
	}
	// Row-level flex handles the layout: text segments stay their intrinsic
	// width, name segments take remaining space and truncate first. Wrapping
	// span binds the segments so cross-segment styling (font-medium, shimmer)
	// applies uniformly without introducing sibling gaps within the summary.
	return (
		<span className={cn("inline-flex min-w-0 items-baseline font-medium", isRunning && "shimmer")}>
			{segments.map((segment, index) =>
				segment.kind === "name" ? (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: segments are index-stable per receipt
						key={index}
						className="min-w-0 truncate"
					>
						{segment.value}
					</span>
				) : (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: segments are index-stable per receipt
						key={index}
						className="shrink-0 whitespace-pre"
					>
						{segment.value}
					</span>
				),
			)}
		</span>
	);
}

function InlineSourceFavicons({ sources }: { sources: ToolSourcePreview[] }) {
	if (sources.length === 0) {
		return null;
	}

	return (
		<span className="inline-flex shrink-0 items-center -space-x-1.5 self-center pl-0.5">
			{sources.map((source) => (
				<SourceFaviconLink key={`${source.url ?? source.title}:${source.title}`} source={source} />
			))}
		</span>
	);
}

function SourceFaviconLink({ source }: { source: ToolSourcePreview }) {
	const hostname = source.url ? getToolSourceHostname(source.url) : null;
	const content = (
		<span className="grid size-[18px] place-items-center rounded-full bg-background ring-1 ring-border/70">
			<Favicon hostname={hostname} title={source.title} className="size-3.5 rounded-[3px]" />
		</span>
	);

	if (!source.url) {
		return content;
	}

	return (
		<a
			href={source.url}
			target="_blank"
			rel="noreferrer"
			className="outline-none transition-transform hover:z-10 hover:scale-110 focus-visible:z-10 focus-visible:scale-110"
			title={hostname ?? source.title}
		>
			{content}
		</a>
	);
}

function SourceDetailList({ sources }: { sources: ToolSourcePreview[] }) {
	const visibleSources = sources.slice(0, DETAIL_SOURCE_LIMIT);
	const remainingSourceCount = sources.length - visibleSources.length;

	return (
		<div className="grid max-w-xl gap-1">
			{visibleSources.map((source) => (
				<SourceDetailItem key={`${source.url ?? source.title}:${source.title}`} source={source} />
			))}
			{remainingSourceCount > 0 ? (
				<div className="px-1 text-muted-foreground text-xs">
					+ {remainingSourceCount} more source{remainingSourceCount === 1 ? "" : "s"}
				</div>
			) : null}
		</div>
	);
}

function SourceDetailItem({ source }: { source: ToolSourcePreview }) {
	const hostname = source.url ? getToolSourceHostname(source.url) : null;
	const title = source.url ? (
		<a href={source.url} target="_blank" rel="noreferrer" className="hover:underline">
			{source.title}
		</a>
	) : (
		source.title
	);

	return (
		<div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 py-1">
			<Favicon hostname={hostname} title={source.title} className="size-3.5 rounded-sm" />
			<div className="min-w-0">
				<div className="truncate font-medium text-foreground/90 text-xs">{title}</div>
				{hostname || source.kind ? (
					<div className="truncate text-muted-foreground text-[11px]">
						{[source.kind, hostname].filter(Boolean).join(" · ")}
					</div>
				) : null}
				{source.description ? (
					<p className="mt-1 line-clamp-2 text-muted-foreground/80 text-xs leading-4">
						{source.description}
					</p>
				) : null}
			</div>
		</div>
	);
}

function Favicon({
	className,
	hostname,
	title,
}: {
	className?: string;
	hostname: string | null;
	title: string;
}) {
	if (!hostname) {
		return (
			<span
				className={cn(
					"grid size-3.5 shrink-0 place-items-center rounded-sm bg-muted text-[9px] text-muted-foreground",
					className,
				)}
			>
				{title.charAt(0).toUpperCase()}
			</span>
		);
	}

	return (
		<img
			src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`}
			alt=""
			className={cn("size-3.5 shrink-0 rounded-sm", className)}
			loading="lazy"
		/>
	);
}

export function ToolActivityIcon({ icon }: { icon: AiToolActivityIconKind }) {
	switch (icon) {
		case "edit":
			return <PencilLine className="size-3.5" aria-hidden="true" />;
		case "file":
			return <FileText className="size-3.5" aria-hidden="true" />;
		case "guidance":
			return <BookOpen className="size-3.5" aria-hidden="true" />;
		case "search":
			return <Search className="size-3.5" aria-hidden="true" />;
		case "web":
			return <Globe2 className="size-3.5" aria-hidden="true" />;
		default:
			icon satisfies never;
			return null;
	}
}
