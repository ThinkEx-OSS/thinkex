"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, BrainCircuit, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Item, NoteData } from "@/lib/workspace-state/types";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { useQueryClient } from "@tanstack/react-query";

interface DeepResearchCardContentProps {
    item: Item;
    onUpdateItem: (itemId: string, updates: Partial<Item>) => void;
    isScrollLocked?: boolean;
}

export function DeepResearchCardContent({
    item,
    onUpdateItem,
    isScrollLocked = false,
}: DeepResearchCardContentProps) {
    // Get workspaceId from store for the finalize API call
    const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
    const queryClient = useQueryClient();

    const noteData = item.data as NoteData;
    const deepResearch = noteData.deepResearch;

    // If no deep research metadata, show nothing
    if (!deepResearch) {
        return null;
    }

    const { interactionId, status, thoughts, prompt, error } = deepResearch;

    // Local state for polling
    const [localThoughts, setLocalThoughts] = useState<string[]>(thoughts || []);
    const [localReport, setLocalReport] = useState<string>(noteData.field1 || "");
    const [localStatus, setLocalStatus] = useState(status);
    const [localError, setLocalError] = useState<string | null>(error || null);
    const [isFinalizing, setIsFinalizing] = useState(false);

    // Refs for polling
    const pollingIntervalRef = useRef<NodeJS.Timeout | undefined>(undefined);

    // Get the latest thought for display
    const latestThought = localThoughts.length > 0 ? localThoughts[localThoughts.length - 1] : null;

    // Persist changes to the card when research completes
    useEffect(() => {
        if (localStatus === "complete" && localReport && status !== "complete" && !isFinalizing) {
            setIsFinalizing(true);

            // Call API to format the report and update the card
            fetch("/api/deep-research/finalize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    itemId: item.id,
                    report: localReport,
                    thoughts: localThoughts,
                    workspaceId,
                }),
            })
                .then((res) => {
                    if (!res.ok) throw new Error("Failed to finalize");
                    return res.json();
                })
                .then(() => {
                    // Refetch workspace events to get the updated blockContent
                    // Toast AFTER refetch completes
                    if (workspaceId) {
                        queryClient.refetchQueries({ queryKey: ["workspace", workspaceId, "events"] })
                            .then(() => {
                                toast.success("Research complete and saved!");
                            });
                    } else {
                        toast.success("Research complete and saved!");
                    }
                })
                .catch((e) => {
                    console.error("Failed to finalize research:", e);
                    setIsFinalizing(false);
                    // Fallback: update locally without formatting
                    onUpdateItem(item.id, {
                        data: {
                            ...noteData,
                            field1: localReport,
                            deepResearch: {
                                ...deepResearch,
                                status: "complete",
                                thoughts: localThoughts,
                            },
                        },
                    });
                    toast.error("Failed to save research, using fallback");
                });
        }
    }, [localStatus, localReport, status, item.id, noteData, deepResearch, localThoughts, onUpdateItem, isFinalizing, workspaceId, queryClient]);

    // Polling connection - poll every 10 seconds
    useEffect(() => {
        if (!interactionId || localStatus !== "researching") {
            return;
        }

        const pollStatus = async () => {
            try {
                const url = new URL("/api/deep-research/status", window.location.href);
                url.searchParams.set("interactionId", interactionId);

                const response = await fetch(url.toString());
                if (!response.ok) {
                    throw new Error(`Status check failed: ${response.statusText}`);
                }

                const data = await response.json();

                // Update thoughts (only add new ones)
                if (data.thoughts && Array.isArray(data.thoughts)) {
                    setLocalThoughts((prev) => {
                        const newThoughts = [...prev];
                        for (const thought of data.thoughts) {
                            if (!newThoughts.includes(thought)) {
                                newThoughts.push(thought);
                            }
                        }
                        return newThoughts;
                    });
                }

                // Update report (replace with latest full content)
                if (data.report !== undefined) {
                    setLocalReport(data.report);
                }

                // Update status
                if (data.status) {
                    setLocalStatus(data.status);
                }

                // Update error if present
                if (data.error) {
                    setLocalError(data.error);
                }

                // Stop polling if research is complete or failed
                if (data.status === "complete" || data.status === "failed") {
                    if (pollingIntervalRef.current) {
                        clearInterval(pollingIntervalRef.current);
                        pollingIntervalRef.current = undefined;
                    }
                }
            } catch (e) {
                console.error("[DeepResearchCard] Error polling status:", e);
                // Continue polling on error - don't stop the interval
            }
        };

        // Poll immediately, then every 10 seconds
        pollStatus();
        pollingIntervalRef.current = setInterval(pollStatus, 10000);

        return () => {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = undefined;
            }
        };
    }, [interactionId, localStatus]);

    const isResearching = localStatus === "researching";
    const isFailed = localStatus === "failed";

    return (
        <div className={cn(
            "h-full flex flex-col items-center justify-center p-2",
            isScrollLocked && "overflow-hidden"
        )}>
            {/* Main loading state */}
            <div className="flex flex-col items-center gap-2 text-center max-w-sm">
                <div className="flex items-center gap-2">
                    {isResearching ? (
                        <Loader2 className="size-4 text-primary animate-spin" />
                    ) : isFailed ? (
                        <Sparkles className="size-4 text-primary" />
                    ) : (
                        <BrainCircuit className="size-4 text-primary" />
                    )}
                    <h3 className="text-sm font-semibold text-foreground">
                        {isResearching
                            ? "Deep Research in Progress"
                            : isFailed
                                ? "Research Failed"
                                : "Finalizing..."}
                    </h3>
                </div>

                <p className="text-xs text-muted-foreground line-clamp-2">
                    This can take 5-10 minutes
                </p>

                {/* Latest thought - only show the most recent one */}
                {latestThought && isResearching && (
                    <div className="w-full mt-2">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                            <BrainCircuit className="size-3" />
                            <span>Currently thinking...</span>
                        </div>
                        <div className="bg-muted/50 rounded-lg px-3 py-2 text-xs text-muted-foreground animate-in fade-in duration-300">
                            {latestThought}
                        </div>
                    </div>
                )}

                {/* Error message */}
                {localError && (
                    <div className="w-full text-xs text-red-500 bg-red-50 dark:bg-red-950/20 p-3 rounded-lg">
                        {localError}
                    </div>
                )}


            </div>
        </div>
    );
}
