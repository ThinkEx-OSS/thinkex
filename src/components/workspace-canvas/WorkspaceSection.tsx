import React, { useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import type { Item } from "@/lib/workspace-state/types";
import { DEFAULT_CARD_DIMENSIONS } from "@/lib/workspace-state/grid-layout-helpers";
import type { WorkspaceOperations } from "@/hooks/workspace/use-workspace-operations";
import WorkspaceContent from "./WorkspaceContent";
import SelectionActionBar from "./SelectionActionBar";
import { WorkspaceCardsLoader } from "@/components/workspace/WorkspaceLoader";
import { MarqueeSelector } from "./MarqueeSelector";
import { useUIStore } from "@/lib/stores/ui-store";
import { useSelectedCardIds } from "@/hooks/ui/use-selected-card-ids";
import useMediaQuery from "@/hooks/ui/use-media-query";
import { LoginGate } from "@/components/workspace/LoginGate";
import { AccessDenied } from "@/components/workspace/AccessDenied";
import { useWorkspaceView } from "@/hooks/workspace/use-workspace-view";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useWorkspaceUpload } from "@/hooks/workspace/use-workspace-upload";
import { uploadFileDirect } from "@/lib/uploads/client-upload";

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
import { PromptBuilderDialog } from "@/components/chat/PromptBuilderDialog";
import { useAudioRecordingStore } from "@/lib/stores/audio-recording-store";
import { AudioRecorderDialog } from "@/components/modals/AudioRecorderDialog";
import { CreateWebsiteDialog } from "@/components/modals/CreateWebsiteDialog";
import { useWorkspaceFilePicker } from "@/hooks/workspace/use-workspace-file-picker";
import { startAudioProcessing } from "@/lib/audio/start-audio-processing";

interface WorkspaceSectionProps {
  state: Item[];
  operations: WorkspaceOperations;
  /** Full-screen open-item viewer (PDF / card shells), mounted above the grid scroll area */
  openItemView?: React.ReactNode;
}

/**
 * Workspace section component that encapsulates the main workspace area.
 * Reads workspace metadata, chat/UI state, and current workspace from
 * context/stores rather than prop-drilling.
 */
export function WorkspaceSection({
  state,
  operations,
  openItemView,
}: WorkspaceSectionProps) {
  const { currentWorkspace } = useWorkspaceContext();
  const currentWorkspaceId = currentWorkspace?.id ?? null;
  const workspaceTitle = currentWorkspace?.name;
  const workspaceIcon = currentWorkspace?.icon ?? null;
  const workspaceColor = currentWorkspace?.color ?? null;

  const isDesktop = useMediaQuery("(min-width: 768px)");
  const isChatMaximized = useUIStore((s) => s.isChatMaximized);
  const isChatExpanded = useUIStore((s) => s.isChatExpanded);
  const setIsChatExpanded = useUIStore((s) => s.setIsChatExpanded);
  const openWorkspaceItem = useUIStore((s) => s.openWorkspaceItem);

  const addItem = operations.createItem;
  const updateItem = operations.updateItem;
  const deleteItem = operations.deleteItem;
  const updateAllItems = operations.updateAllItems;

  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  const { selectedCardIdsArray, selectedCardIds } = useSelectedCardIds();
  const clearCardSelection = useUIStore((s) => s.clearCardSelection);
  const view = useWorkspaceView();

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
      addItem("youtube", name, { url, thumbnail });
    },
    [addItem],
  );

  const handleWebsiteCreate = useCallback(
    (url: string, name: string, favicon?: string) => {
      operations.createItems([
        {
          type: "website",
          name,
          initialData: { url, favicon },
          initialLayout: DEFAULT_CARD_DIMENSIONS.website,
        },
      ]);
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

    // If a button/menu trigger still owns focus after an inert workspace click,
    // blur it so the next printable key can hand off to the chat composer.
    if (
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body &&
      document.activeElement !== document.documentElement &&
      document.activeElement !== target &&
      !document.activeElement.contains(target)
    ) {
      document.activeElement.blur();
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

  const handleMoveSelected = () => {
    if (selectedCardIdsArray.length === 0) return;
    setShowMoveDialog(true);
  };

  const handleMoveConfirm = (itemIds: string[], folderId: string | null) => {
    if (itemIds.length === 0) return;
    operations.moveItemsToFolder(itemIds, folderId);
    clearCardSelection();
    setShowMoveDialog(false);
    const count = itemIds.length;
    toast.success(`Moved ${count} ${count === 1 ? "item" : "items"}`);
  };

  const handleCreateFolderFromSelection = () => {
    if (selectedCardIdsArray.length === 0) return;

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
    operations.createFolderWithItems("New Folder", safeItemIds);

    // Clear the selection
    clearCardSelection();

    // Note: FolderCard auto-focuses the title when name is "New Folder"
  };

  const handlePDFUpload = useWorkspaceUpload({
    currentWorkspaceId,
    operations,
    onItemsCreated: handleCreatedItems,
  });

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

        if (itemId) {
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
      {/* WorkspaceHeader is now rendered in WorkspaceLayout above the sidebar */}

      {/* Modal Manager - Renders over content */}
      {openItemView}

      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={scrollAreaRef}
            className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent"
          >
            <div className="relative min-h-full flex flex-col">
              {view.kind === "loading" ? (
                <WorkspaceCardsLoader />
              ) : view.kind === "unauthenticated" ? (
                <LoginGate />
              ) : view.kind === "denied" ? (
                <AccessDenied />
              ) : view.kind === "error" ? (
                <AccessDenied
                  title="Couldn't load workspace"
                  description={view.message}
                  onRetry={view.retry}
                />
              ) : (
                /* view.kind === "ready" — workspace exists, items in hand */
                <WorkspaceContent
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
                  onMoveItem={operations.moveItemToFolder}
                  onMoveItems={operations.moveItemsToFolder}
                  onDeleteFolderWithContents={
                    operations.deleteFolderWithContents
                  }
                  onPDFUpload={handlePDFUpload}
                  onItemCreated={handleCreatedItems}
                />
              )}

              {/* Marquee selector for rectangular card selection - inside scroll container to capture all events */}
              {!isChatMaximized && view.kind === "ready" && (
                <MarqueeSelector
                  scrollContainerRef={scrollAreaRef}
                  cardIds={state.map((item) => item.id)}
                  isGridDragging={isGridDragging}
                />
              )}
            </div>
          </div>
        </ContextMenuTrigger>

        {/* Mutation items only when the workspace is ready. */}
        <ContextMenuContent className="w-56">
          {view.kind === "ready" &&
            renderWorkspaceMenuItems({
              callbacks: {
                onCreateDocument: () => {
                  const itemId = addItem("document");
                  if (itemId) handleCreatedItems([itemId]);
                },
                onCreateFolder: () => {
                  addItem("folder");
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
              showUpload: !!currentWorkspaceId,
            })}
        </ContextMenuContent>
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
