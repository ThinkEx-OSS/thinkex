"use client";

import { useEffect, useState, useMemo } from "react";
import type { ToolUIProps, ToolUIState } from "@/components/chat-v2/tools/types";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { X, Eye, FolderInput } from "lucide-react";
import { PiCardsThreeBold } from "react-icons/pi";
import { logger } from "@/lib/utils/logger";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import MoveToDialog from "@/components/modals/MoveToDialog";
import { ToolUILoadingShell } from "@/components/chat-v2/tools/ToolUILoadingShell";
import { ToolUIErrorShell } from "@/components/chat-v2/tools/ToolUIErrorShell";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";

import type { MouseEvent, ReactNode } from "react";
import { useWorkspaceOperations } from "@/hooks/workspace/use-workspace-operations";
import { useNavigateToItem } from "@/hooks/ui/use-navigate-to-item";
import { initialItems } from "@/lib/workspace-state/state";
import { ToolUIErrorBoundary } from "@/components/tool-ui/shared";
import type { FlashcardResult } from "@/lib/ai/tool-result-schemas";
import { parseFlashcardResult } from "@/lib/ai/tool-result-schemas";
import type { Item } from "@/lib/workspace-state/types";

// Tool accepts z.any() (plain text format), so args can be string or object
type CreateFlashcardArgs =
  | string
  | {
      description?: string;
      title?: string;
      cards?: Array<{ front: string; back: string }>;
    };
type CreateFlashcardToolRendererProps = {
  input?: Partial<CreateFlashcardArgs> | CreateFlashcardArgs;
  output?: FlashcardResult;
  state: ToolUIState;
  errorText?: string;
};

function isCreateFlashcardArgsObject(
  args: CreateFlashcardArgs,
): args is Exclude<CreateFlashcardArgs, string> {
  return typeof args === "object" && args !== null;
}

interface CreateFlashcardReceiptProps {
  args: CreateFlashcardArgs;
  result: FlashcardResult;
  state: ToolUIState;
  moveItemToFolder?: (itemId: string, folderId: string | null) => void;
  allItems?: Item[];
  workspaceName?: string;
  workspaceIcon?: string | null;
  workspaceColor?: string | null;
}

const CreateFlashcardReceipt = ({
  args,
  result,
  state,
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
    if (!result.itemId) return undefined;
    return workspaceState.find((item: Item) => item.id === result.itemId);
  }, [result.itemId, workspaceState]);

  // Get folder name if item is in a folder
  const folderName = useMemo(() => {
    if (!currentItem?.folderId) return null;
    const folder = workspaceState.find(
      (item: Item) => item.id === currentItem.folderId,
    );
    return folder?.name || null;
  }, [currentItem?.folderId, workspaceState]);

  const argsObj = isCreateFlashcardArgsObject(args) ? args : null;
  const argsTitle = argsObj?.title;
  const argsCardsLen = argsObj?.cards?.length;

  // Debug logging for receipt component
  useEffect(() => {
    logger.group(`📋 [CreateFlashcardReceipt] MOUNTED/UPDATED`, true);
    logger.debug("Args:", JSON.stringify({ args }, null, 2));
    logger.debug("Result:", JSON.stringify(result, null, 2));
    logger.debug("Result itemId:", result?.itemId);
    logger.debug("State:", state);
    logger.debug("Workspace ID:", workspaceId);
    logger.groupEnd();
  }, [args, result, state, workspaceId]);

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
          state === "output-available" &&
            result.itemId &&
            "cursor-pointer hover:bg-accent transition-colors",
        )}
        onClick={
          state === "output-available" && result.itemId
            ? handleViewCard
            : undefined
        }
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div
            className={cn(
              state === "output-available" ? "text-purple-400" : "text-red-400",
            )}
          >
            {state === "output-available" ? (
              <PiCardsThreeBold className="size-4 rotate-180" />
            ) : (
              <X className="size-4" />
            )}
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-medium truncate">
              {state === "output-available"
                ? result.title || argsTitle || "Flashcards Created"
                : "Creation Cancelled"}
            </span>
            {state === "output-available" && (
              <span className="text-[10px] text-muted-foreground">
                {result.cardCount ||
                  result.cards?.length ||
                  argsCardsLen ||
                  "?"}{" "}
                flashcard
                {(result.cardCount ||
                  result.cards?.length ||
                  argsCardsLen ||
                  0) !== 1
                  ? "s"
                  : ""}{" "}
                {folderName ? `in ${folderName}` : "created"}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {state === "output-available" && result.itemId && (
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

export const CreateFlashcardToolUI: React.FC<ToolUIProps<CreateFlashcardArgs, FlashcardResult>> = (props) => {
  return <CreateFlashcardToolRenderer {...props} />;
};

function CreateFlashcardToolRenderer({
  input,
  output,
  state,
  errorText,
}: CreateFlashcardToolRendererProps) {
  const args = input as CreateFlashcardArgs;
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

  const parsed = useMemo(() => {
    if (state !== "output-available" || output == null) {
      return null;
    }
    try {
      return parseFlashcardResult(output);
    } catch (err) {
      logger.error("🎨 [CreateFlashcardTool] Failed to parse result:", err);
      return null;
    }
  }, [output, state]);

  useEffect(() => {
    logger.group(`🎨 [CreateFlashcardTool] RENDER CALLED`, true);
    logger.debug("Args:", args ? JSON.stringify({ args }, null, 2) : "null");
    logger.debug(
      "Result:",
      output ? JSON.stringify(output, null, 2) : "null",
    );
    logger.debug(
      "Status:",
      state,
    );
    logger.debug("State:", state);
    logger.debug("Workspace ID:", workspaceId);
    logger.debug("Result itemId:", parsed?.itemId);
    logger.groupEnd();
  }, [args, output, state, workspaceId, parsed?.itemId]);

  let content: ReactNode = null;

  if (parsed?.success) {
    logger.debug("✅ [CreateFlashcardTool] Rendering receipt with result");
    content = (
      <CreateFlashcardReceipt
        args={args}
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
  } else if (state === "input-streaming" || state === "input-available") {
    logger.debug(
      "⏳ [CreateFlashcardTool] Rendering loading state - status is running",
    );
    content = <ToolUILoadingShell label="Generating flashcards..." />;
  } else if (state === "output-available" && !parsed) {
    logger.error("🎨 [CreateFlashcardTool] Complete status had no parseable result");
    content = (
      <ToolUIErrorShell
        label="Failed to parse flashcard result"
        message="Could not parse tool output"
      />
    );
  } else if (state === "output-error") {
    content = (
      <ToolUIErrorShell
        label="Failed to create flashcards"
        message={errorText ?? "Flashcard generation failed"}
      />
    );
  } else {
    logger.debug(
      "❓ [CreateFlashcardTool] Rendering null - no result and status is not running",
    );
  }

  return (
    <ToolUIErrorBoundary componentName="CreateFlashcard">
      {content}
    </ToolUIErrorBoundary>
  );
}
