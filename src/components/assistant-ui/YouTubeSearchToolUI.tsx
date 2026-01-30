"use client";

import { makeAssistantToolUI, useAui, useScrollLock } from "@assistant-ui/react";
import { Loader2, Plus, Youtube, Check, ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useRef, useCallback, useEffect, type FC, type PropsWithChildren } from "react";
import { toast } from "sonner";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { useWorkspaceOperations } from "@/hooks/workspace/use-workspace-operations";
import { initialState } from "@/lib/workspace-state/state";
import { useNavigateToItem } from "@/hooks/ui/use-navigate-to-item";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import ShinyText from "@/components/ShinyText";
import { ToolUIErrorBoundary } from "@/components/tool-ui/shared";

const ANIMATION_DURATION = 200;
const SHIMMER_DURATION = 1000;

/**
 * Root collapsible container that manages open/closed state and scroll lock.
 */
const ToolRoot: FC<
    PropsWithChildren<{
        className?: string;
        defaultOpen?: boolean;
    }>
> = ({ className, children, defaultOpen = false }) => {
    const collapsibleRef = useRef<HTMLDivElement>(null);
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const lockScroll = useScrollLock(collapsibleRef, ANIMATION_DURATION);

    const handleOpenChange = useCallback(
        (open: boolean) => {
            if (!open) {
                lockScroll();
            }
            setIsOpen(open);
        },
        [lockScroll],
    );

    return (
        <Collapsible
            ref={collapsibleRef}
            open={isOpen}
            onOpenChange={handleOpenChange}
            className={cn("aui-tool-root mb-2 w-full", className)}
            style={
                {
                    "--animation-duration": `${ANIMATION_DURATION}ms`,
                    "--shimmer-duration": `${SHIMMER_DURATION}ms`,
                } as React.CSSProperties
            }
        >
            {children}
        </Collapsible>
    );
};

ToolRoot.displayName = "ToolRoot";

/**
 * Gradient overlay that softens the bottom edge during expand/collapse animations.
 */
const GradientFade: FC<{ className?: string }> = ({ className }) => (
    <div
        className={cn(
            "aui-tool-fade pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16",
            "bg-[linear-gradient(to_top,var(--color-background),transparent)]",
            "animate-in fade-in-0",
            "group-data-[state=open]/collapsible-content:animate-out",
            "group-data-[state=open]/collapsible-content:fade-out-0",
            "group-data-[state=open]/collapsible-content:delay-[calc(var(--animation-duration)*0.75)]",
            "group-data-[state=open]/collapsible-content:fill-mode-forwards",
            "duration-(--animation-duration)",
            "group-data-[state=open]/collapsible-content:duration-(--animation-duration)",
            className,
        )}
    />
);

/**
 * Trigger button for the tool collapsible.
 */
const ToolTrigger: FC<{
    active: boolean;
    label: string;
    icon: React.ReactNode;
    className?: string;
}> = ({
    active,
    label,
    icon,
    className,
}) => (
        <CollapsibleTrigger
            className={cn(
                "aui-tool-trigger group/trigger -mb-2 flex max-w-[75%] items-center gap-2 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground",
                className,
            )}
        >
            {icon}
            <span className="aui-tool-trigger-label-wrapper relative inline-block leading-none">
                {active ? (
                    <ShinyText
                        text={label}
                        disabled={false}
                        speed={1.5}
                        className="text-sm"
                    />
                ) : (
                    <span>{label}</span>
                )}
            </span>
            <ChevronDownIcon
                className={cn(
                    "aui-tool-trigger-chevron mt-0.5 size-4 shrink-0",
                    "transition-transform duration-(--animation-duration) ease-out",
                    "group-data-[state=closed]/trigger:-rotate-90",
                    "group-data-[state=open]/trigger:rotate-0",
                )}
            />
        </CollapsibleTrigger>
    );

/**
 * Collapsible content wrapper that handles height expand/collapse animation.
 */
const ToolContent: FC<
    PropsWithChildren<{
        className?: string;
        "aria-busy"?: boolean;
    }>
> = ({ className, children, "aria-busy": ariaBusy }) => (
    <CollapsibleContent
        className={cn(
            "aui-tool-content relative overflow-hidden text-sm text-muted-foreground outline-none",
            "group/collapsible-content ease-out",
            "data-[state=closed]:animate-collapsible-up",
            "data-[state=open]:animate-collapsible-down",
            "data-[state=closed]:fill-mode-forwards",
            "data-[state=closed]:pointer-events-none",
            "data-[state=open]:duration-(--animation-duration)",
            "data-[state=closed]:duration-(--animation-duration)",
            className,
        )}
        aria-busy={ariaBusy}
    >
        {children}
        <GradientFade />
    </CollapsibleContent>
);

ToolContent.displayName = "ToolContent";

interface VideoResult {
    id: string;
    title: string;
    description: string;
    channelTitle: string;
    thumbnailUrl: string;
    publishedAt: string;
    url: string;
}

interface SearchYoutubeArgs {
    query: string;
}

interface SearchYoutubeResult {
    success: boolean;
    videos?: VideoResult[];
    message?: string;
}

