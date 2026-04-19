import React, { RefObject, useState, useCallback } from "react";
import { toast } from "sonner";
import type { Item, CardType } from "@/lib/workspace-state/types";
import { DEFAULT_CARD_DIMENSIONS } from "@/lib/workspace-state/grid-layout-helpers";
import type { WorkspaceOperations } from "@/hooks/workspace/use-workspace-operations";
import WorkspaceContent from "./WorkspaceContent";
import SelectionActionBar from "./SelectionActionBar";
import { WorkspaceSkeleton } from "@/components/workspace/WorkspaceSkeleton";
import { MarqueeSelector } from "./MarqueeSelector";
import { useUIStore } from "@/lib/stores/ui-store";
import { useSelectedCardIds } from "@/hooks/ui/use-selected-card-ids";
import { useSession } from "@/lib/auth-client";
import { LoginGate } from "@/components/workspace/LoginGate";
import { AccessDenied } from "@/components/workspace/AccessDenied";
import { uploadFileDirect } from "@/lib/uploads/client-upload";
import { buildWorkspaceItemDefinitionsFromAssets } from "@/lib/uploads/uploaded-asset";
import {
  getFileSizeLabel,
  prepareWorkspaceUploadSelection,
  uploadSelectedFiles,
} from "@/lib/uploads/upload-selection";
import { emitPasswordProtectedPdf } from "@/components/modals/PasswordProtectedPdfDialog";

import MoveToDialog from "@/components/modals/MoveToDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";

import { CreateYouTubeDialog } from "@/components/modals/CreateYouTubeDialog";
import { AudioRecordingIndicator } from "./AudioRecordingIndicator";
import { useReactiveNavigation } from "@/hooks/ui/use-reactive-navigation";
import { filterItemIdsForFolderCreation } from "@/lib/workspace-state/search";
import { renderWorkspaceMenuItems } from "./workspace-menu-items";
import { PromptBuilderDialog } from "@/components/assistant-ui/PromptBuilderDialog";
import { useAudioRecordingStore } from "@/lib/stores/audio-recording-store";
import { AudioRecorderDialog } from "@/components/modals/AudioRecorderDialog";
import { CreateWebsiteDialog } from "@/components/modals/CreateWebsiteDialog";
import { useWorkspaceFilePicker } from "@/hooks/workspace/use-workspace-file-picker";
import { startAudioProcessing } from "@/lib/audio/start-audio-processing";
import { startAssetProcessing } from "@/lib/uploads/start-asset-processing";
import {
  getDocumentUploadFailureMessage,
  getDocumentUploadLoadingMessage,
  getDocumentUploadPartialMessage,
  getDocumentUploadSuccessMessage,
} from "@/lib/uploads/upload-feedback";
import { logger } from "@/lib/utils/logger";

interface WorkspaceSectionProps {
  // Loading states
  loadingWorkspaces: boolean;
  isLoadingWorkspace: boolean;

  // Workspace state
  currentWorkspaceId: string | null;
  currentSlug: string | null;
  state: Item[];

  // Operations
  addItem: (
    type: CardType,
    name?: string,
    initialData?: Partial<Item["data"]>,
  ) => string;
  updateItem: (itemId: string, updates: Partial<Item>) => void;
  deleteItem: (itemId: string) => void;
  updateAllItems: (items: Item[]) => void;

  // Full operations object for advanced functionality
  operations?: WorkspaceOperations;

  // Layout state
  isChatMaximized: boolean;

  // Chat state
  isDesktop?: boolean;
  isChatExpanded?: boolean;
  setIsChatExpanded?: (expanded: boolean) => void;
  // Modal state
  openWorkspaceItem: (itemId: string | null) => void;

  // Refs
  titleInputRef: RefObject<HTMLInputElement>;
  scrollAreaRef: RefObject<HTMLDivElement>;

  // Workspace metadata
  workspaceTitle?: string;
  workspaceIcon?: string | null;
  workspaceColor?: string | null;
  /** Full-screen open-item viewer (PDF / card shells), mounted above the grid scroll area */
  openItemView?: React.ReactNode;
}

/**
 * Workspace section component that encapsulates the main workspace area.
 * Includes header, content, and action bar.
 */
