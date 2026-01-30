"use client";

import { useEffect, useState, useMemo } from "react";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { makeAssistantToolUI } from "@assistant-ui/react";
import { useOptimisticToolUpdate } from "@/hooks/ai/use-optimistic-tool-update";
import { X, Eye, FolderInput } from "lucide-react";
import { PiCardsThreeBold } from "react-icons/pi";
import { logger } from "@/lib/utils/logger";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import MoveToDialog from "@/components/modals/MoveToDialog";
import { ToolUILoadingShell } from "@/components/assistant-ui/tool-ui-loading-shell";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";



import type { ReactNode } from "react";
import { useUIStore } from "@/lib/stores/ui-store";
import { useWorkspaceOperations } from "@/hooks/workspace/use-workspace-operations";
import { useNavigateToItem } from "@/hooks/ui/use-navigate-to-item";
import { initialState } from "@/lib/workspace-state/state";
import { ToolUIErrorBoundary } from "@/components/tool-ui/shared";
import type { FlashcardResult } from "@/lib/ai/tool-result-schemas";
import { parseFlashcardResult } from "@/lib/ai/tool-result-schemas";

// Tool accepts z.any() (plain text format), so args can be string or object
type CreateFlashcardArgs = string | {
    description?: string;
    title?: string;
    cards?: Array<{ front: string; back: string }>;
};

function isCreateFlashcardArgsObject(
    args: CreateFlashcardArgs
): args is Exclude<CreateFlashcardArgs, string> {
    return typeof args === "object" && args !== null;
}

interface CreateFlashcardReceiptProps {
    args: CreateFlashcardArgs;
    result: FlashcardResult;
    status: any;
    moveItemToFolder?: (itemId: string, folderId: string | null) => void;
    allItems?: any[];
    workspaceName?: string;
    workspaceIcon?: string | null;
    workspaceColor?: string | null;
}

