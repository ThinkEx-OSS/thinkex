"use client";

import { useEffect, useState, useMemo } from "react";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { useQueryClient } from "@tanstack/react-query";
import { makeAssistantToolUI } from "@assistant-ui/react";
import { X, Eye, FolderInput } from "lucide-react";
import { PiCardsThreeFill } from "react-icons/pi";
import { logger } from "@/lib/utils/logger";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import ShinyText from "@/components/ShinyText";
import MoveToDialog from "@/components/modals/MoveToDialog";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";



// Type definitions for the tool - args is now plain text format
type CreateFlashcardArgs = {
    description?: string;  // Text format: "Title: ...\nFront: ...\nBack: ..."
    title?: string;        // Legacy support
    cards?: Array<{ front: string; back: string }>;  // Legacy support
};

type CreateFlashcardResult = {
    success: boolean;
    message: string;
    title?: string;
    cards?: Array<{ front: string; back: string }>;
    cardCount?: number;  // Number of cards created
    itemId?: string;
};

import { useUIStore } from "@/lib/stores/ui-store";
import { useWorkspaceOperations } from "@/hooks/workspace/use-workspace-operations";
import { useNavigateToItem } from "@/hooks/ui/use-navigate-to-item";
import { initialState } from "@/lib/workspace-state/state";

interface CreateFlashcardReceiptProps {
    args: CreateFlashcardArgs;
    result: CreateFlashcardResult;
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
                                <PiCardsThreeFill className="size-4" />
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

export const CreateFlashcardToolUI = makeAssistantToolUI<CreateFlashcardArgs, CreateFlashcardResult>({
    toolName: "createFlashcards",
    render: function CreateFlashcardUI({ args, result, status }) {
        const queryClient = useQueryClient();
        const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
        const { state: workspaceState } = useWorkspaceState(workspaceId);
        const operations = useWorkspaceOperations(workspaceId, workspaceState || initialState);

        // Get workspace metadata from context
        const workspaceContext = useWorkspaceContext();
        const currentWorkspace = workspaceContext.workspaces.find(w => w.id === workspaceId);

        // Debug logging for render function
        useEffect(() => {
            logger.group(`🎨 [CreateFlashcardTool] RENDER CALLED`, true);
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
                logger.debug("🔄 [CreateFlashcardTool] Triggering refetch for completed flashcards");
                if (workspaceId) {
                    queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId, "events"] });
                } else {
                    queryClient.invalidateQueries({ queryKey: ["workspace"] });
                }
            }
        }, [status, result, workspaceId, queryClient]);

        // Show receipt when result is available, or show loading state while creating
        if (result && result.success) {
            logger.debug("✅ [CreateFlashcardTool] Rendering receipt with result");
            return (
                <CreateFlashcardReceipt
                    args={args}
                    result={result}
                    status={status}
                    moveItemToFolder={operations.moveItemToFolder}
                    allItems={workspaceState?.items || []}
                    workspaceName={currentWorkspace?.name || workspaceState?.globalTitle || "Workspace"}
                    workspaceIcon={currentWorkspace?.icon}
                    workspaceColor={currentWorkspace?.color}
                />
            );
        }

        // Show loading state while tool is executing
        if (status.type === "running") {
            logger.debug("⏳ [CreateFlashcardTool] Rendering loading state - status is running");
            return (
                <div className="my-2 flex w-full flex-col overflow-hidden rounded-xl border bg-card/50 text-card-foreground shadow-sm">
                    <div className="flex items-center gap-2 bg-muted/20 px-4 py-3">
                        <ShinyText
                            text="Generating flashcards..."
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
                            Failed to create flashcards
                        </p>
                    </div>
                    {result && !result.success && result.message && (
                        <p className="mt-2 text-xs text-red-700 dark:text-red-300">{result.message}</p>
                    )}
                </div>
            );
        }

        logger.debug("❓ [CreateFlashcardTool] Rendering null - no result and status is not running");
        return null;
    },
});
