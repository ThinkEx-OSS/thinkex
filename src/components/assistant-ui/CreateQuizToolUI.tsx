"use client";

import type { MouseEvent, ReactNode } from "react";
import { useEffect, useState, useMemo } from "react";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import type { AssistantToolUIProps } from "@assistant-ui/react";
import { X, Eye, FolderInput, Brain } from "lucide-react";
import { logger } from "@/lib/utils/logger";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import MoveToDialog from "@/components/modals/MoveToDialog";
import { ToolUILoadingShell } from "@/components/assistant-ui/tool-ui-loading-shell";
import { ToolUIErrorShell } from "@/components/assistant-ui/tool-ui-error-shell";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";
import { useWorkspaceOperations } from "@/hooks/workspace/use-workspace-operations";
import { useNavigateToItem } from "@/hooks/ui/use-navigate-to-item";
import { initialState } from "@/lib/workspace-state/state";
import { ToolUIErrorBoundary } from "@/components/tool-ui/shared";
import type { QuizResult } from "@/lib/ai/tool-result-schemas";
import { parseQuizResult } from "@/lib/ai/tool-result-schemas";
import type { CreateQuizInput } from "@/lib/ai/tools/quiz-tools";
import type { Item } from "@/lib/workspace-state/types";

type ToolStatus = {
  type: "complete" | "running" | "incomplete" | "requires-action";
  reason?: string;
};

type CreateQuizToolRendererProps = {
  args: CreateQuizInput;
  result?: QuizResult;
  status: { type: string; reason?: string };
};

interface CreateQuizReceiptProps {
  result: QuizResult;
  status: ToolStatus;
  moveItemToFolder?: (itemId: string, folderId: string | null) => void;
  allItems: Item[];
  workspaceName?: string;
  workspaceIcon?: string | null;
  workspaceColor?: string | null;
}

const CreateQuizReceipt = ({
  result,
  status,
  moveItemToFolder,
  allItems,
  workspaceName = "Workspace",
  workspaceIcon,
  workspaceColor,
}: CreateQuizReceiptProps) => {
  const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const { state: workspaceState } = useWorkspaceState(workspaceId);
  const navigateToItem = useNavigateToItem();

  // State for MoveToDialog
  const [showMoveDialog, setShowMoveDialog] = useState(false);

  // Get the current item — try workspace state first, then allItems, then stub from result
  const currentItem = useMemo(() => {
    const targetId = result.itemId || result.quizId;
    if (!targetId) return undefined;
    const fromWorkspace = workspaceState?.items?.find(
      (item: Item) => item.id === targetId,
    );
    if (fromWorkspace) return fromWorkspace;
    const fromAll = allItems.find((item: Item) => item.id === targetId);
    if (fromAll) return fromAll;
    return {
      id: targetId,
      name: (result as { title?: string }).title ?? "Quiz",
      type: "quiz" as const,
      subtitle: "",
      data: {},
      folderId: undefined,
    };
  }, [result.itemId, result.quizId, result, workspaceState?.items, allItems]);

  // Get folder name if item is in a folder
  const folderName = useMemo(() => {
    if (!currentItem?.folderId || !workspaceState?.items) return null;
    const folder = workspaceState.items.find(
      (item: Item) => item.id === currentItem.folderId,
    );
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

  return (
    <>
      <div
        className={cn(
          "my-1 flex w-full items-center justify-between overflow-hidden rounded-md border border-border/50 bg-card/50 text-card-foreground shadow-sm px-2 py-2",
          status?.type === "complete" &&
            (result.itemId || result.quizId) &&
            "cursor-pointer hover:bg-accent transition-colors",
        )}
        onClick={
          status?.type === "complete" && (result.itemId || result.quizId)
            ? handleViewCard
            : undefined
        }
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div
            className={cn(
              status?.type === "complete" ? "text-green-400" : "text-red-400",
            )}
          >
            {status?.type === "complete" ? (
              <Brain className="size-4" />
            ) : (
              <X className="size-4" />
            )}
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-medium truncate">
              {status?.type === "complete"
                ? result.title
                : "Creation Cancelled"}
            </span>
            {status?.type === "complete" && (
              <span className="text-[10px] text-muted-foreground">
                {result.questionCount} question
                {result.questionCount !== 1 ? "s" : ""}{" "}
                {folderName ? `in ${folderName}` : "created"}
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
              onClick={(event: MouseEvent<HTMLButtonElement>) => {
                event.stopPropagation();
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

export const renderCreateQuizToolUI: AssistantToolUIProps<
  CreateQuizInput,
  QuizResult
>["render"] = (props) => {
  return <CreateQuizToolRenderer {...props} />;
};

function CreateQuizToolRenderer({
  args,
  result,
  status,
}: CreateQuizToolRendererProps) {
  const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const { state: workspaceState } = useWorkspaceState(workspaceId);
  const operations = useWorkspaceOperations(
    workspaceId,
    workspaceState || initialState,
  );
  const workspaceContext = useWorkspaceContext();
  const currentWorkspace = workspaceContext.workspaces.find(
    (w) => w.id === workspaceId,
  );

  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      return;
    }
    logger.debug("🎯 [CreateQuizTool] Render:", {
      args,
      result,
      status: status?.type,
    });
  }, [args, result, status]);

  let parsed: QuizResult | null = null;
  if (status.type === "complete" && result != null) {
    try {
      parsed = parseQuizResult(result);
    } catch (err) {
      logger.error("🎯 [CreateQuizTool] Failed to parse result:", err);
      parsed = null;
    }
  }

  let content: ReactNode = null;

  if (status.type === "running") {
    content = <ToolUILoadingShell label="Generating quiz..." />;
  } else if (status.type === "complete" && parsed?.success) {
    content = (
      <CreateQuizReceipt
        result={parsed}
        status={status as ToolStatus}
        moveItemToFolder={operations.moveItemToFolder}
        allItems={workspaceState?.items || []}
        workspaceName={
          currentWorkspace?.name || workspaceState?.globalTitle || "Workspace"
        }
        workspaceIcon={currentWorkspace?.icon}
        workspaceColor={currentWorkspace?.color}
      />
    );
  } else if (status.type === "complete" && parsed && !parsed.success) {
    content = (
      <ToolUIErrorShell
        label="Failed to create quiz"
        message={parsed.message}
      />
    );
  } else if (status.type === "incomplete" && status.reason === "error") {
    content = (
      <ToolUIErrorShell
        label="Failed to create quiz"
        message="Quiz generation failed"
      />
    );
  }

  return (
    <ToolUIErrorBoundary componentName="CreateQuiz">
      {content}
    </ToolUIErrorBoundary>
  );
}
