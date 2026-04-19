"use client";

import { useScrollLock } from "@/lib/chat/use-scroll-lock";
import type { ToolUIProps, ToolUIState } from "@/components/chat-v2/tools/types";
import { Loader2, Plus, Check } from "lucide-react";
import { YouTubeMark } from "@/components/icons/YouTubeMark";
import { Button } from "@/components/ui/button";
import { useState, useRef, useCallback, useEffect, type FC, type PropsWithChildren } from "react";
import { toast } from "sonner";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { useWorkspaceOperations } from "@/hooks/workspace/use-workspace-operations";
import { initialItems } from "@/lib/workspace-state/state";
import { useNavigateToItem } from "@/hooks/ui/use-navigate-to-item";
import {
    Collapsible,
    CollapsibleContent,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ToolUIErrorBoundary } from "@/components/tool-ui/shared";

const ANIMATION_DURATION = 200;
const SHIMMER_DURATION = 1000;

/** Format ISO date to relative or short date (e.g. "2 weeks ago", "Mar 2024"). */
function formatPublishedAt(iso: string): string {
    try {
        const date = new Date(iso);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays <= 0) return "today";
        if (diffDays === 1) return "1 day ago";
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) === 1 ? "" : "s"} ago`;
        if (diffDays < 365) return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) === 1 ? "" : "s"} ago`;
        return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
    } catch {
        return "";
    }
}

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
    duration?: string;
    viewCount?: string;
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
    state: ToolUIState;
    output: SearchYoutubeResult | null;
}> = ({ state, output }) => {
    const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
    const { state: workspaceState } = useWorkspaceState(workspaceId);
    const operations = useWorkspaceOperations(workspaceId, workspaceState || initialItems);

    const [addedVideos, setAddedVideos] = useState<Set<string>>(new Set());
    const [addingVideos, setAddingVideos] = useState<Set<string>>(new Set());

    const isRunning = state === "input-streaming" || state === "input-available";

    const navigateToItem = useNavigateToItem();
    const [scrollToId, setScrollToId] = useState<string | null>(null);

    // Effect to handle scrolling to new items once they exist in state
    useEffect(() => {
        if (scrollToId) {
            const item = workspaceState.find(i => i.id === scrollToId);
            if (item) {
                navigateToItem(scrollToId);
                setScrollToId(null);
            }
        }
    }, [scrollToId, workspaceState, navigateToItem]);

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
                            <YouTubeMark className="size-4" />
                        )}
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-xs font-medium truncate">
                            {isRunning ? "Searching YouTube..." : "YouTube Search"}
                        </span>
                        {state === "output-available" && output && (
                            <span className="text-[10px] text-muted-foreground">
                                {output.videos?.length || 0} videos found
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Results */}
            {state === "output-available" && output && (
                <div className="p-2">
                    {!output.success || !output.videos || output.videos.length === 0 ? (
                        <div className="flex items-center gap-2 text-muted-foreground p-2 border rounded-md">
                            <span className="text-sm">No videos found.</span>
                            {output.message && <p className="text-xs text-red-500">{output.message}</p>}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2 overflow-y-auto pr-1" style={{ maxHeight: 'min(50vh, 400px)' }}>
                            {output.videos.map((video) => (
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
                                            {video.duration && (
                                                <span
                                                    className="absolute bottom-0.5 right-0.5 px-1 py-0.5 text-[10px] font-medium rounded bg-black/80 text-white"
                                                    aria-label={`Duration: ${video.duration}`}
                                                >
                                                    {video.duration}
                                                </span>
                                            )}
                                        </div>

                                        {/* Video Info */}
                                        <div className="flex flex-col min-w-0 flex-1">
                                            <h4 className="font-medium text-sm line-clamp-1 leading-tight text-foreground" title={video.title}>
                                                {video.title}
                                            </h4>
                                            <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                                                <span className="line-clamp-1">{video.channelTitle}</span>
                                            </div>
                                            {(video.viewCount || video.publishedAt) && (
                                                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                                                    {video.viewCount && (
                                                        <span>{video.viewCount} views</span>
                                                    )}
                                                    {video.viewCount && video.publishedAt && (
                                                        <span aria-hidden>•</span>
                                                    )}
                                                    {video.publishedAt && (
                                                        <span>{formatPublishedAt(video.publishedAt)}</span>
                                                    )}
                                                </div>
                                            )}
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

export const YouTubeSearchToolUI: React.FC<ToolUIProps<SearchYoutubeArgs, SearchYoutubeResult>> = ({ input, state, output }) => {
  return (
    <ToolUIErrorBoundary componentName="YouTubeSearch">
      <YouTubeSearchContent args={(input as SearchYoutubeArgs) ?? { query: "" }} state={state} output={output ?? null} />
    </ToolUIErrorBoundary>
  );
};
