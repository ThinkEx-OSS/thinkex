import { useMemo, useCallback, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { Upload, FileText, Folder, Mic, Play, Globe, Brain } from "lucide-react";
import { PiCardsThreeBold } from "react-icons/pi";
import { cn } from "@/lib/utils";
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
} from "@/lib/uploads/workspace-upload-config";

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
  onOpenYouTubeDialog?: () => void;
  onOpenWebsiteDialog?: () => void;
  onOpenAudioDialog?: () => void;
  onOpenFlashcardsDialog?: () => void;
  onOpenQuizDialog?: () => void;
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
  onOpenYouTubeDialog,
  onOpenWebsiteDialog,
  onOpenAudioDialog,
  onOpenFlashcardsDialog,
  onOpenQuizDialog,
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

  if (viewState.length === 0 || (isFiltering && filteredItems.length === 0)) {
    const actionCards = [
      {
        key: "upload",
        icon: <Upload className="size-5" />,
        title: "Upload",
        subtitle: "Documents, Images",
        hoverStyle: "hover:border-emerald-500/50 hover:shadow-[0_0_20px_-4px_rgba(16,185,129,0.3)] [&:hover_.action-icon]:text-emerald-500",
        isLabel: true,
      },
      {
        key: "document",
        icon: <FileText className="size-5" />,
        title: "Document",
        subtitle: "Rich text editor",
        hoverStyle: "hover:border-blue-500/50 hover:shadow-[0_0_20px_-4px_rgba(59,130,246,0.3)] [&:hover_.action-icon]:text-blue-500",
        onClick: () => {
          const itemId = addItem("document");
          if (itemId) {
            toast.success("New document created");
            onItemCreated?.([itemId]);
          }
        },
      },
      {
        key: "youtube",
        icon: <Play className="size-5" />,
        title: "YouTube",
        subtitle: "Add a video",
        hoverStyle: "hover:border-red-500/50 hover:shadow-[0_0_20px_-4px_rgba(239,68,68,0.3)] [&:hover_.action-icon]:text-red-500",
        onClick: onOpenYouTubeDialog,
      },
      {
        key: "website",
        icon: <Globe className="size-5" />,
        title: "Website",
        subtitle: "Save a webpage",
        hoverStyle: "hover:border-teal-500/50 hover:shadow-[0_0_20px_-4px_rgba(20,184,166,0.3)] [&:hover_.action-icon]:text-teal-500",
        onClick: onOpenWebsiteDialog,
      },
      {
        key: "audio",
        icon: <Mic className="size-5" />,
        title: "Audio",
        subtitle: "Lectures, Meetings",
        hoverStyle: "hover:border-rose-500/50 hover:shadow-[0_0_20px_-4px_rgba(244,63,94,0.3)] [&:hover_.action-icon]:text-rose-500",
        onClick: onOpenAudioDialog,
      },
      {
        key: "folder",
        icon: <Folder className="size-5" />,
        title: "Folder",
        subtitle: "Organize items",
        hoverStyle: "hover:border-amber-500/50 hover:shadow-[0_0_20px_-4px_rgba(245,158,11,0.3)] [&:hover_.action-icon]:text-amber-500",
        onClick: () => addItem("folder"),
      },
      {
        key: "flashcards",
        icon: <PiCardsThreeBold className="size-5 rotate-180" />,
        title: "Flashcards",
        subtitle: "Study with AI",
        hoverStyle: "hover:border-purple-500/50 hover:shadow-[0_0_20px_-4px_rgba(168,85,247,0.3)] [&:hover_.action-icon]:text-purple-500",
        onClick: onOpenFlashcardsDialog,
      },
      {
        key: "quiz",
        icon: <Brain className="size-5" />,
        title: "Quiz",
        subtitle: "Test yourself",
        hoverStyle: "hover:border-indigo-500/50 hover:shadow-[0_0_20px_-4px_rgba(99,102,241,0.3)] [&:hover_.action-icon]:text-indigo-500",
        onClick: onOpenQuizDialog,
      },
    ];

    const cardClassName = "group flex flex-col items-start gap-2 p-4 min-h-[88px] w-full rounded-2xl border bg-card/80 hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0 transition-all duration-300 ease-out text-left cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2";

    return (
      <div className="flex-1 flex flex-col items-center justify-center py-12 px-4 sm:px-6">
        <div
          className={cn(
            "w-full max-w-2xl text-center space-y-8",
            selectedCardIdsArray.length > 0 && "pb-20",
          )}
        >
          <div className="space-y-2">
            <h3 className="text-lg font-medium text-foreground">
              {activeFolderId ? "This folder is empty" : "This workspace is empty"}
            </h3>
            <p className="text-sm text-muted-foreground">
              Get started by adding your first item
            </p>
          </div>

          <input
            id={emptyStateUploadInputId}
            ref={fileInputRef}
            type="file"
            multiple
            className="sr-only"
            onChange={handleFileChange}
            accept={WORKSPACE_FILE_UPLOAD_ACCEPT_STRING}
          />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {actionCards.map((card) => {
              if ("isLabel" in card && card.isLabel) {
                return (
                  <label
                    key={card.key}
                    htmlFor={emptyStateUploadInputId}
                    className={cn(cardClassName, card.hoverStyle)}
                  >
                    <div className="action-icon text-foreground flex-shrink-0 transition-colors duration-300">
                      {card.icon}
                    </div>
                    <div className="flex flex-col items-start">
                      <div className="font-medium text-sm text-foreground">{card.title}</div>
                      <div className="text-xs text-muted-foreground">{card.subtitle}</div>
                    </div>
                  </label>
                );
              }

              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={"onClick" in card ? card.onClick : undefined}
                  disabled={!("onClick" in card && card.onClick)}
                  className={cn(
                    cardClassName,
                    "onClick" in card && card.onClick ? card.hoverStyle : "opacity-50 cursor-not-allowed hover:scale-100 hover:translate-y-0",
                  )}
                >
                  <div className="action-icon text-foreground flex-shrink-0 transition-colors duration-300">
                    {card.icon}
                  </div>
                  <div className="flex flex-col items-start">
                    <div className="font-medium text-sm text-foreground">{card.title}</div>
                    <div className="text-xs text-muted-foreground">{card.subtitle}</div>
                  </div>
                </button>
              );
            })}
          </div>
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