const CreateFlashcardReceipt = ({
    args,
    result,
    status,
    moveItemToFolder,
    allItems = [],
    workspaceName = "Workspace",
    workspaceIcon,
    workspaceColor,
}: CreateFlashcardReceiptProps) => {
    const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
    const { state: workspaceState } = useWorkspaceState(workspaceId);
    const navigateToItem = useNavigateToItem();

    // State for MoveToDialog
    const [showMoveDialog, setShowMoveDialog] = useState(false);

    // Get the current item from workspace state
    const currentItem = useMemo(() => {
        if (!result.itemId || !workspaceState?.items) return undefined;
        return workspaceState.items.find((item: any) => item.id === result.itemId);
    }, [result.itemId, workspaceState?.items]);

    // Get folder name if item is in a folder
    const folderName = useMemo(() => {
        if (!currentItem?.folderId || !workspaceState?.items) return null;
        const folder = workspaceState.items.find((item: any) => item.id === currentItem.folderId);
        return folder?.name || null;
    }, [currentItem?.folderId, workspaceState?.items]);

    const argsObj = isCreateFlashcardArgsObject(args) ? args : null;
    const argsTitle = argsObj?.title;
    const argsCardsLen = argsObj?.cards?.length;

    // Debug logging for receipt component
    useEffect(() => {
        logger.group(`📋 [CreateFlashcardReceipt] MOUNTED/UPDATED`, true);
        logger.debug("Args:", JSON.stringify({ args }, null, 2));
        logger.debug("Result:", JSON.stringify(result, null, 2));
        logger.debug("Result itemId:", result?.itemId);
        logger.debug("Status type:", status?.type);
        logger.debug("Workspace ID:", workspaceId);
        logger.groupEnd();
    }, [args, result, status, workspaceId]);

    const handleViewCard = () => {
        if (!result.itemId) return;
        navigateToItem(result.itemId);
    };

    const handleMoveToFolder = (folderId: string | null) => {
        if (moveItemToFolder && result.itemId) {
            moveItemToFolder(result.itemId, folderId);
        }
    };

    return (
        <>
            <div 
                className={cn(
                    "my-1 flex w-full items-center justify-between overflow-hidden rounded-md border border-border/25 bg-card/50 text-card-foreground shadow-sm px-2 py-2",
                    status?.type === "complete" && result.itemId && "cursor-pointer hover:bg-accent transition-colors"
                )}
                onClick={status?.type === "complete" && result.itemId ? handleViewCard : undefined}
            >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className={cn(
                        status?.type === "complete" ? "text-purple-400" : "text-red-400"
                    )}>
                        {status?.type === "complete" ? (
                            <PiCardsThreeBold className="size-4 rotate-180" />
                        ) : (
                            <X className="size-4" />
                        )}
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-xs font-medium truncate">
                            {status?.type === "complete" ? (result.title || argsTitle || "Flashcards Created") : "Creation Cancelled"}
                        </span>
                        {status?.type === "complete" && (
                            <span className="text-[10px] text-muted-foreground">
                                {result.cardCount || result.cards?.length || argsCardsLen || '?'} flashcard{(result.cardCount || result.cards?.length || argsCardsLen || 0) !== 1 ? 's' : ''} {folderName ? `in ${folderName}` : "created"}
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
                    {status?.type === "complete" && moveItemToFolder && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-6 gap-1 text-[10px] px-2"
                            onClick={() => {
                                if (!currentItem) {
                                    toast.error("Item no longer exists");
                                    return;
                                }
                                setShowMoveDialog(true);
                            }}
                        >
                            <FolderInput className="size-3" />
                            Move
                        </Button>
                    )}
                </div>
            </div>

            {/* Move To Dialog */}
            {currentItem && (
                <MoveToDialog
                    open={showMoveDialog}
                    onOpenChange={setShowMoveDialog}
                    item={currentItem}
                    allItems={allItems}
                    workspaceName={workspaceName}
                    workspaceIcon={workspaceIcon}
                    workspaceColor={workspaceColor}
                    onMove={handleMoveToFolder}
                />
            )}
        </>
    );
};

export const CreateFlashcardToolUI = makeAssistantToolUI<CreateFlashcardArgs, FlashcardResult>({
    toolName: "createFlashcards",
    render: function CreateFlashcardUI({ args, result, status }) {
        const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
        const { state: workspaceState } = useWorkspaceState(workspaceId);
        const operations = useWorkspaceOperations(workspaceId, workspaceState || initialState);

        const workspaceContext = useWorkspaceContext();
        const currentWorkspace = workspaceContext.workspaces.find((w) => w.id === workspaceId);

        useOptimisticToolUpdate(status, result, workspaceId);

        // Don't try to parse while still running - wait for completion
        let parsed: FlashcardResult | null = null;
        if (status.type !== "running" && result != null) {
            try {
                parsed = parseFlashcardResult(result);
            } catch (err) {
                // Log the error but don't throw - we'll show error state below
                logger.error("🎨 [CreateFlashcardTool] Failed to parse result:", err);
                parsed = null;
            }
        }

        useEffect(() => {
            logger.group(`🎨 [CreateFlashcardTool] RENDER CALLED`, true);
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
            logger.debug("✅ [CreateFlashcardTool] Rendering receipt with result");
            content = (
                <CreateFlashcardReceipt
                    args={args}
                    result={parsed}
                    status={status}
                    moveItemToFolder={operations.moveItemToFolder}
                    allItems={workspaceState?.items || []}
                    workspaceName={currentWorkspace?.name || workspaceState?.globalTitle || "Workspace"}
                    workspaceIcon={currentWorkspace?.icon}
                    workspaceColor={currentWorkspace?.color}
                />
            );
        } else if (status.type === "running") {
            logger.debug("⏳ [CreateFlashcardTool] Rendering loading state - status is running");
            content = <ToolUILoadingShell label="Generating flashcards..." />;
        } else if (status.type === "incomplete" && status.reason === "error") {
            content = (
                <div className="my-2 flex w-full flex-col overflow-hidden rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
                    <div className="flex items-center gap-2">
                        <X className="size-4 text-red-600 dark:text-red-400" />
                        <p className="text-sm font-medium text-red-800 dark:text-red-200">
                            Failed to create flashcards
                        </p>
                    </div>
                    {parsed && !parsed.success && parsed.message && (
                        <p className="mt-2 text-xs text-red-700 dark:text-red-300">{parsed.message}</p>
                    )}
                </div>
            );
        } else {
            logger.debug("❓ [CreateFlashcardTool] Rendering null - no result and status is not running");
        }

        return (
            <ToolUIErrorBoundary componentName="CreateFlashcard">
                {content}
            </ToolUIErrorBoundary>
        );
    },
});
