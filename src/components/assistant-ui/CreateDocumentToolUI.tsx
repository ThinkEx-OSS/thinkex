"use client";

import { useState, useMemo } from "react";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import type { AssistantToolUIProps } from "@assistant-ui/react";
import { X, Eye, FolderInput, FileText } from "lucide-react";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import MoveToDialog from "@/components/modals/MoveToDialog";
import { ToolUILoadingShell } from "@/components/assistant-ui/tool-ui-loading-shell";
import { ToolUIErrorShell } from "@/components/assistant-ui/tool-ui-error-shell";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";

import type { ReactNode } from "react";
import { useUIStore } from "@/lib/stores/ui-store";
import { useWorkspaceOperations } from "@/hooks/workspace/use-workspace-operations";
import { useNavigateToItem } from "@/hooks/ui/use-navigate-to-item";
import { initialState } from "@/lib/workspace-state/state";
import { ToolUIErrorBoundary } from "@/components/tool-ui/shared";
import type { WorkspaceResult } from "@/lib/ai/tool-result-schemas";
import { parseWorkspaceResult } from "@/lib/ai/tool-result-schemas";
import { logger } from "@/lib/utils/logger";
import type { Item } from "@/lib/workspace-state/types";

type CreateDocumentArgs = { title: string; content: string };
type CreateDocumentToolRendererProps = {
  args: CreateDocumentArgs;
  result?: WorkspaceResult;
  status: { type: string; reason?: string };
};

interface CreateDocumentReceiptProps {
  args: CreateDocumentArgs;
  result: WorkspaceResult;
  status: { type?: string };
  moveItemToFolder?: (itemId: string, folderId: string | null) => void;
  allItems?: Item[];
  workspaceName?: string;
  workspaceIcon?: string | null;
  workspaceColor?: string | null;
}

const CreateDocumentReceipt = ({
  args,
  result,
  status,
  moveItemToFolder,
  allItems = [],
  workspaceName = "Workspace",
  workspaceIcon,
  workspaceColor,
}: CreateDocumentReceiptProps) => {
  const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const { state: workspaceState } = useWorkspaceState(workspaceId);
  const navigateToItem = useNavigateToItem();
  const openWorkspaceItem = useUIStore((state) => state.openWorkspaceItem);
  const [showMoveDialog, setShowMoveDialog] = useState(false);

  const currentItem = useMemo(() => {
    if (!result.itemId || !workspaceState?.items) return undefined;
    return workspaceState.items.find(
      (item: { id: string }) => item.id === result.itemId,
    );
  }, [result.itemId, workspaceState?.items]);

  const folderName = useMemo(() => {
    if (!currentItem?.folderId || !workspaceState?.items) return null;
    const folder = workspaceState.items.find(
      (item: { id: string }) => item.id === currentItem.folderId,
    );
    return folder?.name || null;
  }, [currentItem?.folderId, workspaceState?.items]);

  const handleViewCard = () => {
    if (!result.itemId) return;
    if (navigateToItem(result.itemId)) {
      openWorkspaceItem(result.itemId);
    }
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
          status?.type === "complete" &&
            result.itemId &&
            "cursor-pointer hover:bg-accent transition-colors",
        )}
        onClick={
          status?.type === "complete" && result.itemId
            ? handleViewCard
            : undefined
        }
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div
            className={cn(
              status?.type === "complete" ? "text-blue-400" : "text-red-400",
            )}
          >
            {status?.type === "complete" ? (
              <FileText className="size-4" />
            ) : (
              <X className="size-4" />
            )}
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-medium truncate">
              {status?.type === "complete"
                ? args.title
                : "Document Creation Cancelled"}
            </span>
            {status?.type === "complete" && (
              <span className="text-[10px] text-muted-foreground">
                {folderName ? `In ${folderName}` : "Document created"}
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
              onClick={(e) => {
                e.stopPropagation();
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

export const renderCreateDocumentToolUI: AssistantToolUIProps<
  CreateDocumentArgs,
  WorkspaceResult
>["render"] = (props) => {
  return <CreateDocumentToolRenderer {...props} />;
};

function CreateDocumentToolRenderer({
  args,
  result,
  status,
}: CreateDocumentToolRendererProps) {
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

  let parsed: WorkspaceResult | null = null;
  if (status.type === "complete" && result != null) {
    try {
      parsed = parseWorkspaceResult(result);
    } catch (err) {
      logger.error("🎨 [CreateDocumentTool] Failed to parse result:", err);
      parsed = null;
    }
  }

  let content: ReactNode = null;

  if (parsed?.success) {
    content = (
      <CreateDocumentReceipt
        args={args}
        result={parsed}
        status={status}
        moveItemToFolder={operations.moveItemToFolder}
        allItems={(workspaceState?.items ?? []) as Item[]}
        workspaceName={currentWorkspace?.name || "Workspace"}
        workspaceIcon={currentWorkspace?.icon}
        workspaceColor={currentWorkspace?.color}
      />
    );
  } else if (status.type === "complete" && parsed && !parsed.success) {
    content = (
      <ToolUIErrorShell
        label="Failed to create document"
        message={parsed.message}
      />
    );
  } else if (status.type === "complete" && !parsed) {
    content = (
      <ToolUIErrorShell
        label="Failed to create document"
        message="No result returned"
      />
    );
  } else if (status.type === "running") {
    content = <ToolUILoadingShell label="Creating document..." />;
  } else if (status.type === "incomplete" && status.reason === "error") {
    content = (
      <ToolUIErrorShell
        label="Failed to create document"
        message={parsed && !parsed.success ? parsed.message : undefined}
      />
    );
  }

  return (
    <ToolUIErrorBoundary componentName="CreateDocument">
      {content}
    </ToolUIErrorBoundary>
  );
}
