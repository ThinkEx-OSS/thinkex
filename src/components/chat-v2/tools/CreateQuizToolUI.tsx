"use client";

import type { MouseEvent, ReactNode } from "react";
import type { ToolUIProps, ToolUIState } from "@/components/chat-v2/tools/types";
import { useEffect, useState, useMemo } from "react";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { X, Eye, FolderInput, Brain } from "lucide-react";
import { logger } from "@/lib/utils/logger";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import MoveToDialog from "@/components/modals/MoveToDialog";
import { ToolUILoadingShell } from "@/components/chat-v2/tools/ToolUILoadingShell";
import { ToolUIErrorShell } from "@/components/chat-v2/tools/ToolUIErrorShell";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";
import { useWorkspaceOperations } from "@/hooks/workspace/use-workspace-operations";
import { useNavigateToItem } from "@/hooks/ui/use-navigate-to-item";
import { initialItems } from "@/lib/workspace-state/state";
import { ToolUIErrorBoundary } from "@/components/tool-ui/shared";
import type { QuizResult } from "@/lib/ai/tool-result-schemas";
import { parseQuizResult } from "@/lib/ai/tool-result-schemas";
import type { CreateQuizInput } from "@/lib/ai/tools/quiz-tools";
import type { Item } from "@/lib/workspace-state/types";

type CreateQuizToolRendererProps = {
  input?: Partial<CreateQuizInput> | CreateQuizInput;
  output?: QuizResult;
  state: ToolUIState;
};

interface CreateQuizReceiptProps {
  result: QuizResult;
  state: ToolUIState;
  moveItemToFolder?: (itemId: string, folderId: string | null) => void;
  allItems: Item[];
  workspaceName?: string;
  workspaceIcon?: string | null;
  workspaceColor?: string | null;
}

const CreateQuizReceipt = ({
  result,
  state,
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
    const fromWorkspace = workspaceState?.find(
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
  }, [result, workspaceState, allItems]);

  // Get folder name if item is in a folder
  const folderName = useMemo(() => {
    if (!currentItem?.folderId) return null;
    const folder = workspaceState.find(
      (item: Item) => item.id === currentItem.folderId,
    );
    return folder?.name || null;
  }, [currentItem?.folderId, workspaceState]);

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
          state === "output-available" &&
            (result.itemId || result.quizId) &&
            "cursor-pointer hover:bg-accent transition-colors",
        )}
        onClick={
          state === "output-available" && (result.itemId || result.quizId)
            ? handleViewCard
            : undefined
        }
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div
            className={cn(
              state === "output-available" ? "text-green-400" : "text-red-400",
            )}
          >
            {state === "output-available" ? (
              <Brain className="size-4" />
            ) : (
              <X className="size-4" />
            )}
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-medium truncate">
              {state === "output-available"
                ? result.title
                : "Creation Cancelled"}
            </span>
            {state === "output-available" && (
              <span className="text-[10px] text-muted-foreground">
                {result.questionCount} question
                {result.questionCount !== 1 ? "s" : ""}{" "}
                {folderName ? `in ${folderName}` : "created"}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {state === "output-available" && (result.itemId || result.quizId) && (
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
          {state === "output-available" && moveItemToFolder && (
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

export const CreateQuizToolUI: React.FC<ToolUIProps<CreateQuizInput, QuizResult>> = (props) => {
  return <CreateQuizToolRenderer {...props} />;
};

function CreateQuizToolRenderer({
  input,
  output,
  state,
}: CreateQuizToolRendererProps) {
  const args = input as CreateQuizInput;
  const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const { state: workspaceState } = useWorkspaceState(workspaceId);
  const operations = useWorkspaceOperations(
    workspaceId,
    workspaceState || initialItems,
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
      result: output,
      state,
    });
  }, [args, output, state]);

  let parsed: QuizResult | null = null;
  if (state === "output-available" && output != null) {
    try {
      parsed = parseQuizResult(output);
    } catch (err) {
      logger.error("🎯 [CreateQuizTool] Failed to parse result:", err);
      parsed = null;
    }
  }

  let content: ReactNode = null;

  if (state === "input-streaming" || state === "input-available") {
    content = <ToolUILoadingShell label="Generating quiz..." />;
  } else if (state === "output-available" && parsed?.success) {
    content = (
      <CreateQuizReceipt
        result={parsed}
        state={state}
        moveItemToFolder={operations.moveItemToFolder}
        allItems={workspaceState || []}
        workspaceName={
          currentWorkspace?.name || "Workspace"
        }
        workspaceIcon={currentWorkspace?.icon}
        workspaceColor={currentWorkspace?.color}
      />
    );
  } else if (state === "output-available" && parsed && !parsed.success) {
    content = (
      <ToolUIErrorShell
        label="Failed to create quiz"
        message={parsed.message}
      />
    );
  } else if (state === "output-error") {
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
