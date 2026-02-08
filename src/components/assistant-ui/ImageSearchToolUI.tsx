"use client";

import { makeAssistantToolUI, useScrollLock } from "@assistant-ui/react";
import { Loader2, Plus, Image as ImageIcon, Check, ChevronDownIcon, AlertTriangle } from "lucide-react";
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
import type { ImageResult } from "@/lib/google-images";

const ANIMATION_DURATION = 200;
const SHIMMER_DURATION = 1000;

interface SearchImagesArgs {
    query: string;
}

interface SearchImagesResult {
    success: boolean;
    images?: ImageResult[];
    message?: string;
    error?: string; // For detailed error messages (e.g. key missing)
}

const ImageSearchContent: FC<{
    args: SearchImagesArgs;
    status: { type: string };
    result: SearchImagesResult | null;
}> = ({ args, status, result }) => {
    const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
    const { state: workspaceState } = useWorkspaceState(workspaceId);
    // Explicitly type the operations result or use generic appropriately if needed, 
    // but here we just rely on type inference. 
    // The previous YouTube tool used `useWorkspaceOperations(workspaceId, workspaceState || initialState)`.
    const operations = useWorkspaceOperations(workspaceId, workspaceState || initialState);

    const [addedImages, setAddedImages] = useState<Set<string>>(new Set());
    const [addingImages, setAddingImages] = useState<Set<string>>(new Set());

    const isRunning = status.type === "running";
    const navigateToItem = useNavigateToItem();
    const [scrollToId, setScrollToId] = useState<string | null>(null);

    // Scroll to new item effect
    useEffect(() => {
        if (scrollToId && workspaceState?.items) {
            const item = workspaceState.items.find(i => i.id === scrollToId);
            if (item) {
                navigateToItem(scrollToId);
                setScrollToId(null);
            }
        }
    }, [scrollToId, workspaceState?.items, navigateToItem]);

    const handleAddImage = async (image: ImageResult) => {
        // Use URL as unique key for "added" set
        if (addedImages.has(image.url) || addingImages.has(image.url)) return;

        try {
            setAddingImages(prev => new Set(prev).add(image.url));

            const id = operations.createItem("image", image.title, {
                url: image.url,
                altText: image.title,
                caption: image.title
            });

            setAddedImages(prev => new Set(prev).add(image.url));
            toast.success("Image added to workspace");
            setScrollToId(id);
        } catch (error) {
            console.error("Failed to add image:", error);
            toast.error("Failed to add image");
        } finally {
            setAddingImages(prev => {
                const next = new Set(prev);
                next.delete(image.url);
                return next;
            });
        }
    };

    // Special handling for MISSING_KEYS error
    if (status.type === "complete" && result && result.message === "MISSING_KEYS") {
        return (
            <div className="my-1 flex w-full flex-col overflow-hidden rounded-md border border-amber-500/30 bg-amber-500/10 text-card-foreground shadow-sm">
                <div className="flex w-full items-center gap-2 px-3 py-3 border-b border-amber-500/20">
                    <AlertTriangle className="size-4 text-amber-500" />
                    <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Configuration Required</span>
                </div>
                <div className="p-3 text-xs text-muted-foreground space-y-2">
                    <p>Google Images Search is not configured.</p>
                    <p>Please add the following environment variables to your <code>.env</code> file:</p>
                    <pre className="bg-background/50 p-2 rounded border border-border/50 text-[10px] overflow-x-auto">
                        GOOGLE_SEARCH_API_KEY=your_key_here{"\n"}
                        GOOGLE_SEARCH_CX=your_cx_id_here
                    </pre>
                </div>
            </div>
        );
    }

    return (
        <div className="my-1 flex w-full flex-col overflow-hidden rounded-md border border-border/50 bg-card/50 text-card-foreground shadow-sm">
            {/* Header */}
            <div className="flex w-full items-center justify-between px-2 py-2 border-b border-border/50">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="text-blue-400">
                        {isRunning ? (
                            <Loader2 className="size-4 animate-spin" />
                        ) : (
                            <ImageIcon className="size-4" />
                        )}
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-xs font-medium truncate">
                            {isRunning ? `Searching for "${args.query}"...` : "Image Search"}
                        </span>
                        {status.type === "complete" && result && result.success && (
                            <span className="text-[10px] text-muted-foreground">
                                {result.images?.length || 0} images found
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Results Grid */}
            {status.type === "complete" && result && (
                <div className="p-2">
                    {!result.success || !result.images || result.images.length === 0 ? (
                        <div className="flex items-center gap-2 text-muted-foreground p-2 border rounded-md">
                            <span className="text-sm">No images found.</span>
                            {result.message && result.message !== "MISSING_KEYS" && <p className="text-xs text-red-500">{result.message}</p>}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[400px] overflow-y-auto pr-1">
                            {result.images.map((image, idx) => (
                                <div
                                    key={`${image.url}-${idx}`}
                                    className="relative group aspect-square rounded-md overflow-hidden bg-muted border border-border/50 cursor-pointer"
                                    onClick={() => handleAddImage(image)}
                                >
                                    {/* Image */}
                                    <img
                                        src={image.thumbnailUrl || image.url}
                                        alt={image.title}
                                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                                        loading="lazy"
                                    />

                                    {/* Overlay */}
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <Button
                                            variant={addedImages.has(image.url) ? "secondary" : "default"}
                                            size="sm"
                                            className="h-7 text-[10px] px-2 gap-1 scale-90 group-hover:scale-100 transition-transform"
                                            disabled={addedImages.has(image.url) || addingImages.has(image.url)}
                                        >
                                            {addedImages.has(image.url) ? (
                                                <>
                                                    <Check className="size-3" /> Added
                                                </>
                                            ) : addingImages.has(image.url) ? (
                                                <Loader2 className="size-3 animate-spin" />
                                            ) : (
                                                <>
                                                    <Plus className="size-3" /> Add
                                                </>
                                            )}
                                        </Button>
                                    </div>

                                    {/* Caption gradient */}
                                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-white text-[10px] truncate opacity-0 group-hover:opacity-100 transition-opacity">
                                        {image.title}
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

export const ImageSearchToolUI = makeAssistantToolUI<SearchImagesArgs, SearchImagesResult>({
    toolName: "searchImages",
    render: function ImageSearchToolUI({ args, status, result }) {
        return (
            <ToolUIErrorBoundary componentName="ImageSearch">
                <ImageSearchContent args={args} status={status} result={result ?? null} />
            </ToolUIErrorBoundary>
        );
    },
});
