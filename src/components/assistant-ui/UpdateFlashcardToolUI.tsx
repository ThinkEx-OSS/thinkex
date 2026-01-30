"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { makeAssistantToolUI } from "@assistant-ui/react";
import { useOptimisticToolUpdate } from "@/hooks/ai/use-optimistic-tool-update";
import { X, Eye, Plus } from "lucide-react";
import { logger } from "@/lib/utils/logger";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ToolUIErrorBoundary } from "@/components/tool-ui/shared";
import { ToolUILoadingShell } from "@/components/assistant-ui/tool-ui-loading-shell";
import { ToolUIErrorShell } from "@/components/assistant-ui/tool-ui-error-shell";
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

import { useNavigateToItem } from "@/hooks/ui/use-navigate-to-item";

interface UpdateFlashcardReceiptProps {
    args: UpdateFlashcardArgs;
    result: FlashcardResult;
    status: any;
}

const UpdateFlashcardReceipt = ({ args, result, status }: UpdateFlashcardReceiptProps) => {
    const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
    const { state: workspaceState } = useWorkspaceState(workspaceId);
    const navigateToItem = useNavigateToItem();

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
        navigateToItem(result.itemId);
    };

    return (
        <div
            className={cn(
                "my-1 flex w-full items-center justify-between overflow-hidden rounded-md border border-border/50 bg-card/50 text-card-foreground shadow-sm px-2 py-2",
                status?.type === "complete" && result.itemId && "cursor-pointer hover:bg-accent transition-colors"
            )}
            onClick={status?.type === "complete" && result.itemId ? handleViewCard : undefined}
        >
            <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className={cn(
                    status?.type === "complete" ? "text-purple-400" : "text-red-400"
                )}>
                    {status?.type === "complete" ? (
                        <Plus className="size-4" />
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
                            {cardsAdded} flashcard{cardsAdded !== 1 ? 's' : ''} added to deck
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
        if (status.type === "complete" && result != null) {
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
        } else if (status.type === "complete" && parsed && !parsed.success) {
            content = (
                <ToolUIErrorShell
                    label="Failed to update flashcard deck"
                    message={parsed.message}
                />
            );
        } else if (status.type === "incomplete" && status.reason === "error") {
            content = (
                <ToolUIErrorShell
                    label="Failed to update flashcard deck"
                    message={parsed?.message}
                />
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
