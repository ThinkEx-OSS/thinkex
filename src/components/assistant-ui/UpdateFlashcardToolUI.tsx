"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { makeAssistantToolUI } from "@assistant-ui/react";
import { useOptimisticToolUpdate } from "@/hooks/ai/use-optimistic-tool-update";
import { Loader2, X, Eye, Plus } from "lucide-react";
import { logger } from "@/lib/utils/logger";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ToolUIErrorBoundary } from "@/components/tool-ui/shared";
import { ToolUILoadingShell } from "@/components/assistant-ui/tool-ui-loading-shell";
import type { FlashcardResult } from "@/lib/ai/tool-result-schemas";
import { parseFlashcardResult } from "@/lib/ai/tool-result-schemas";

// Tool accepts z.any() (plain text format), so args can be string or object
type UpdateFlashcardArgs = string | {
    description?: string;  // Text format: "Deck: ...\nFront: ...\nBack: ..."
    id?: string;           // Legacy support
    cardsToAdd?: Array<{ front: string; back: string }>;  // Legacy support
};

function isUpdateFlashcardArgsObject(
    args: UpdateFlashcardArgs
): args is Exclude<UpdateFlashcardArgs, string> {
    return typeof args === "object" && args !== null;
}

import { useUIStore } from "@/lib/stores/ui-store";

interface UpdateFlashcardReceiptProps {
    args: UpdateFlashcardArgs;
    result: FlashcardResult;
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

    const argsObj = isUpdateFlashcardArgsObject(args) ? args : null;
    const cardsAdded = result.cardsAdded ?? argsObj?.cardsToAdd?.length ?? 0;

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

export const UpdateFlashcardToolUI = makeAssistantToolUI<UpdateFlashcardArgs, FlashcardResult>({
    toolName: "updateFlashcards",
    render: function UpdateFlashcardUI({ args, result, status }) {
        const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);

        useOptimisticToolUpdate(status, result, workspaceId);

        const parsed = result != null ? parseFlashcardResult(result) : null;

        useEffect(() => {
            logger.group(`🎨 [UpdateFlashcardTool] RENDER CALLED`, true);
            logger.debug("Args:", args ? JSON.stringify({ args }, null, 2) : "null");
            logger.debug("Result:", result ? JSON.stringify(result, null, 2) : "null");
            logger.debug("Status:", status ? JSON.stringify(status, null, 2) : "null");
            logger.debug("Status type:", status?.type);
            logger.debug("Workspace ID:", workspaceId);
            logger.debug("Result itemId:", parsed?.itemId);
            logger.groupEnd();
        }, [args, result, status, workspaceId, parsed?.itemId]);

        let content: ReactNode = null;

        if (parsed?.success) {
            logger.debug("✅ [UpdateFlashcardTool] Rendering receipt with result");
            content = <UpdateFlashcardReceipt args={args} result={parsed} status={status} />;
        } else if (status.type === "running") {
            logger.debug("⏳ [UpdateFlashcardTool] Rendering loading state - status is running");
            content = <ToolUILoadingShell label="Adding flashcards to deck..." />;
        } else if (status.type === "incomplete" && status.reason === "error") {
            content = (
                <div className="my-2 flex w-full flex-col overflow-hidden rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
                    <div className="flex items-center gap-2">
                        <X className="size-4 text-red-600 dark:text-red-400" />
                        <p className="text-sm font-medium text-red-800 dark:text-red-200">
                            Failed to update flashcard deck
                        </p>
                    </div>
                    {parsed && !parsed.success && parsed.message && (
                        <p className="mt-2 text-xs text-red-700 dark:text-red-300">{parsed.message}</p>
                    )}
                </div>
            );
        } else {
            logger.debug("❓ [UpdateFlashcardTool] Rendering null - no result and status is not running");
        }

        return (
            <ToolUIErrorBoundary componentName="UpdateFlashcard">
                {content}
            </ToolUIErrorBoundary>
        );
    },
});
