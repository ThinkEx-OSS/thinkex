import React, { RefObject, useState, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { AgentState, Item, CardType, PdfData } from "@/lib/workspace-state/types";
import { DEFAULT_CARD_DIMENSIONS } from "@/lib/workspace-state/grid-layout-helpers";
import type { WorkspaceOperations } from "@/hooks/workspace/use-workspace-operations";
import WorkspaceContent from "./WorkspaceContent";
import WorkspaceHeader from "@/components/workspace-canvas/WorkspaceHeader";
import SelectionActionBar from "./SelectionActionBar";
import { WorkspaceSkeleton } from "@/components/workspace/WorkspaceSkeleton";
import { MarqueeSelector } from "./MarqueeSelector";
import { useUIStore } from "@/lib/stores/ui-store";
import { useSelectedCardIds } from "@/hooks/ui/use-selected-card-ids";
import { useSession } from "@/lib/auth-client";
import { LoginGate } from "@/components/workspace/LoginGate";
import { AccessDenied } from "@/components/workspace/AccessDenied";
import { uploadFileDirect } from "@/lib/uploads/client-upload";
import { uploadPdfToStorage } from "@/lib/uploads/pdf-upload-with-ocr";
import { filterPasswordProtectedPdfs } from "@/lib/uploads/pdf-validation";
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

import { Folder, Upload, Play, MoreHorizontal, Globe, Brain } from "lucide-react";
import { LuBook } from "react-icons/lu";
import { PiCardsThreeBold } from "react-icons/pi";
import { CreateYouTubeDialog } from "@/components/modals/CreateYouTubeDialog";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import type { WorkspaceWithState } from "@/lib/workspace-state/types";
import { AudioRecordingIndicator } from "./AudioRecordingIndicator";
import { useReactiveNavigation } from "@/hooks/ui/use-reactive-navigation";
import { filterItemIdsForFolderCreation } from "@/lib/workspace-state/search";
import { renderWorkspaceMenuItems } from "./workspace-menu-items";
import { PromptBuilderDialog } from "@/components/assistant-ui/PromptBuilderDialog";
import { useAudioRecordingStore } from "@/lib/stores/audio-recording-store";
import { AudioRecorderDialog } from "@/components/modals/AudioRecorderDialog";
import { CreateWebsiteDialog } from "@/components/modals/CreateWebsiteDialog";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaceFilePicker } from "@/hooks/workspace/use-workspace-file-picker";

interface WorkspaceSectionProps {
  // Loading states
  loadingWorkspaces: boolean;
  isLoadingWorkspace: boolean;

  // Workspace state
  currentWorkspaceId: string | null;
  currentSlug: string | null;
  state: AgentState;

  // View state
  showJsonView: boolean;
  onOpenSearch?: () => void;

  // Save state
  isSaving: boolean;
  lastSavedAt: Date | null;
  hasUnsavedChanges: boolean;
  onManualSave: () => Promise<void>;

  // Operations
  addItem: (type: CardType, name?: string, initialData?: Partial<Item['data']>) => string;
  updateItem: (itemId: string, updates: Partial<Item>) => void;
  deleteItem: (itemId: string) => void;
  updateAllItems: (items: Item[]) => void;

  getStatePreviewJSON: (s: AgentState | undefined) => Record<string, unknown>;

  // Full operations object for advanced functionality
  operations?: WorkspaceOperations;

  // Layout state
  isChatMaximized: boolean;
  columns: number; // Number of grid columns (from layout state)

  // Chat state
  isDesktop?: boolean;
  isChatExpanded?: boolean;
  setIsChatExpanded?: (expanded: boolean) => void;
  isItemPanelOpen?: boolean;

  // Modal state
  setOpenModalItemId: (id: string | null) => void;

  // Version history
  onShowHistory: () => void;

  // Refs
  titleInputRef: RefObject<HTMLInputElement>;
  scrollAreaRef: RefObject<HTMLDivElement>;

  // Workspace metadata
  workspaceTitle?: string;
  workspaceIcon?: string | null;
  workspaceColor?: string | null;

  // Header Props
  onRenameFolder?: (folderId: string, newName: string) => void;
  onOpenSettings?: () => void;
  onOpenShare?: () => void;

