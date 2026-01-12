"use client";

import { useEffect, useMemo } from "react";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { useQueryClient } from "@tanstack/react-query";
import { makeAssistantToolUI } from "@assistant-ui/react";
import { Loader2, X, Eye, Plus } from "lucide-react";
import { logger } from "@/lib/utils/logger";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import ShinyText from "@/components/ShinyText";



// Type definitions for the tool - args is now plain text format
type UpdateFlashcardArgs = {
    description?: string;  // Text format: "Deck: ...\nFront: ...\nBack: ..."
    id?: string;           // Legacy support
    cardsToAdd?: Array<{ front: string; back: string }>;  // Legacy support
};

type UpdateFlashcardResult = {
    success: boolean;
    message: string;
    itemId?: string;
    cardsAdded?: number;
    deckName?: string;  // The matched deck name
};

import { useUIStore } from "@/lib/stores/ui-store";

interface UpdateFlashcardReceiptProps {
    args: UpdateFlashcardArgs;
    result: UpdateFlashcardResult;
    status: any;
}

const UpdateFlashcardReceipt = ({ args, result, status }: UpdateFlashcardReceiptProps) => {
    const setOpenModalItemId = useUIStore((state) => state.setOpenModalItemId);
    const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
    const { state: workspaceState } = useWorkspaceState(workspaceId);

    // Debug logging for receipt component
    useEffect(() => {
        logger.group(`📋 [UpdateFlashcardReceipt] MOUNTED/UPDATED`, true);
        logger.debug("Args:", JSON.stringify({ args }, null, 2));
        logger.debug("Result:", JSON.stringify(result, null, 2));
        logger.debug("Result itemId:", result?.itemId);
        logger.debug("Status type:", status?.type);
        logger.debug("Workspace ID:", workspaceId);
        logger.groupEnd();
    }, [args, result, status, workspaceId]);

    // Check if the card has appeared in the workspace
    const isCardInWorkspace = useMemo(() => {
        if (!result.itemId || !workspaceState?.items) return false;
        return workspaceState.items.some((item: any) => item.id === result.itemId);
    }, [result.itemId, workspaceState?.items]);

    const deckName = useMemo(() => {
        // First try to use the deckName from result (from fuzzy match)
        if (result.deckName) return result.deckName;
        // Fallback to looking up by itemId
        if (!result.itemId || !workspaceState?.items) return "Flashcard Deck";
        const item = workspaceState.items.find((item: any) => item.id === result.itemId);
        return item?.name || "Flashcard Deck";
    }, [result.deckName, result.itemId, workspaceState?.items]);

    const cardsAdded = result.cardsAdded ?? args.cardsToAdd?.length ?? 0;

    const handleViewCard = () => {
        if (!result.itemId) return;
        const element = document.getElementById(`item-${result.itemId}`);
        if (element) {
            // Find the scrollable container (the one with overflow-auto in WorkspaceSection)
            // We traverse up until we find the container with overflow-auto
            let container = element.parentElement;
            while (container && container !== document.body) {
                const style = window.getComputedStyle(container);
                // Check for overflow-auto or overflow-scroll
                if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                    break;
                }
                container = container.parentElement;
            }

            if (container && container !== document.body) {
                // Calculate position to scroll to (center the element)
                const elementRect = element.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();
                const relativeTop = elementRect.top - containerRect.top;

                container.scrollTo({
                    top: container.scrollTop + relativeTop - (container.clientHeight / 2) + (element.clientHeight / 2),
                    behavior: 'smooth'
                });
            } else {
                // Fallback if no specific container found
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }

        // Open the modal
        if (result.itemId) {
            setOpenModalItemId(result.itemId);
        }
    };

    return (
        <div className="my-2 flex w-full flex-col overflow-hidden rounded-xl border bg-card/50 text-card-foreground shadow-sm">
            <div className={cn(
                "flex items-center justify-between gap-2 bg-muted/20 px-4 py-3",
                status?.type === "complete" && "border-b"
            )}>
                <div className="flex items-center gap-2">
                    <div className={cn(
                        "flex size-8 items-center justify-center rounded-lg",
                        status?.type === "complete" ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"
                    )}>
                        {status?.type === "complete" ? (
                            isCardInWorkspace ? (
                                <Plus className="size-4" />
                            ) : (
                                <Loader2 className="size-4 animate-spin" />
                            )
                        ) : (
                            <X className="size-4" />
                        )}
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-semibold">
                            {status?.type === "complete" ? "Flashcards Added" : "Update Cancelled"}
                        </span>
                        {status?.type === "complete" && (
                            <span className="text-xs text-muted-foreground">
                                {isCardInWorkspace
                                    ? `${cardsAdded} card${cardsAdded !== 1 ? 's' : ''} added to deck`
                                    : "Updating deck..."}
                            </span>
                        )}
                    </div>
                </div>
                {status?.type === "complete" && result.itemId && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 text-xs"
                        onClick={handleViewCard}
                    >
                        <Eye className="size-3.5" />
                        View
                    </Button>
                )}
            </div>

            {status?.type === "complete" && (
                <div className="flex flex-col gap-2 p-4">
                    <div>
                        <h3 className="font-semibold text-base">{deckName}</h3>
                        <p className="text-xs text-muted-foreground mt-1">
                            +{cardsAdded} new card{cardsAdded !== 1 ? 's' : ''}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export const UpdateFlashcardToolUI = makeAssistantToolUI<UpdateFlashcardArgs, UpdateFlashcardResult>({
    toolName: "updateFlashcards",
    render: function UpdateFlashcardUI({ args, result, status }) {
        const queryClient = useQueryClient();
        const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);

        // Debug logging for render function
        useEffect(() => {
            logger.group(`🎨 [UpdateFlashcardTool] RENDER CALLED`, true);
            logger.debug("Args:", args ? JSON.stringify({ args }, null, 2) : "null");
            logger.debug("Result:", result ? JSON.stringify(result, null, 2) : "null");
            logger.debug("Status:", status ? JSON.stringify(status, null, 2) : "null");
            logger.debug("Status type:", status?.type);
            logger.debug("Workspace ID:", workspaceId);
            logger.debug("Result itemId:", result?.itemId);
            logger.groupEnd();
        }, [args, result, status, workspaceId]);

        // Trigger refetch when result is available
        useEffect(() => {
            if (status?.type === "complete" && result && result.success) {
                logger.debug("🔄 [UpdateFlashcardTool] Triggering refetch for completed flashcard update");
                if (workspaceId) {
                    queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId, "events"] });
                } else {
                    queryClient.invalidateQueries({ queryKey: ["workspace"] });
                }
            }
        }, [status, result, workspaceId, queryClient]);

        // Show receipt when result is available, or show loading state while creating
        if (result && result.success) {
            logger.debug("✅ [UpdateFlashcardTool] Rendering receipt with result");
            return <UpdateFlashcardReceipt args={args} result={result} status={status} />;
        }

        // Show loading state while tool is executing
        if (status.type === "running") {
            logger.debug("⏳ [UpdateFlashcardTool] Rendering loading state - status is running");
            return (
                <div className="my-2 flex w-full flex-col overflow-hidden rounded-xl border bg-card/50 text-card-foreground shadow-sm">
                    <div className="flex items-center gap-2 bg-muted/20 px-4 py-3">
                        <ShinyText
                            text="Adding flashcards to deck..."
                            disabled={false}
                            speed={1.5}
                            className="text-sm font-semibold"
                        />
                    </div>
                </div>
            );
        }

        // Show error state
        if (status.type === "incomplete" && status.reason === "error") {
            return (
                <div className="my-2 flex w-full flex-col overflow-hidden rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
                    <div className="flex items-center gap-2">
                        <X className="size-4 text-red-600 dark:text-red-400" />
                        <p className="text-sm font-medium text-red-800 dark:text-red-200">
                            Failed to update flashcard deck
                        </p>
                    </div>
                    {result && !result.success && result.message && (
                        <p className="mt-2 text-xs text-red-700 dark:text-red-300">{result.message}</p>
                    )}
                </div>
            );
        }

        logger.debug("❓ [UpdateFlashcardTool] Rendering null - no result and status is not running");
        return null;
    },
});
