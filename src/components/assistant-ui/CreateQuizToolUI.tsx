"use client";

import type { ReactNode } from "react";
import { useEffect, useState, useMemo } from "react";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { makeAssistantToolUI } from "@assistant-ui/react";
import { useOptimisticToolUpdate } from "@/hooks/ai/use-optimistic-tool-update";
import { X, Eye, FolderInput, Brain } from "lucide-react";
import { logger } from "@/lib/utils/logger";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import MoveToDialog from "@/components/modals/MoveToDialog";
import { ToolUILoadingShell } from "@/components/assistant-ui/tool-ui-loading-shell";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";
import { useWorkspaceOperations } from "@/hooks/workspace/use-workspace-operations";
import { useNavigateToItem } from "@/hooks/ui/use-navigate-to-item";
import { initialState } from "@/lib/workspace-state/state";
import { ToolUIErrorBoundary } from "@/components/tool-ui/shared";
import type { QuizResult } from "@/lib/ai/tool-result-schemas";
import { parseQuizResult } from "@/lib/ai/tool-result-schemas";

type CreateQuizArgs = {
    topic?: string;
    difficulty?: "easy" | "medium" | "hard";
    contextContent?: string;
    sourceCardIds?: string[];
    sourceCardNames?: string[];
};

interface CreateQuizReceiptProps {
    args: CreateQuizArgs;
    result: QuizResult;
    status: any;
    moveItemToFolder?: (itemId: string, folderId: string | null) => void;
    allItems?: any[];
    workspaceName?: string;
    workspaceIcon?: string | null;
    workspaceColor?: string | null;
}

const difficultyColors = {
    easy: "bg-green-500/10 text-green-600",
    medium: "bg-yellow-500/10 text-yellow-600",
    hard: "bg-red-500/10 text-red-600",
};

const CreateQuizReceipt = ({ args, result, status, moveItemToFolder, allItems = [], workspaceName = "Workspace", workspaceIcon, workspaceColor }: CreateQuizReceiptProps) => {
    const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
    const { state: workspaceState } = useWorkspaceState(workspaceId);
    const navigateToItem = useNavigateToItem();

    // State for MoveToDialog
    const [showMoveDialog, setShowMoveDialog] = useState(false);

    // Get the current item from workspace state
    const currentItem = useMemo(() => {
        const targetId = result.itemId || result.quizId;
        if (!targetId || !workspaceState?.items) return undefined;
        return workspaceState.items.find((item: any) => item.id === targetId);
    }, [result.itemId, result.quizId, workspaceState?.items]);

    // Get folder name if item is in a folder
    const folderName = useMemo(() => {
        if (!currentItem?.folderId || !workspaceState?.items) return null;
        const folder = workspaceState.items.find((item: any) => item.id === currentItem.folderId);
        return folder?.name || null;
    }, [currentItem?.folderId, workspaceState?.items]);

    const handleViewCard = () => {
        const targetId = result.itemId || result.quizId;
        if (!targetId) return;
        navigateToItem(targetId);
    };

    const handleMoveToFolder = (folderId: string | null) => {
        const targetId = result.itemId || result.quizId;
        if (moveItemToFolder && targetId) {
            moveItemToFolder(targetId, folderId);
        }
    };

    const difficulty = result.difficulty || args.difficulty || "medium";

    return (
        <>
            <div 
                className={cn(
                    "my-1 flex w-full items-center justify-between overflow-hidden rounded-md border border-border/50 bg-card/50 text-card-foreground shadow-sm px-2 py-2",
                    status?.type === "complete" && (result.itemId || result.quizId) && "cursor-pointer hover:bg-accent transition-colors"
                )}
                onClick={status?.type === "complete" && (result.itemId || result.quizId) ? handleViewCard : undefined}
            >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className={cn(
                        status?.type === "complete" ? "text-green-400" : "text-red-400"
                    )}>
                        {status?.type === "complete" ? (
                            <Brain className="size-4" />
                        ) : (
                            <X className="size-4" />
                        )}
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-xs font-medium truncate">
                            {status?.type === "complete" ? result.title : "Creation Cancelled"}
                        </span>
                        {status?.type === "complete" && (
                            <span className="text-[10px] text-muted-foreground">
                                {result.questionCount} question{result.questionCount !== 1 ? 's' : ''} {folderName ? `in ${folderName}` : "created"}
                            </span>
                        )}
                    </div>
                </div>
                
                <div className="flex items-center gap-1">
                    {status?.type === "complete" && (result.itemId || result.quizId) && (
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
                            Take Quiz
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

export const CreateQuizToolUI = makeAssistantToolUI<CreateQuizArgs, QuizResult>({
    toolName: "createQuiz",
    render: function CreateQuizUI({ args, result, status }) {
        const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
        const { state: workspaceState } = useWorkspaceState(workspaceId);
        const operations = useWorkspaceOperations(workspaceId, workspaceState || initialState);
        const workspaceContext = useWorkspaceContext();
        const currentWorkspace = workspaceContext.workspaces.find((w) => w.id === workspaceId);

        useEffect(() => {
            logger.debug("🎯 [CreateQuizTool] Render:", { args, result, status: status?.type });
        }, [args, result, status]);

        useOptimisticToolUpdate(status, result, workspaceId);

        // Don't try to parse while still running - wait for completion
        let parsed: QuizResult | null = null;
        if (status.type !== "running" && result != null) {
            try {
                // With the new Output.object() approach, the quiz worker returns clean structured data
                // so we can parse normally without special streaming handling
                parsed = parseQuizResult(result);
            } catch (err) {
                // Log the error but don't throw - we'll show error state below
                logger.error("🎯 [CreateQuizTool] Failed to parse result:", err);
                parsed = null;
            }
        }

        let content: ReactNode = null;

        if (parsed?.success) {
            content = (
                <CreateQuizReceipt
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
            content = <ToolUILoadingShell label="Generating quiz..." />;
        } else if (
            (status.type === "incomplete" && status.reason === "error") ||
            (status.type === "complete" && parsed && !parsed.success)
        ) {
            content = (
                <div className="my-2 flex w-full flex-col overflow-hidden rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
                    <div className="flex items-center gap-2">
                        <X className="size-4 text-red-600 dark:text-red-400" />
                        <p className="text-sm font-medium text-red-800 dark:text-red-200">Failed to create quiz</p>
                    </div>
                    {parsed && !parsed.success && parsed.message && (
                        <p className="mt-2 text-xs text-red-700 dark:text-red-300">{parsed.message}</p>
                    )}
                </div>
            );
        }

        return (
            <ToolUIErrorBoundary componentName="CreateQuiz">
                {content}
            </ToolUIErrorBoundary>
        );
    },
});
