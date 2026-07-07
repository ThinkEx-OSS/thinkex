import {
	AlertTriangle,
	CheckCircle2,
	ChevronDown,
	Code2,
	FileText,
	Globe2,
	LoaderCircle,
	PencilLine,
	Search,
} from "lucide-react";
import { LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/components/ui/collapsible";
import { getAiToolActivityIconKind } from "#/features/workspaces/ai/ai-tool-presentation";
import {
	AiChatComputeDetails,
	AiChatComputeImages,
} from "#/features/workspaces/components/ai-chat/AiChatComputeResult";
import {
	getToolActivityForPart,
	type AiChatToolChildActivity,
	type AiChatToolActivity,
} from "#/features/workspaces/components/ai-chat/ai-chat-display-state";
import {
	getToolSourceHostname,
	getToolSourcePreviews,
	type ToolSourcePreview,
} from "#/features/workspaces/components/ai-chat/ai-chat-tool-source-previews";
import type { AiChatToolPart } from "#/features/workspaces/components/ai-chat/types";
import { cn } from "#/lib/utils";

const INLINE_SOURCE_LIMIT = 3;
const DETAIL_SOURCE_LIMIT = 8;

export function AiChatToolActivityRow({
	part,
	nestedChildren = [],
}: {
	part: AiChatToolPart;
	nestedChildren?: AiChatToolChildActivity[];
}) {
	const shouldReduceMotion = useReducedMotion();
	const activity = getToolActivityForPart(part);

	if (!activity) {
		return null;
	}

	const details = getActivityDetails(activity);
	const inlineContent = getInlineActivityContent(activity);
	const sourcePreviews = getToolSourcePreviews(activity);
	const hasDetails = nestedChildren.length > 0 || details !== null || sourcePreviews.length > 0;
	const content =
		!hasDetails && !inlineContent && sourcePreviews.length === 0 ? (
			<ActivitySummary activity={activity} sourcePreviews={sourcePreviews} />
		) : (
			<div className="max-w-full space-y-2">
				{hasDetails ? (
					<Collapsible className="w-fit max-w-full">
						<div className="inline-flex min-w-0 max-w-full items-center gap-1.5">
							<CollapsibleTrigger className="group/collapsible min-w-0 max-w-full text-left">
								<ActivitySummary activity={activity} canExpand sourcePreviews={[]} />
							</CollapsibleTrigger>
							<InlineSourceFavicons sources={sourcePreviews.slice(0, INLINE_SOURCE_LIMIT)} />
						</div>
						<CollapsibleContent className="mt-2 space-y-3 pl-7">
							{details}
							{sourcePreviews.length > 0 ? <SourceDetailList sources={sourcePreviews} /> : null}
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
	sourcePreviews,
}: {
	activity: AiChatToolActivity;
	canExpand?: boolean;
	sourcePreviews: ToolSourcePreview[];
}) {
	const isRunning = activity.status === "running";
	const title = activity.title;
	const summary = activity.summary === title ? "" : activity.summary;
	const fullLabel = summary ? `${title} · ${summary}` : title;

	return (
		<div
			role={isRunning ? "status" : undefined}
			aria-live={isRunning ? "polite" : undefined}
			title={fullLabel}
			className={cn(
				"group/tool-row inline-flex min-w-0 max-w-full items-center gap-1.5 py-0.5 text-sm text-muted-foreground",
				activity.status === "failed" && "text-destructive",
			)}
		>
			<span
				className={cn(
					"grid size-4 shrink-0 place-items-center self-center text-muted-foreground/80",
					activity.status === "failed" && "text-destructive",
				)}
			>
				<ToolActivityIcon toolName={activity.toolName} />
			</span>
			<span className="min-w-0 truncate">
				<span className={cn("font-medium text-foreground/90", isRunning && "shimmer")}>
					{title}
				</span>
				{summary ? (
					<span className="text-muted-foreground/70">
						{" · "}
						{summary}
					</span>
				) : null}
			</span>
			<InlineSourceFavicons sources={sourcePreviews.slice(0, INLINE_SOURCE_LIMIT)} />
			<ToolStatusIcon status={activity.status} />
			{canExpand ? (
				<ChevronDown
					className="size-3.5 shrink-0 self-center text-muted-foreground/70 transition-transform group-data-[panel-open]/collapsible:rotate-180"
					aria-hidden="true"
				/>
			) : null}
		</div>
	);
}

function InlineSourceFavicons({ sources }: { sources: ToolSourcePreview[] }) {
	if (sources.length === 0) {
		return null;
	}

	return (
		<span className="inline-flex shrink-0 items-center -space-x-1 self-center pl-0.5">
			{sources.map((source) => (
				<SourceFaviconLink key={`${source.url ?? source.title}:${source.title}`} source={source} />
			))}
		</span>
	);
}

function SourceFaviconLink({ source }: { source: ToolSourcePreview }) {
	const hostname = source.url ? getToolSourceHostname(source.url) : null;
	const content = (
		<span className="grid size-4 place-items-center rounded-full bg-background ring-1 ring-border/70">
			<Favicon hostname={hostname} title={source.title} className="size-3 rounded-[2px]" />
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
			src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`}
			alt=""
			className={cn("size-3.5 shrink-0 rounded-sm", className)}
			loading="lazy"
		/>
	);
}

function ToolActivityIcon({ toolName }: { toolName: string }) {
	switch (getAiToolActivityIconKind(toolName)) {
		case "code":
			return <Code2 className="size-3.5" aria-hidden="true" />;
		case "edit":
			return <PencilLine className="size-3.5" aria-hidden="true" />;
		case "file":
			return <FileText className="size-3.5" aria-hidden="true" />;
		case "search":
			return <Search className="size-3.5" aria-hidden="true" />;
		case "web":
			return <Globe2 className="size-3.5" aria-hidden="true" />;
		default:
			return <Globe2 className="size-3.5" aria-hidden="true" />;
	}
}

function ToolStatusIcon({ status }: { status: AiChatToolActivity["status"] }) {
	const className = cn(
		"size-3.5 shrink-0 text-muted-foreground/70",
		status === "running" && "animate-spin",
		status === "completed" && "text-success",
		status === "failed" && "text-destructive",
	);

	if (status === "running") {
		return <LoaderCircle className={className} aria-hidden="true" />;
	}

	return status === "failed" ? (
		<AlertTriangle className={className} aria-hidden="true" />
	) : (
		<CheckCircle2 className={className} aria-hidden="true" />
	);
}
