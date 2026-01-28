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

type CreateFlashcardArgs = {
    description?: string;
    title?: string;
    cards?: Array<{ front: string; back: string }>;
};

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
            <div className="my-2 flex w-full flex-col overflow-hidden rounded-xl border bg-card/50 text-card-foreground shadow-sm">
                <div className={cn(
                    "flex items-center justify-between gap-2 bg-muted/20 px-4 py-3",
                    status?.type === "complete" && "border-b"
                )}>
                    <div className="flex items-center gap-2">
                        <div className={cn(
                            "flex size-8 items-center justify-center rounded-lg",
                            status?.type === "complete" ? "bg-purple-500/10 text-purple-600" : "bg-red-500/10 text-red-600"
                        )}>
                            {status?.type === "complete" ? (
                                <PiCardsThreeBold className="size-4 rotate-180" />
                            ) : (
                                <X className="size-4" />
                            )}
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-semibold">
                                {status?.type === "complete" ? "Flashcards Created" : "Creation Cancelled"}
                            </span>
                            {status?.type === "complete" && (
                                <span className="text-xs text-muted-foreground">
                                    {folderName
                                        ? `${result.cardCount || result.cards?.length || args.cards?.length || '?'} cards in ${folderName}`
                                        : `${result.cardCount || result.cards?.length || args.cards?.length || '?'} cards added`}
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
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-semibold text-base">{result.title || args.title}</h3>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {result.cardCount || result.cards?.length || args.cards?.length || '?'} card{(result.cardCount || result.cards?.length || args.cards?.length || 0) !== 1 ? 's' : ''} in deck
                                </p>
                            </div>
                            {moveItemToFolder && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 gap-1.5 text-xs"
                                    onClick={() => {
                                        if (!currentItem) {
                                            toast.error("Item no longer exists");
                                            return;
                                        }
                                        setShowMoveDialog(true);
                                    }}
                                >
                                    <FolderInput className="size-3.5" />
                                    Move to
                                </Button>
                            )}
                        </div>
                    </div>
                )}
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

        const parsed = result != null ? parseFlashcardResult(result) : null;

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
