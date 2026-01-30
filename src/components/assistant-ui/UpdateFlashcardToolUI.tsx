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
        <div 
            className={cn(
                "my-1 flex w-full items-center justify-between overflow-hidden rounded-md border border-border/50 bg-card/50 text-card-foreground shadow-sm px-2 py-2",
                status?.type === "complete" && isCardInWorkspace && "cursor-pointer hover:bg-accent transition-colors"
            )}
            onClick={status?.type === "complete" && isCardInWorkspace ? handleViewCard : undefined}
        >
            <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className={cn(
                    status?.type === "complete" ? "text-purple-400" : "text-red-400"
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
                <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-xs font-medium truncate">
                        {status?.type === "complete" ? "Flashcards Added" : "Update Cancelled"}
                    </span>
                    {status?.type === "complete" && (
                        <span className="text-[10px] text-muted-foreground">
                            {isCardInWorkspace
                                ? `${cardsAdded} flashcard${cardsAdded !== 1 ? 's' : ''} added to deck`
                                : "Updating deck..."}
                        </span>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-1">
                {status?.type === "complete" && result.itemId && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 gap-1 text-[10px] px-2"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleViewCard();
                        }}
                    >
                        <Eye className="size-3" />
                        View
                    </Button>
                )}
            </div>
        </div>
    );
};

export const UpdateFlashcardToolUI = makeAssistantToolUI<UpdateFlashcardArgs, FlashcardResult>({
    toolName: "updateFlashcards",
    render: function UpdateFlashcardUI({ args, result, status }) {
        const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);

        useOptimisticToolUpdate(status, result, workspaceId);

        // Don't try to parse while still running - wait for completion
        let parsed: FlashcardResult | null = null;
        if (status.type !== "running" && result != null) {
            try {
                parsed = parseFlashcardResult(result);
            } catch (err) {
                // Log the error but don't throw - we'll show error state below
                logger.error("🎨 [UpdateFlashcardTool] Failed to parse result:", err);
                parsed = null;
            }
        }

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
