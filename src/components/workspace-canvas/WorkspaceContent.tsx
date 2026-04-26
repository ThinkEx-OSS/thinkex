import { useMemo, useCallback, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { FileText, FolderPlus, Plus, Sparkles, Upload } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import type { Item, CardType } from "@/lib/workspace-state/types";
import { filterItemsByFolder } from "@/lib/workspace-state/search";
import { useAutoScroll } from "@/hooks/ui/use-auto-scroll";
import { transcriptSegmentsQueryKey } from "@/hooks/workspace/use-transcript-segments";
import { AUDIO_COMPLETE_EVENT } from "@/lib/audio/poll-audio-processing";
import { WorkspaceGrid } from "./WorkspaceGrid";
import { useUIStore } from "@/lib/stores/ui-store";
import { useSelectedCardIds } from "@/hooks/ui/use-selected-card-ids";
import { toast } from "sonner";
import { OCR_COMPLETE_EVENT } from "@/lib/ocr/client";
import {
  WORKSPACE_FILE_UPLOAD_ACCEPT_STRING,
  WORKSPACE_FILE_UPLOAD_DESCRIPTION,
} from "@/lib/uploads/workspace-upload-config";
import { cn } from "@/lib/utils";

interface WorkspaceContentProps {
  viewState: Item[];
  addItem: (
    type: CardType,
    name?: string,
    initialData?: Partial<Item["data"]>,
  ) => string;
  updateItem: (itemId: string, updates: Partial<Item>) => void;
  deleteItem: (itemId: string) => void;
  updateAllItems: (items: Item[]) => void;
  openWorkspaceItem: (itemId: string | null) => void;
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
  openWorkspaceItem,
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
  const scrollContainerRef =
    externalScrollContainerRef || localScrollContainerRef;

  const { handleDragStart: onDragStart, handleDragStop: onDragStop } =
    useAutoScroll(scrollContainerRef);

  const { selectedCardIdsArray } = useSelectedCardIds();

  const activeFolderId = useUIStore((state) => state.activeFolderId);
  const setActiveFolderId = useUIStore((state) => state.setActiveFolderId);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredItems = useMemo(() => {
    return filterItemsByFolder(viewState, activeFolderId ?? null);
  }, [viewState, activeFolderId]);

  const handleOpenFolder = useCallback(
    (folderId: string) => {
      setActiveFolderId(folderId);
      onOpenFolder?.(folderId);
    },
    [setActiveFolderId, onOpenFolder],
  );

  useEffect(() => {
    const handleOcrComplete = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { itemIds?: string[]; error?: string; status?: string }
        | undefined;
      if (detail?.error) {
        console.error("[OCR-processing-complete] OCR failed:", detail.error);
      }
    };

    window.addEventListener(OCR_COMPLETE_EVENT, handleOcrComplete);
    return () => {
      window.removeEventListener(OCR_COMPLETE_EVENT, handleOcrComplete);
    };
  }, []);

  useEffect(() => {
    const handleAudioComplete = (e: Event) => {
      const { itemId, retrying } =
        (
          e as CustomEvent<{
            itemId?: string;
            retrying?: boolean;
          }>
        ).detail ?? {};
      if (!itemId) return;

      if (retrying) {
        const existingData =
          viewState.find((item) => item.id === itemId)?.data ?? {};
        updateItem(itemId, {
          data: {
            ...existingData,
            processingStatus: "processing",
            error: undefined,
          } as Item["data"],
        });
        return;
      }

      if (!workspaceId) return;

      queryClient.invalidateQueries({
        queryKey: transcriptSegmentsQueryKey(workspaceId, itemId),
      });
    };

    window.addEventListener(AUDIO_COMPLETE_EVENT, handleAudioComplete);
    return () => {
      window.removeEventListener(AUDIO_COMPLETE_EVENT, handleAudioComplete);
    };
  }, [updateItem, viewState, workspaceId, queryClient]);

  const handleUpdateItem = useCallback(
    (itemId: string, updates: Partial<Item>) => {
      updateItem(itemId, updates);
    },
    [updateItem],
  );

  const handleDeleteItem = useCallback(
    (itemId: string) => {
      deleteItem(itemId);
    },
    [deleteItem],
  );

  const handleUpdateAllItems = useCallback(
    (items: Item[]) => {
      updateAllItems(items);
    },
    [updateAllItems],
  );

  const handleOpenModal = useCallback(
    (itemId: string) => {
      openWorkspaceItem(itemId);
    },
    [openWorkspaceItem],
  );

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
          oversizedFiles.push(
            `${file.name} (${(file.size / (1024 * 1024)).toFixed(1)}MB)`,
          );
        } else {
          validFiles.push(file);
        }
      });

      if (oversizedFiles.length > 0) {
        toast.error(
          `The following file${oversizedFiles.length > 1 ? "s" : ""} exceed${oversizedFiles.length === 1 ? "s" : ""} the ${MAX_FILE_SIZE_MB}MB limit:\n${oversizedFiles.join("\n")}`,
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
        toast.error(
          `Total file size (${totalSizeMB}MB) exceeds the 100MB combined limit`,
        );
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
    [onPDFUpload],
  );

  const handleDragStart = useCallback(() => {
    onDragStart();
  }, [onDragStart]);

  const handleDragStop = useCallback(() => {
    onDragStop();
  }, [onDragStop]);

  const isFiltering = activeFolderId !== null;
  const isEmptyWorkspace = viewState.length === 0;
  const isEmptyFolder = isFiltering && filteredItems.length === 0;

  const handleCreateDocument = useCallback(() => {
    const itemId = addItem("document");
    if (itemId) {
      toast.success("New document created");
      onItemCreated?.([itemId]);
    }
  }, [addItem, onItemCreated]);

  const handleCreateFolder = useCallback(() => {
    const itemId = addItem("folder");
    if (itemId) {
      toast.success("New folder created");
    }
  }, [addItem]);

  const emptyStateTitle = activeFolderId
    ? "This folder is ready for content"
    : "Start building this workspace";
  const emptyStateDescription = activeFolderId
    ? `Upload ${WORKSPACE_FILE_UPLOAD_DESCRIPTION} or create something new here. Anything you add will stay in this folder.`
    : `Upload ${WORKSPACE_FILE_UPLOAD_DESCRIPTION} or create your first document to start building this workspace.`;

  const supportedStartingPoints = [
    {
      icon: Upload,
      title: "Upload material",
      description: WORKSPACE_FILE_UPLOAD_DESCRIPTION,
    },
    {
      icon: FileText,
      title: "Create a document",
      description: activeFolderId
        ? "Add notes directly to this folder"
        : "Start drafting in a blank document",
    },
    {
      icon: FolderPlus,
      title: "Organize as you grow",
      description: activeFolderId
        ? "Create a nested folder for sub-topics"
        : "Create folders to keep related work together",
    },
  ];

  if (isEmptyWorkspace || isEmptyFolder) {
    return (
      <div className="flex-1 py-4 overflow-hidden">
        <div
          className={`${selectedCardIdsArray.length > 0 ? "pb-20" : ""} size-full workspace-grid-container px-4 sm:px-6`}
        >
          <EmptyState className="w-full min-w-0 max-w-full border-0 bg-transparent p-0">
            <div className="mx-auto w-full max-w-5xl min-w-0 px-1 py-6 sm:px-2 sm:py-10">
              <input
                id={emptyStateUploadInputId}
                ref={fileInputRef}
                type="file"
                multiple
                className="sr-only"
                onChange={handleFileChange}
                accept={WORKSPACE_FILE_UPLOAD_ACCEPT_STRING}
              />
              <div className="relative overflow-hidden rounded-[28px] border border-border/60 bg-background/85 shadow-[0_24px_90px_-40px_rgba(0,0,0,0.55)] backdrop-blur-xl">
                <div className="pointer-events-none absolute inset-x-8 top-0 h-28 rounded-full bg-primary/15 blur-3xl" />
                <div className="pointer-events-none absolute -right-16 top-16 size-40 rounded-full bg-primary/10 blur-3xl" />
                <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] lg:p-10">
                  <div className="flex min-w-0 flex-col items-start text-left">
                    <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary shadow-sm">
                      <Sparkles className="size-4" />
                      Ready when you are
                    </div>
                    <div className="mb-6 space-y-3">
                      <h3 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                        {emptyStateTitle}
                      </h3>
                      <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                        {emptyStateDescription}
                      </p>
                    </div>

                    <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className={cn(
                          "group inline-flex min-h-14 items-center justify-center gap-3 rounded-2xl px-5 py-3 text-left transition-all duration-200",
                          "bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 hover:shadow-primary/30",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        )}
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20 transition-transform duration-200 group-hover:scale-105 dark:bg-white/10">
                          <Upload className="size-5" />
                        </span>
                        <span className="flex flex-col items-start">
                          <span className="text-sm font-semibold sm:text-base">
                            Upload files
                          </span>
                          <span className="text-xs text-primary-foreground/80 sm:text-sm">
                            {WORKSPACE_FILE_UPLOAD_DESCRIPTION}
                          </span>
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={handleCreateDocument}
                        className={cn(
                          "inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-border/70 bg-background/80 px-5 py-3 text-sm font-medium text-foreground shadow-sm transition-all duration-200 sm:text-base",
                          "hover:border-primary/30 hover:bg-primary/5 hover:text-primary",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        )}
                      >
                        <Plus className="size-[18px]" />
                        New Document
                      </button>

                      <button
                        type="button"
                        onClick={handleCreateFolder}
                        className={cn(
                          "inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-border/70 bg-background/60 px-5 py-3 text-sm font-medium text-muted-foreground transition-all duration-200 sm:text-base",
                          "hover:border-border hover:bg-muted/60 hover:text-foreground",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        )}
                      >
                        <FolderPlus className="size-[18px]" />
                        New Folder
                      </button>
                    </div>

                    <p className="mt-4 text-xs text-muted-foreground sm:text-sm">
                      Tip: you can also drag and drop files anywhere in the
                      workspace.
                    </p>
                  </div>

                  <div className="grid gap-3 self-stretch">
                    {supportedStartingPoints.map((item) => {
                      const Icon = item.icon;
                      return (
                        <div
                          key={item.title}
                          className="flex items-start gap-4 rounded-2xl border border-border/60 bg-background/70 p-4 shadow-sm backdrop-blur-sm"
                        >
                          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
                            <Icon className="size-5" />
                          </div>
                          <div className="min-w-0 space-y-1">
                            <p className="text-sm font-medium text-foreground">
                              {item.title}
                            </p>
                            <p className="text-sm leading-6 text-muted-foreground">
                              {item.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
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
          key={activeFolderId ?? "root"}
          items={filteredItems}
          allItems={viewState}
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