const YouTubeSearchContent: FC<{
    args: SearchYoutubeArgs;
    status: { type: string };
    result: SearchYoutubeResult | null;
}> = ({ args, status, result }) => {
    const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
    const { state: workspaceState } = useWorkspaceState(workspaceId);
    const operations = useWorkspaceOperations(workspaceId, workspaceState || initialState);

    const [addedVideos, setAddedVideos] = useState<Set<string>>(new Set());
    const [addingVideos, setAddingVideos] = useState<Set<string>>(new Set());

    const isRunning = status.type === "running";

    const navigateToItem = useNavigateToItem();
    const [scrollToId, setScrollToId] = useState<string | null>(null);

    // Effect to handle scrolling to new items once they exist in state
    useEffect(() => {
        if (scrollToId && workspaceState?.items) {
            const item = workspaceState.items.find(i => i.id === scrollToId);
            if (item) {
                navigateToItem(scrollToId);
                setScrollToId(null);
            }
        }
    }, [scrollToId, workspaceState?.items, navigateToItem]);

    const handleAddVideo = async (video: VideoResult) => {
        if (addedVideos.has(video.id) || addingVideos.has(video.id)) return;

        try {
            setAddingVideos(prev => new Set(prev).add(video.id));

            const id = operations.createItem("youtube", video.title, {
                url: `https://www.youtube.com/watch?v=${video.id}`
            });

            setAddedVideos(prev => new Set(prev).add(video.id));
            toast.success("Video added to workspace");

            // Queue scroll to position once item exists in state
            setScrollToId(id);
        } catch (error) {
            console.error("Failed to add video:", error);
            toast.error("Failed to add video");
        } finally {
            setAddingVideos(prev => {
                const next = new Set(prev);
                next.delete(video.id);
                return next;
            });
        }
    };

    return (
        <div className="my-1 flex w-full flex-col overflow-hidden rounded-md border border-border/50 bg-card/50 text-card-foreground shadow-sm">
            {/* Header */}
            <div className="flex w-full items-center justify-between px-2 py-2 border-b border-border/50">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="text-red-400">
                        {isRunning ? (
                            <Loader2 className="size-4 animate-spin" />
                        ) : (
                            <Youtube className="size-4" />
                        )}
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-xs font-medium truncate">
                            {isRunning ? "Searching YouTube..." : "YouTube Search"}
                        </span>
                        {status.type === "complete" && result && (
                            <span className="text-[10px] text-muted-foreground">
                                {result.videos?.length || 0} videos found
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Results */}
            {status.type === "complete" && result && (
                <div className="p-2">
                    {!result.success || !result.videos || result.videos.length === 0 ? (
                        <div className="flex items-center gap-2 text-muted-foreground p-2 border rounded-md">
                            <span className="text-sm">No videos found.</span>
                            {result.message && <p className="text-xs text-red-500">{result.message}</p>}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2 overflow-y-auto pr-1" style={{ maxHeight: 'min(50vh, 400px)' }}>
                            {result.videos.map((video) => (
                                <div
                                    key={video.id}
                                    className={cn(
                                        "flex w-full items-center justify-between overflow-hidden rounded-md px-2 py-2 min-h-[72px]",
                                        !addedVideos.has(video.id) && !addingVideos.has(video.id) && "cursor-pointer hover:bg-accent transition-colors"
                                    )}
                                    onClick={() => {
                                        if (!addedVideos.has(video.id) && !addingVideos.has(video.id)) {
                                            handleAddVideo(video);
                                        }
                                    }}
                                >
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                        {/* Thumbnail */}
                                        <div className="relative shrink-0 w-16 aspect-video rounded-sm overflow-hidden bg-muted">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={video.thumbnailUrl}
                                                alt={video.title}
                                                className="object-cover w-full h-full"
                                            />
                                        </div>
                                        
                                        {/* Video Info */}
                                        <div className="flex flex-col min-w-0 flex-1">
                                            <h4 className="font-medium text-sm line-clamp-1 leading-tight text-foreground" title={video.title}>
                                                {video.title}
                                            </h4>
                                            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                                                <Youtube className="size-3" />
                                                <span className="line-clamp-1">
                                                    {video.channelTitle}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action */}
                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant={addedVideos.has(video.id) ? "secondary" : "outline"}
                                            size="sm"
                                            className="h-6 gap-1 text-[10px] px-2"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleAddVideo(video);
                                            }}
                                            disabled={addedVideos.has(video.id) || addingVideos.has(video.id)}
                                        >
                                            {addedVideos.has(video.id) ? (
                                                <Check className="h-3 w-3" />
                                            ) : addingVideos.has(video.id) ? (
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : (
                                                <>
                                                    <Plus className="h-3 w-3" />
                                                    <span>Add</span>
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export const YouTubeSearchToolUI = makeAssistantToolUI<SearchYoutubeArgs, SearchYoutubeResult>({
    toolName: "searchYoutube",
    render: function YouTubeSearchToolUI({ args, status, result }) {
        return (
            <ToolUIErrorBoundary componentName="YouTubeSearch">
                <YouTubeSearchContent args={args} status={status} result={result ?? null} />
            </ToolUIErrorBoundary>
        );
    },
});
