import { useMemo, useCallback, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { Plus, Upload } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import type { AgentState, Item, CardType } from "@/lib/workspace-state/types";
import { filterItemsByFolder } from "@/lib/workspace-state/search";
import { useAutoScroll } from "@/hooks/ui/use-auto-scroll";
import { WorkspaceGrid } from "./WorkspaceGrid";
import { useUIStore } from "@/lib/stores/ui-store";
import { useSelectedCardIds } from "@/hooks/ui/use-selected-card-ids";
import { toast } from "sonner";
import { OCR_COMPLETE_EVENT } from "@/lib/ocr/client";
import {
  WORKSPACE_FILE_UPLOAD_ACCEPT_STRING,
  WORKSPACE_FILE_UPLOAD_DESCRIPTION,
} from "@/lib/uploads/workspace-upload-config";

interface WorkspaceContentProps {
  viewState: AgentState;
  addItem: (type: CardType, name?: string, initialData?: Partial<Item['data']>) => string;
  updateItem: (itemId: string, updates: Partial<Item>) => void;
  deleteItem: (itemId: string) => void;
  updateAllItems: (items: Item[]) => void;
  openItemInLeft: (itemId: string | null) => void;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  onGridDragStateChange?: (isDragging: boolean) => void;
  workspaceName?: string;
  workspaceIcon?: string | null;
  workspaceColor?: string | null;
  onMoveItem?: (itemId: string, folderId: string | null) => void;
  onMoveItems?: (itemIds: string[], folderId: string | null) => void;
  onOpenFolder?: (folderId: string) => void;
  onDeleteFolderWithContents?: (folderId: string) => void;
  onPDFUpload?: (files: File[]) => Promise<void>;
  onItemCreated?: (itemIds: string[]) => void;
}

export default function WorkspaceContent({
  viewState,
  addItem,
  updateItem,
  deleteItem,
  updateAllItems,
  openItemInLeft,
  scrollContainerRef: externalScrollContainerRef,
  onGridDragStateChange,
  workspaceName,
  workspaceIcon,
  workspaceColor,
  onMoveItem,
  onMoveItems,
  onOpenFolder,
  onDeleteFolderWithContents,
  onPDFUpload,
  onItemCreated,
}: WorkspaceContentProps) {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);

  const localScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = externalScrollContainerRef || localScrollContainerRef;

  const { handleDragStart: onDragStart, handleDragStop: onDragStop } = useAutoScroll(scrollContainerRef);

  const { selectedCardIdsArray } = useSelectedCardIds();

  const activeFolderId = useUIStore((state) => state.activeFolderId);
  const setActiveFolderId = useUIStore((state) => state.setActiveFolderId);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredItems = useMemo(() => {
    return filterItemsByFolder(viewState.items ?? [], activeFolderId ?? null);
  }, [viewState.items, activeFolderId]);

  const handleOpenFolder = useCallback((folderId: string) => {
    setActiveFolderId(folderId);
    onOpenFolder?.(folderId);
  }, [setActiveFolderId, onOpenFolder]);

  useEffect(() => {
    const handleOcrComplete = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { itemIds?: string[]; error?: string; status?: string }
        | undefined;
      if (detail?.error) {
        console.error("[OCR-processing-complete] OCR failed:", detail.error);
      }
      if (workspaceId) {
        queryClient.invalidateQueries({
          queryKey: ["workspace", workspaceId, "events"],
        });
      }
    };

    window.addEventListener(OCR_COMPLETE_EVENT, handleOcrComplete);
    return () => {
      window.removeEventListener(OCR_COMPLETE_EVENT, handleOcrComplete);
    };
  }, [workspaceId, queryClient]);

  useEffect(() => {
    const handleAudioComplete = (e: Event) => {
      const { itemId, retrying } = (e as CustomEvent<{
        itemId?: string;
        retrying?: boolean;
      }>).detail ?? {};
      if (!itemId) return;

      const existingData = viewState.items.find((i) => i.id === itemId)?.data ?? {};

      if (retrying) {
        updateItem(itemId, {
          data: {
            ...existingData,
            processingStatus: "processing",
            error: undefined,
          } as Item["data"],
        });
        return;
      }

      if (workspaceId) {
        queryClient.invalidateQueries({
          queryKey: ["workspace", workspaceId, "events"],
        });
      }
    };

    window.addEventListener("audio-processing-complete", handleAudioComplete);
    return () => {
      window.removeEventListener("audio-processing-complete", handleAudioComplete);
    };
  }, [updateItem, viewState.items, workspaceId, queryClient]);

  const handleUpdateItem = useCallback((itemId: string, updates: Partial<Item>) => {
    updateItem(itemId, updates);
  }, [updateItem]);

  const handleDeleteItem = useCallback((itemId: string) => {
    deleteItem(itemId);
  }, [deleteItem]);

  const handleUpdateAllItems = useCallback((items: Item[]) => {
    updateAllItems(items);
  }, [updateAllItems]);

  const handleOpenModal = useCallback((itemId: string) => {
    openItemInLeft(itemId);
  }, [openItemInLeft]);

  const emptyStateUploadInputId = "workspace-empty-file-upload";

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) {
        return;
      }

      const MAX_FILE_SIZE_MB = 50;
      const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
      const MAX_COMBINED_BYTES = 100 * 1024 * 1024;

      const validFiles: File[] = [];
      const oversizedFiles: string[] = [];

      Array.from(files).forEach((file) => {
        if (file.size > MAX_FILE_SIZE_BYTES) {
          oversizedFiles.push(`${file.name} (${(file.size / (1024 * 1024)).toFixed(1)}MB)`);
        } else {
          validFiles.push(file);
        }
      });

      if (oversizedFiles.length > 0) {
        toast.error(
          `The following file${oversizedFiles.length > 1 ? 's' : ''} exceed${oversizedFiles.length === 1 ? 's' : ''} the ${MAX_FILE_SIZE_MB}MB limit:\n${oversizedFiles.join('\n')}`
        );
      }

      if (validFiles.length === 0) {
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        return;
      }

      const totalSize = validFiles.reduce((sum, f) => sum + f.size, 0);
      if (totalSize > MAX_COMBINED_BYTES) {
        const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(1);
        toast.error(`Total file size (${totalSizeMB}MB) exceeds the 100MB combined limit`);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        return;
      }

      if (onPDFUpload) {
        try {
          await onPDFUpload(validFiles);
        } catch (error) {
          console.error("Failed to upload files:", error);
          toast.error("Failed to add files");
        }
      } else {
        console.error("onPDFUpload handler not available");
        toast.error("File upload not available");
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [onPDFUpload]
  );

  const handleDragStart = useCallback(() => {
    onDragStart();
  }, [onDragStart]);

  const handleDragStop = useCallback(() => {
    onDragStop();
  }, [onDragStop]);

  const isFiltering = activeFolderId !== null;

  if ((viewState.items ?? []).length === 0 || (isFiltering && filteredItems.length === 0)) {
    return (
      <div className="flex-1 py-4 overflow-hidden">
        <div className={`${selectedCardIdsArray.length > 0 ? 'pb-20' : ''} size-full workspace-grid-container px-4 sm:px-6`}>
          <EmptyState className="w-full min-w-0 max-w-full">
            <div className="mx-auto max-w-2xl w-full text-center px-4 sm:px-6 py-10 min-w-0">
              <input
                id={emptyStateUploadInputId}
                ref={fileInputRef}
                type="file"
                multiple
                className="sr-only"
                onChange={handleFileChange}
                accept={WORKSPACE_FILE_UPLOAD_ACCEPT_STRING}
              />

              <label
                htmlFor={emptyStateUploadInputId}
                className="mb-8 p-8 rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 hover:border-solid hover:shadow-[inset_0_0_0_2px_hsl(var(--muted-foreground)/0.3)] hover:bg-muted/50 transition-all cursor-pointer group block"
              >
                <Upload className="size-12 mx-auto mb-4 text-muted-foreground group-hover:text-primary group-hover:scale-110 transition-all duration-200" />
                <h3 className="text-base font-medium text-foreground mb-2">
                  {activeFolderId
                    ? `This folder is empty`
                    : "This workspace is empty"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  Add {WORKSPACE_FILE_UPLOAD_DESCRIPTION} here, or click to choose files.
                </p>
              </label>

              <div className="relative my-8">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 py-1.5 bg-muted text-muted-foreground rounded-lg">or</span>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Create your first item to get started</p>
                <button
                  onClick={() => {
                    const itemId = addItem("document");
                    if (itemId) {
                      toast.success("New document created");
                      if (onItemCreated) {
                        onItemCreated([itemId]);
                      }
                    }
                  }}
                  className="inline-flex items-center gap-2 px-6 py-3 text-base font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 hover:scale-105 transition-all duration-200 active:scale-95 cursor-pointer"
                >
                  <Plus className="size-5" />
                  New Document
                </button>
              </div>
            </div>
          </EmptyState>
        </div>
      </div>
    );
  }

  return (
    <div className="py-4">
      <div className={selectedCardIdsArray.length > 0 ? "pb-20" : undefined}>
        <WorkspaceGrid
          key={activeFolderId ?? 'root'}
          items={filteredItems}
          allItems={viewState.items}
          isFiltered={isFiltering}
          isTemporaryFilter={false}
          onDragStart={handleDragStart}
          onDragStop={handleDragStop}
          onUpdateItem={handleUpdateItem}
          onDeleteItem={handleDeleteItem}
          onUpdateAllItems={handleUpdateAllItems}
          onOpenModal={handleOpenModal}
          onGridDragStateChange={onGridDragStateChange}
          workspaceName={workspaceName || "Workspace"}
          workspaceIcon={workspaceIcon}
          workspaceColor={workspaceColor}
          onMoveItem={onMoveItem}
          onMoveItems={onMoveItems}
          onOpenFolder={handleOpenFolder}
          onDeleteFolderWithContents={onDeleteFolderWithContents}
        />
      </div>
    </div>
  );
}