export function WorkspaceSection({
  loadingWorkspaces,
  isLoadingWorkspace,
  currentWorkspaceId,
  currentSlug,
  state,
  addItem,
  updateItem,
  deleteItem,
  updateAllItems,
  isChatMaximized,
  isDesktop,
  isChatExpanded,
  setIsChatExpanded,
  openWorkspaceItem,
  titleInputRef,
  scrollAreaRef,
  workspaceTitle,
  workspaceIcon,
  workspaceColor,
  operations,
  openItemView,
}: WorkspaceSectionProps) {
  // Card selection state from UI store
  // Use array selector with shallow comparison to prevent unnecessary re-renders and SSR issues
  const { selectedCardIdsArray, selectedCardIds } = useSelectedCardIds();
  const clearCardSelection = useUIStore((state) => state.clearCardSelection);
  const { data: session } = useSession();

  // Get active folder info from UI store
  const activeFolderId = useUIStore((uiState) => uiState.activeFolderId);

  // Track grid dragging state for marquee conflict prevention
  const [isGridDragging, setIsGridDragging] = useState(false);

  // Delete confirmation state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Move dialog state
  const [showMoveDialog, setShowMoveDialog] = useState(false);

  // Workspace settings and share modal state
  const [showYouTubeDialog, setShowYouTubeDialog] = useState(false);
  const [showWebsiteDialog, setShowWebsiteDialog] = useState(false);
  const [showQuizDialog, setShowQuizDialog] = useState(false);
  const [showFlashcardsDialog, setShowFlashcardsDialog] = useState(false);
  const showAudioDialog = useAudioRecordingStore((s) => s.isDialogOpen);
  const openAudioDialog = useAudioRecordingStore((s) => s.openDialog);
  const closeAudioDialog = useAudioRecordingStore((s) => s.closeDialog);

  // Use reactive navigation hook for auto-scroll/selection
  const { handleCreatedItems } = useReactiveNavigation(state);

  const handleYouTubeCreate = useCallback(
    (url: string, name: string, thumbnail?: string) => {
      if (addItem) {
        try {
          addItem("youtube", name, { url, thumbnail });
        } catch (error) {
          logger.error("[WORKSPACE_SECTION] Failed to create YouTube item:", error);
          toast.error(
            error instanceof Error ? error.message : "Could not create YouTube item",
          );
          return;
        }
      }
    },
    [addItem],
  );

  const handleWebsiteCreate = useCallback(
    (url: string, name: string, favicon?: string) => {
      if (!operations) return;
      try {
        operations.createItems([
          {
            type: "website",
            name,
            initialData: { url, favicon },
            initialLayout: DEFAULT_CARD_DIMENSIONS.website,
          },
        ]);
      } catch (error) {
        logger.error("[WORKSPACE_SECTION] Failed to create website item:", error);
        toast.error(
          error instanceof Error ? error.message : "Could not create item",
        );
      }
    },
    [operations],
  );

  // Handle delete request (from button or keyboard)
  const handleDeleteRequest = React.useCallback(() => {
    if (selectedCardIds.size > 0) {
      setShowDeleteDialog(true);
    }
  }, [selectedCardIds.size, setShowDeleteDialog]);

  // Handle keyboard shortcuts for deletion
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger if cards are selected
      if (selectedCardIds.size === 0) return;

      // Check for Delete or Backspace key
      if (e.key === "Delete" || e.key === "Backspace") {
        // Don't trigger if user is typing in an input, textarea, or contenteditable
        const target = e.target as HTMLElement;
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable
        ) {
          return;
        }

        e.preventDefault();
        handleDeleteRequest();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleDeleteRequest, selectedCardIds]);

  const handleWorkspaceMouseDown = (
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    const target = event.target as HTMLElement;

    // Clear native text selection when clicking anywhere in the workspace
    // (Background clicks are handled by MarqueeSelector; this fires for card clicks etc.)
    window.getSelection()?.removeAllRanges();

    // Don't blur if clicking directly on an input/textarea or button
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "BUTTON" ||
      target.closest("button") ||
      target.closest('[role="button"]')
    ) {
      return;
    }

    // Blur workspace title input if it's focused
    if (
      titleInputRef?.current &&
      document.activeElement === titleInputRef.current
    ) {
      titleInputRef.current.blur();
    }

    // Blur any active textarea (card titles) when clicking on background or card (but not on the textarea itself)
    // This ensures card titles save when clicking away, even if clicking on another card
    if (
      document.activeElement &&
      document.activeElement.tagName === "TEXTAREA"
    ) {
      const activeTextarea = document.activeElement as HTMLTextAreaElement;
      // Only blur if we're not clicking on the textarea itself
      if (activeTextarea !== target && !activeTextarea.contains(target)) {
        activeTextarea.blur();
      }
    }
  };

  // Handle bulk delete - delete all selected items in one operation
  const handleBulkDelete = () => {
    // Filter out all selected items at once using Set.has() for O(1) lookup
    const remainingItems = state.filter(
      (item) => !selectedCardIds.has(item.id),
    );
    const deletedCount = selectedCardIds.size;
    updateAllItems(remainingItems);
    setShowDeleteDialog(false);
    clearCardSelection();
    if (deletedCount > 0) {
      toast.success(
        `Deleted ${deletedCount} card${deletedCount > 1 ? "s" : ""}`,
      );
    }
  };

  // Handle move selected items to folder
  const handleMoveSelected = () => {
    if (!operations || selectedCardIdsArray.length === 0) {
      return;
    }
    setShowMoveDialog(true);
  };

  // Handle move confirmation from dialog
  const handleMoveConfirm = (itemIds: string[], folderId: string | null) => {
    if (!operations || itemIds.length === 0) {
      return;
    }
    operations.moveItemsToFolder(itemIds, folderId);
    clearCardSelection();
    setShowMoveDialog(false);
    const count = itemIds.length;
    toast.success(`Moved ${count} ${count === 1 ? "item" : "items"}`);
  };

  // Handle creating a new folder from selected cards
  const handleCreateFolderFromSelection = () => {
    if (!operations || selectedCardIdsArray.length === 0) {
      return;
    }

    // Prevent cycles: exclude active folder and its ancestors from selection
    // (e.g. when searching, user could select the active folder or a parent folder)
    const safeItemIds = filterItemIdsForFolderCreation(
      selectedCardIdsArray,
      activeFolderId,
      state,
    );

    if (safeItemIds.length === 0) {
      toast.error(
        "Cannot create folder: the current folder or its parent folders cannot be moved into a new folder. Deselect them and try again.",
      );
      return;
    }

    // Create folder with items atomically in a single event
    try {
      operations.createFolderWithItems("New Folder", safeItemIds);
    } catch (error) {
      logger.error(
        "[WORKSPACE_SECTION] Failed to create folder from selection:",
        error,
      );
      toast.error(
        error instanceof Error ? error.message : "Could not create folder",
      );
      return;
    }

    // Clear the selection
    clearCardSelection();

    // Note: FolderCard auto-focuses the title when name is "New Folder"
  };

  // Handle file upload from workspace pickers/empty states
  const handlePDFUpload = useCallback(
    async (files: File[]) => {
      if (!operations || !currentWorkspaceId) {
        throw new Error("Workspace operations not available");
      }

      const MAX_FILE_SIZE_MB = 50;
      const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
      const oversizedFiles = files.filter(
        (file) => file.size > MAX_FILE_SIZE_BYTES,
      );
      const validFiles = files.filter(
        (file) => file.size <= MAX_FILE_SIZE_BYTES,
      );

      if (oversizedFiles.length > 0) {
        toast.error(
          `The following file${oversizedFiles.length > 1 ? "s" : ""} exceed${oversizedFiles.length === 1 ? "s" : ""} the ${MAX_FILE_SIZE_MB}MB limit:\n${oversizedFiles
            .map((file) => getFileSizeLabel(file))
            .join("\n")}`,
        );
      }

      if (validFiles.length === 0) {
        return;
      }

      const { acceptedFiles: filesToUpload, protectedPdfNames } =
        await prepareWorkspaceUploadSelection(validFiles);
      if (protectedPdfNames.length > 0) {
        emitPasswordProtectedPdf(protectedPdfNames);
      }
      if (filesToUpload.length === 0) {
        return;
      }

      const uploadToastId = toast.loading(
        getDocumentUploadLoadingMessage(filesToUpload.length),
      );
      const { uploads, failedFiles } = await uploadSelectedFiles(filesToUpload);

      toast.dismiss(uploadToastId);

      if (uploads.length === 0) {
        if (failedFiles.length > 0) {
          toast.error(getDocumentUploadFailureMessage(failedFiles.length));
        }
        return;
      }

      const itemDefinitions = buildWorkspaceItemDefinitionsFromAssets(uploads, {
        imageLayout: DEFAULT_CARD_DIMENSIONS.image,
      });

      let createdIds: string[];
      try {
        createdIds = operations.createItems(itemDefinitions, {
          showSuccessToast: false,
        });
      } catch (error) {
        logger.error("[WORKSPACE_SECTION] Failed to create uploaded items:", error);
        toast.dismiss(uploadToastId);
        toast.error(
          `Could not create items: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        return;
      }
      handleCreatedItems(createdIds);

      void startAssetProcessing({
        workspaceId: currentWorkspaceId,
        assets: uploads,
        itemIds: createdIds,
        onOcrError: (error) => {
          console.error(
            "[WORKSPACE_PROCESSING] Failed to start processing:",
            error,
          );
        },
      });

      if (failedFiles.length === 0) {
        toast.success(getDocumentUploadSuccessMessage(uploads.length));
      } else {
        toast.warning(
          getDocumentUploadPartialMessage(uploads.length, failedFiles.length),
        );
      }
    },
    [currentWorkspaceId, handleCreatedItems, operations],
  );

  const {
    fileInputRef,
    inputProps: fileInputProps,
    openFilePicker,
  } = useWorkspaceFilePicker({
    onFilesSelected: handlePDFUpload,
  });

  const handleUploadMenuItemClick = useCallback(() => {
    openFilePicker();
  }, [openFilePicker]);
  const handleAudioReady = useCallback(
    async (file: File) => {
      if (!addItem) return;

      const loadingToastId = toast.loading("Uploading audio...");

      try {
        const { url: fileUrl } = await uploadFileDirect(file);

        const now = new Date();
        const dateStr = now.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year:
            now.getFullYear() !== new Date().getFullYear()
              ? "numeric"
              : undefined,
        });
        const timeStr = now.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
        const title = `${dateStr} ${timeStr} Recording`;

        const itemId = addItem("audio", title, {
          fileUrl,
          filename: file.name,
          fileSize: file.size,
          mimeType: file.type || "audio/webm",
          processingStatus: "processing",
        } as Partial<Item["data"]>);

        if (handleCreatedItems && itemId) {
          handleCreatedItems([itemId]);
        }

        toast.dismiss(loadingToastId);
        toast.success("Audio uploaded \u2014 analyzing with Gemini...");

        if (currentWorkspaceId && itemId) {
          void startAudioProcessing({
            workspaceId: currentWorkspaceId,
            itemId,
            fileUrl,
            filename: file.name,
            mimeType: file.type || "audio/webm",
          });
        }
      } catch (error: unknown) {
        toast.dismiss(loadingToastId);
        toast.error(
          error instanceof Error ? error.message : "Failed to upload audio",
        );
      }
    },
    [addItem, currentWorkspaceId, handleCreatedItems],
  );

  return (
    <div
      className="relative size-full flex flex-col"
      data-tour="workspace-canvas"
      onMouseDown={handleWorkspaceMouseDown}
    >
      <input ref={fileInputRef} {...fileInputProps} />
      {/* WorkspaceHeader is now rendered in DashboardLayout above the sidebar */}

      {/* Modal Manager - Renders over content */}
      {openItemView}

      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={scrollAreaRef}
            className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent"
          >
            <div className="relative min-h-full flex flex-col">
              {/* Show skeleton until workspace content is loaded */}
              {(!currentWorkspaceId && currentSlug) ||
              (currentWorkspaceId && isLoadingWorkspace) ? (
                // If it's taking too long or we have no workspace ID but have a slug,
                // check if we're anonymous to show login gate, or authenticated to show access denied
                !isLoadingWorkspace &&
                !loadingWorkspaces &&
                !currentWorkspaceId ? (
                  session?.user?.isAnonymous ? (
                    <LoginGate />
                  ) : (
                    <AccessDenied />
                  )
                ) : (
                  <WorkspaceSkeleton />
                )
              ) : (
                /* Workspace content - assumes workspace exists (home route handles no-workspace state) */
                <WorkspaceContent
                  key={`workspace-content-${currentWorkspaceId || "none"}`}
                  viewState={state}
                  addItem={addItem}
                  updateItem={updateItem}
                  deleteItem={deleteItem}
                  updateAllItems={updateAllItems}
                  openWorkspaceItem={openWorkspaceItem}
                  scrollContainerRef={scrollAreaRef}
                  onGridDragStateChange={setIsGridDragging}
                  workspaceName={workspaceTitle || "Workspace"}
                  workspaceIcon={workspaceIcon}
                  workspaceColor={workspaceColor}
                  onMoveItem={operations?.moveItemToFolder}
                  onMoveItems={operations?.moveItemsToFolder}
                  onDeleteFolderWithContents={
                    operations?.deleteFolderWithContents
                  }
                  onPDFUpload={handlePDFUpload}
                  onItemCreated={handleCreatedItems}
                />
              )}

              {/* Marquee selector for rectangular card selection - inside scroll container to capture all events */}
              {!isChatMaximized &&
                currentWorkspaceId &&
                !isLoadingWorkspace && (
                  <MarqueeSelector
                    scrollContainerRef={scrollAreaRef}
                    cardIds={state.map((item) => item.id)}
                    isGridDragging={isGridDragging}
                  />
                )}
            </div>
          </div>
        </ContextMenuTrigger>

        {/* Right-Click Context Menu */}
        {addItem && (
          <ContextMenuContent className="w-56">
            {renderWorkspaceMenuItems({
              callbacks: {
                onCreateDocument: () => {
                  if (addItem) {
                    const itemId = addItem("document");
                    if (handleCreatedItems && itemId) {
                      handleCreatedItems([itemId]);
                    }
                  }
                },
                onCreateFolder: () => {
                  if (addItem) addItem("folder");
                },
                onUpload: () => handleUploadMenuItemClick(),
                onAudio: () => openAudioDialog(),
                onYouTube: () => setShowYouTubeDialog(true),
                onWebsite: () => setShowWebsiteDialog(true),
                onFlashcards: () => setShowFlashcardsDialog(true),
                onQuiz: () => setShowQuizDialog(true),
              },
              MenuItem: ContextMenuItem,
              MenuSub: ContextMenuSub,
              MenuSubTrigger: ContextMenuSubTrigger,
              MenuSubContent: ContextMenuSubContent,
              MenuLabel: ContextMenuLabel,
              showUpload: !!(operations && currentWorkspaceId),
            })}
          </ContextMenuContent>
        )}
      </ContextMenu>
      {/* Selection Action Bar - show when cards are selected */}
      {state.length > 0 && !isChatMaximized && selectedCardIds.size > 0 && (
        <SelectionActionBar
          selectedCount={selectedCardIds.size}
          onClearSelection={clearCardSelection}
          onDeleteSelected={handleDeleteRequest}
          onCreateFolderFromSelection={handleCreateFolderFromSelection}
          onMoveSelected={handleMoveSelected}
        />
      )}
      {/* Move To Dialog */}
      {showMoveDialog && selectedCardIdsArray.length > 0 && (
        <MoveToDialog
          open={showMoveDialog}
          onOpenChange={setShowMoveDialog}
          items={state.filter((item) => selectedCardIdsArray.includes(item.id))}
          allItems={state}
          workspaceName={workspaceTitle || "Workspace"}
          workspaceIcon={workspaceIcon}
          workspaceColor={workspaceColor}
          onMove={() => {}} // Not used for bulk moves
          onMoveMultiple={handleMoveConfirm}
        />
      )}
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedCardIds.size === 1 ? "Card" : "Cards"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedCardIds.size === 1
                ? "Are you sure you want to delete this card? This action cannot be undone right now."
                : `Are you sure you want to delete ${selectedCardIds.size} cards? This action cannot be undone right now.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* YouTube Dialog */}
      <CreateYouTubeDialog
        open={showYouTubeDialog}
        onOpenChange={setShowYouTubeDialog}
        onCreate={handleYouTubeCreate}
      />

      {/* Website Dialog */}
      <CreateWebsiteDialog
        open={showWebsiteDialog}
        onOpenChange={setShowWebsiteDialog}
        onCreate={handleWebsiteCreate}
      />
      {/* Audio Recorder Dialog */}
      <AudioRecorderDialog
        open={showAudioDialog}
        onOpenChange={(open) => {
          if (open) openAudioDialog();
          else closeAudioDialog();
        }}
        onAudioReady={handleAudioReady}
      />
      {/* Quiz Prompt Builder Dialog */}
      <PromptBuilderDialog
        open={showQuizDialog}
        onOpenChange={setShowQuizDialog}
        action="quiz"
        items={state}
        onBeforeSubmit={() => {
          if (isDesktop && setIsChatExpanded && !isChatExpanded)
            setIsChatExpanded(true);
        }}
      />
      {/* Flashcards Prompt Builder Dialog */}
      <PromptBuilderDialog
        open={showFlashcardsDialog}
        onOpenChange={setShowFlashcardsDialog}
        action="flashcards"
        items={state}
        onBeforeSubmit={() => {
          if (isDesktop && setIsChatExpanded && !isChatExpanded)
            setIsChatExpanded(true);
        }}
      />
      {/* Floating recording indicator (visible when dialog is closed but recording is active) */}
      <AudioRecordingIndicator />
    </div>
  );
}