  // Active Item Helper Props (for header to control active items)
  activeItems?: Item[];
  activeItemMode?: 'maximized' | 'maximized' | null;
  onCloseActiveItem?: (itemId: string) => void;
  onMinimizeActiveItem?: (itemId: string) => void;
  onMaximizeActiveItem?: (itemId: string | null) => void;
  onUpdateActiveItem?: (itemId: string, updates: Partial<Item>) => void;

  // Modal Manager
  modalManager?: React.ReactNode;
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
  showJsonView,
  onOpenSearch,
  isSaving,
  lastSavedAt,
  hasUnsavedChanges,
  onManualSave,
  addItem,
  updateItem,
  deleteItem,
  updateAllItems,

  getStatePreviewJSON,
  isChatMaximized,
  columns,
  isDesktop,
  isChatExpanded,
  setIsChatExpanded,
  setOpenModalItemId,
  onShowHistory,
  titleInputRef,
  scrollAreaRef,
  workspaceTitle,
  workspaceIcon,
  workspaceColor,
  operations,
  isItemPanelOpen,
  onRenameFolder,
  onOpenSettings,
  onOpenShare,

  activeItems,
  activeItemMode,
  onCloseActiveItem,
  onMinimizeActiveItem,
  onMaximizeActiveItem,
  onUpdateActiveItem,
  modalManager,
}: WorkspaceSectionProps) {
  // Card selection state from UI store
  // Use array selector with shallow comparison to prevent unnecessary re-renders and SSR issues
  const { selectedCardIdsArray, selectedCardIds } = useSelectedCardIds();
  const clearCardSelection = useUIStore((state) => state.clearCardSelection);
  const openPanel = useUIStore((state) => state.openPanel);
  const { data: session } = useSession();

  // Get active folder info from UI store
  const activeFolderId = useUIStore((uiState) => uiState.activeFolderId);

  // Get active folder name and color for breadcrumbs (folders are now items with type: 'folder')
  const activeFolderName = useMemo(() => {
    if (!activeFolderId) return undefined;
    const folder = state.items?.find(i => i.id === activeFolderId && i.type === 'folder');
    return folder?.name;
  }, [activeFolderId, state.items]);

  const activeFolderColor = useMemo(() => {
    if (!activeFolderId) return undefined;
    const folder = state.items?.find(i => i.id === activeFolderId && i.type === 'folder');
    return folder?.color;
  }, [activeFolderId, state.items]);

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

  // React Query client for cache invalidation
  const queryClient = useQueryClient();

  // Get workspace data from context
  const { workspaces } = useWorkspaceContext();
  const currentWorkspace = useMemo(() => {
    if (!currentWorkspaceId) return null;
    return workspaces.find(w => w.id === currentWorkspaceId) || null;
  }, [currentWorkspaceId, workspaces]);

  const handleYouTubeCreate = useCallback((url: string, name: string, thumbnail?: string) => {
    if (addItem) {
      addItem("youtube", name, { url, thumbnail });
    }
  }, [addItem]);

  const handleImageCreate = useCallback((url: string, name: string) => {
    if (!operations) return;

    operations.createItems([{
      type: 'image',
      name,
      initialData: { url, altText: name },
      initialLayout: DEFAULT_CARD_DIMENSIONS.image,
    }]);

    toast.success("Image added to workspace");
  }, [operations]);

  const handleWebsiteCreate = useCallback((url: string, name: string, favicon?: string) => {
    if (!operations) return;
    operations.createItems([{
      type: 'website',
      name,
      initialData: { url, favicon },
      initialLayout: DEFAULT_CARD_DIMENSIONS.website,
    }]);
  }, [operations]);

  const {
    fileInputRef,
    inputProps: fileInputProps,
    openFilePicker,
  } = useWorkspaceFilePicker({
    onImageCreate: handleImageCreate,
    onDocumentUpload: handlePDFUpload,
  });

  // Handle smart upload from context menu: try clipboard paste first, then open file picker
  const handleUploadMenuItemClick = useCallback(async () => {
    try {
      // Check for clipboard permissions/content
      const clipboardItems = await navigator.clipboard.read();
      let imageBlob: Blob | null = null;

      for (const item of clipboardItems) {
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          imageBlob = await item.getType(imageType);
          break;
        }
      }

      if (imageBlob) {
        // Found an image! Upload it directly.
        const toastId = toast.loading("Pasting image from clipboard...");

        const file = new File([imageBlob], "pasted-image.png", { type: imageBlob.type });
        const result = await uploadFileDirect(file);
        toast.dismiss(toastId);

        // Create the card using the new URL
        await handleImageCreate(result.url, "Pasted Image");
        return;
      }
    } catch (e) {
      // Fallback to file picker if clipboard access fails or no image found
      console.debug("Clipboard read failed or empty, falling back to file picker", e);
    }

    openFilePicker();
  }, [handleImageCreate, openFilePicker]);

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
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Don't trigger if user is typing in an input, textarea, or contenteditable
        const target = e.target as HTMLElement;
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable
        ) {
          return;
        }

        e.preventDefault();
        handleDeleteRequest();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDeleteRequest, selectedCardIds]);

  const handleWorkspaceMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;

    // Clear native text selection when clicking anywhere in the workspace
    // (Background clicks are handled by MarqueeSelector; this fires for card clicks etc.)
    window.getSelection()?.removeAllRanges();

    // Don't blur if clicking directly on an input/textarea or button
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('[role="button"]')
    ) {
      return;
    }

    // Blur workspace title input if it's focused
    if (titleInputRef?.current && document.activeElement === titleInputRef.current) {
      titleInputRef.current.blur();
    }

    // Blur any active textarea (card titles) when clicking on background or card (but not on the textarea itself)
    // This ensures card titles save when clicking away, even if clicking on another card
    if (document.activeElement && document.activeElement.tagName === 'TEXTAREA') {
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
    const remainingItems = state.items.filter(item => !selectedCardIds.has(item.id));
    const deletedCount = selectedCardIds.size;
    updateAllItems(remainingItems);
    setShowDeleteDialog(false);
    clearCardSelection();
    if (deletedCount > 0) {
      toast.success(`Deleted ${deletedCount} card${deletedCount > 1 ? 's' : ''}`);
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
    toast.success(`Moved ${count} ${count === 1 ? 'item' : 'items'}`);
  };

  // Handle rename folder
  const handleRenameFolder = useCallback(
    (folderId: string, newName: string) => {
      if (operations) {
        operations.updateItem(folderId, { name: newName });
      }
    },
    [operations]
  );

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
      state.items ?? []
    );

    if (safeItemIds.length === 0) {
      toast.error("Cannot create folder: the current folder or its parent folders cannot be moved into a new folder. Deselect them and try again.");
      return;
    }

    // Create folder with items atomically in a single event
    const folderId = operations.createFolderWithItems("New Folder", safeItemIds);

    // Clear the selection
    clearCardSelection();

    // Note: FolderCard auto-focuses the title when name is "New Folder"
  };

  // Handle PDF upload from BottomActionBar
  async function handlePDFUpload(files: File[]) {
    if (!operations || !currentWorkspaceId) {
      throw new Error('Workspace operations not available');
    }

    const pdfFiles = files.filter(
      (file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    );
    const officeFiles = files.filter(
      (file) => file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')
    );

    // Reject password-protected PDFs
    const { valid: unprotectedFiles, rejected: protectedNames } = await filterPasswordProtectedPdfs(pdfFiles);
    if (protectedNames.length > 0) {
      emitPasswordProtectedPdf(protectedNames);
    }
    const filesToUpload = [...unprotectedFiles, ...officeFiles];
    if (filesToUpload.length === 0) {
      return;
    }

    const uploadToastId = toast.loading(
      `Uploading ${filesToUpload.length} document${filesToUpload.length > 1 ? 's' : ''}...`
    );

    const uploadResults = await Promise.all(
      filesToUpload.map(async (file) => {
        try {
          const isPdfFile = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
          if (isPdfFile) {
            const { url, filename, fileSize } = await uploadPdfToStorage(file);
            return {
              file,
              fileUrl: url,
              filename,
              displayName: file.name,
              fileSize,
            };
          }

          const result = await uploadFileDirect(file);
          return {
            file,
            fileUrl: result.url,
            filename: result.filename,
            displayName: result.displayName,
            fileSize: file.size,
          };
        } catch (err) {
          toast.error(`Failed to upload ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
          return null;
        }
      })
    );

    toast.dismiss(uploadToastId);

    const validUploads = uploadResults.filter((r): r is NonNullable<typeof r> => r !== null);
    if (validUploads.length === 0) return;

    const pdfCardDefinitions = validUploads.map(({ fileUrl, filename, displayName, fileSize }) => ({
      type: 'pdf' as const,
      name: displayName.replace(/\.pdf$/i, ''),
      initialData: {
        fileUrl,
        filename,
        fileSize,
        ocrStatus: 'processing' as const,
        ocrPages: [],
      } as Partial<PdfData>,
    }));

    const createdIds = operations.createItems(pdfCardDefinitions);
    handleCreatedItems(createdIds);

    // Run OCR via workflow; poller dispatches pdf-processing-complete
    validUploads.forEach((r, i) => {
      const itemId = createdIds[i];
      if (!itemId) return;
      fetch("/api/pdf/ocr/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileUrl: r.fileUrl,
          itemId,
          workspaceId: currentWorkspaceId,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.runId && data.itemId) {
            import("@/lib/pdf/poll-pdf-ocr").then(({ pollPdfOcr }) =>
              pollPdfOcr(data.runId, data.itemId)
            );
          } else {
            window.dispatchEvent(
              new CustomEvent("pdf-processing-complete", {
                detail: {
                  itemId,
                  ocrPages: [],
                  ocrStatus: "failed" as const,
                  ocrError: data.error || "Failed to start OCR",
                },
              })
            );
          }
        })
        .catch((err) => {
          window.dispatchEvent(
            new CustomEvent("pdf-processing-complete", {
              detail: {
                itemId,
                ocrPages: [],
                ocrStatus: "failed" as const,
                ocrError: err.message || "Failed to start OCR",
              },
            })
          );
        });
    });
  }


  // Use reactive navigation hook for auto-scroll/selection
  const { handleCreatedItems } = useReactiveNavigation(state);

  const handleAudioReady = useCallback(async (file: File) => {
    if (!addItem) return;

    const loadingToastId = toast.loading("Uploading audio...");

    try {
      const { url: fileUrl } = await uploadFileDirect(file);

      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: now.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
      });
      const timeStr = now.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      const title = `${dateStr} ${timeStr} Recording`;

      const itemId = addItem("audio", title, {
        fileUrl,
        filename: file.name,
        fileSize: file.size,
        mimeType: file.type || "audio/webm",
        processingStatus: "processing",
      } as any);

      if (handleCreatedItems && itemId) {
        handleCreatedItems([itemId]);
      }

      toast.dismiss(loadingToastId);
      toast.success("Audio uploaded \u2014 analyzing with Gemini...");

      fetch("/api/audio/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileUrl,
          filename: file.name,
          mimeType: file.type || "audio/webm",
          itemId,
          workspaceId: currentWorkspaceId,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.runId && data.itemId) {
            import("@/lib/audio/poll-audio-processing").then(({ pollAudioProcessing }) =>
              pollAudioProcessing(data.runId, data.itemId)
            );
          } else {
            window.dispatchEvent(
              new CustomEvent("audio-processing-complete", {
                detail: { itemId, error: data.error || "Processing failed" },
              })
            );
          }
        })
        .catch((err) => {
          window.dispatchEvent(
            new CustomEvent("audio-processing-complete", {
              detail: {
                itemId,
                error: err.message || "Processing failed",
              },
            })
          );
        });
    } catch (error: any) {
      toast.dismiss(loadingToastId);
      toast.error(error.message || "Failed to upload audio");
    }
  }, [addItem, currentWorkspaceId, handleCreatedItems]);

  // Get search params for invite check
  const searchParams = useSearchParams();
  const hasInviteParam = searchParams.get('invite');

  return (
    <div
      className="relative size-full flex flex-col"
      data-tour="workspace-canvas"
      onMouseDown={handleWorkspaceMouseDown}
    >
      <input
        ref={fileInputRef}
        {...fileInputProps}
      />
      {/* WorkspaceHeader is now rendered in DashboardLayout above the sidebar */}

      {/* Modal Manager - Renders over content */}
      {modalManager}

      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div ref={scrollAreaRef} className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
            <div className={cn(
              "relative min-h-full flex flex-col",
              showJsonView ? "h-full" : "",
            )}>


              {/* Show skeleton until workspace content is loaded */}
              {(!currentWorkspaceId && currentSlug) || (currentWorkspaceId && isLoadingWorkspace) ? (
                // If it's taking too long or we have no workspace ID but have a slug,
                // check if we're anonymous to show login gate, or authenticated to show access denied
                !isLoadingWorkspace && !loadingWorkspaces && !currentWorkspaceId ? (
                  session?.user?.isAnonymous ? (
                    <LoginGate />
                  ) : hasInviteParam ? (
                    // If we have an invite query param, show skeleton instead of Access Denied
                    // This handles the race condition where workspace fetch 404s before claim completes
                    <WorkspaceSkeleton />
                  ) : (
                    <AccessDenied />
                  )
                ) : (
                  <WorkspaceSkeleton />
                )
              ) : (
                /* Workspace content - assumes workspace exists (home route handles no-workspace state) */
                (<WorkspaceContent
                  key={`workspace-content-${state.workspaceId || 'none'}`}
                  viewState={state}
                  showJsonView={showJsonView}
                  addItem={addItem}
                  updateItem={updateItem}
                  deleteItem={deleteItem}
                  updateAllItems={updateAllItems}
                  getStatePreviewJSON={getStatePreviewJSON}
                  columns={columns}
                  setOpenModalItemId={setOpenModalItemId}
                  scrollContainerRef={scrollAreaRef}
                  onGridDragStateChange={setIsGridDragging}
                  workspaceTitle={workspaceTitle}
                  workspaceName={workspaceTitle || "Workspace"}
                  workspaceIcon={workspaceIcon}
                  workspaceColor={workspaceColor}
                  onMoveItem={operations?.moveItemToFolder}
                  onMoveItems={operations?.moveItemsToFolder}
                  onDeleteFolderWithContents={operations?.deleteFolderWithContents}
                  onPDFUpload={handlePDFUpload}
                  onItemCreated={handleCreatedItems}
                />)
              )}

              {/* Marquee selector for rectangular card selection - inside scroll container to capture all events */}
              {!showJsonView && !isChatMaximized && currentWorkspaceId && !isLoadingWorkspace && (
                <MarqueeSelector
                  scrollContainerRef={scrollAreaRef}
                  cardIds={state.items.map(item => item.id)}
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
                onCreateNote: () => {
                  if (addItem) {
                    const itemId = addItem("note");
                    if (handleCreatedItems && itemId) {
                      handleCreatedItems([itemId]);
                    }
                  }
                },
                onCreateFolder: () => { if (addItem) addItem("folder"); },
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
      {(state.items ?? []).length > 0 && !isChatMaximized && selectedCardIds.size > 0 && (
        <SelectionActionBar
          selectedCount={selectedCardIds.size}
          onClearSelection={clearCardSelection}
          onDeleteSelected={handleDeleteRequest}
          onCreateFolderFromSelection={handleCreateFolderFromSelection}
          onMoveSelected={handleMoveSelected}
          isCompactMode={isItemPanelOpen && isChatExpanded}
        />
      )}
      {/* Move To Dialog */}
      {showMoveDialog && selectedCardIdsArray.length > 0 && (
        <MoveToDialog
          open={showMoveDialog}
          onOpenChange={setShowMoveDialog}
          items={state.items.filter(item => selectedCardIdsArray.includes(item.id))}
          allItems={state.items}
          workspaceName={workspaceTitle || "Workspace"}
          workspaceIcon={workspaceIcon}
          workspaceColor={workspaceColor}
          onMove={() => { }} // Not used for bulk moves
          onMoveMultiple={handleMoveConfirm}
        />
      )}
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedCardIds.size === 1 ? 'Card' : 'Cards'}</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedCardIds.size === 1
                ? 'Are you sure you want to delete this card? You can restore from version history if needed.'
                : `Are you sure you want to delete ${selectedCardIds.size} cards? You can restore from version history if needed.`
              }
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
        onOpenChange={(open) => { if (open) openAudioDialog(); else closeAudioDialog(); }}
        onAudioReady={handleAudioReady}
      />
      {/* Quiz Prompt Builder Dialog */}
      <PromptBuilderDialog
        open={showQuizDialog}
        onOpenChange={setShowQuizDialog}
        action="quiz"
        items={state.items ?? []}
        onBeforeSubmit={() => { if (isDesktop && setIsChatExpanded && !isChatExpanded) setIsChatExpanded(true); }}
      />
      {/* Flashcards Prompt Builder Dialog */}
      <PromptBuilderDialog
        open={showFlashcardsDialog}
        onOpenChange={setShowFlashcardsDialog}
        action="flashcards"
        items={state.items ?? []}
        onBeforeSubmit={() => { if (isDesktop && setIsChatExpanded && !isChatExpanded) setIsChatExpanded(true); }}
      />
      {/* Floating recording indicator (visible when dialog is closed but recording is active) */}
      <AudioRecordingIndicator />
    </div>
  );
}
