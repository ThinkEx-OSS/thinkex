import React, { RefObject, useState, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { AgentState, Item, CardType, PdfData } from "@/lib/workspace-state/types";
import type { WorkspaceOperations } from "@/hooks/workspace/use-workspace-operations";
import WorkspaceContent from "./WorkspaceContent";
import WorkspaceHeader from "@/components/workspace-canvas/WorkspaceHeader";
import SelectionActionBar from "./SelectionActionBar";
import { WorkspaceSkeleton } from "@/components/workspace/WorkspaceSkeleton";
import { MarqueeSelector } from "./MarqueeSelector";
import { useUIStore, selectSelectedCardIdsArray } from "@/lib/stores/ui-store";
import { useShallow } from "zustand/react/shallow";
import { useSession } from "@/lib/auth-client";
import { LoginGate } from "@/components/workspace/LoginGate";
import { AccessDenied } from "@/components/workspace/AccessDenied";
import { uploadFileDirect } from "@/lib/uploads/client-upload";
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

import { FileText, Folder, Upload, Play, MoreHorizontal, Globe, Brain } from "lucide-react";
import { LuBook } from "react-icons/lu";
import { PiCardsThreeBold } from "react-icons/pi";
import { CreateYouTubeDialog } from "@/components/modals/CreateYouTubeDialog";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import type { WorkspaceWithState } from "@/lib/workspace-state/types";
import { useAui } from "@assistant-ui/react";
import { focusComposerInput } from "@/lib/utils/composer-utils";
import { UploadDialog } from "@/components/modals/UploadDialog";
import { AudioRecordingIndicator } from "./AudioRecordingIndicator";
import { getBestFrameForRatio } from "@/lib/workspace-state/aspect-ratios";
import { useReactiveNavigation } from "@/hooks/ui/use-reactive-navigation";
import { renderWorkspaceMenuItems } from "./workspace-menu-items";
import { useAudioRecordingStore } from "@/lib/stores/audio-recording-store";
import { AudioRecorderDialog } from "@/components/modals/AudioRecorderDialog";
import { CreateWebsiteDialog } from "@/components/modals/CreateWebsiteDialog";
import { useQueryClient } from "@tanstack/react-query";

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
  searchQuery: string;
  onSearchChange: (query: string) => void;

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
  searchQuery,
  onSearchChange,
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
  const selectedCardIdsArray = useUIStore(
    useShallow(selectSelectedCardIdsArray)
  );
  const selectedCardIds = useMemo(() => new Set(selectedCardIdsArray), [selectedCardIdsArray]);
  const clearCardSelection = useUIStore((state) => state.clearCardSelection);
  const openPanel = useUIStore((state) => state.openPanel);
  const { data: session } = useSession();

  // Assistant API for Deep Research action
  // Note: WorkspaceSection is inside WorkspaceRuntimeProvider in DashboardLayout, so this hook works
  const aui = useAui();


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
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showWebsiteDialog, setShowWebsiteDialog] = useState(false);
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

  const handleImageCreate = useCallback(async (url: string, name: string) => {
    if (!operations) return;

    // Attempt to load image to get dimensions for adaptive layout
    let initialLayout = undefined;
    try {
      const img = new Image();
      const dimensionsPromise = new Promise<{ width: number, height: number }>((resolve, reject) => {
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = reject;
        // Handle duplicate image load
        if (img.complete) {
          resolve({ width: img.naturalWidth, height: img.naturalHeight });
        }
        img.src = url;
      });

      // Timeout after 2 seconds to avoid hanging
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject("Timeout"), 2000));

      const { width, height } = await Promise.race([dimensionsPromise, timeoutPromise]) as { width: number, height: number };
      const bestFrame = getBestFrameForRatio(width, height);
      initialLayout = { w: bestFrame.w, h: bestFrame.h };
    } catch (e) {
      console.warn("Could not detect image dimensions, using defaults", e);
    }

    operations.createItems([{
      type: 'image',
      name,
      initialData: { url, altText: name },
      initialLayout
    }]);

    toast.success("Image added to workspace");
  }, [operations]);

  // Handle smart upload from context menu: try clipboard paste first, then open dialog
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
      // Fallback to dialog if clipboard access fails or no image found
      console.debug("Clipboard read failed or empty, falling back to dialog", e);
    }

    // If no image found or error, open the upload dialog
    setShowUploadDialog(true);
  }, [handleImageCreate]);

  // Handle delete request (from button or keyboard)
  const handleDeleteRequest = () => {
    if (selectedCardIds.size > 0) {
      setShowDeleteDialog(true);
    }
  };

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
  }, [selectedCardIds]);

  const handleWorkspaceMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;

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
    clearCardSelection();
    setShowDeleteDialog(false);
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

    // Create folder with items atomically in a single event
    // This ensures the folder is created and items are moved in one operation
    const folderId = operations.createFolderWithItems("New Folder", selectedCardIdsArray);

    // Clear the selection
    clearCardSelection();

    // Note: FolderCard auto-focuses the title when name is "New Folder"
  };

  // Handle PDF upload from BottomActionBar
  const handlePDFUpload = async (files: File[]) => {
    if (!operations || !currentWorkspaceId) {
      throw new Error('Workspace operations not available');
    }

    // Reject password-protected PDFs
    const { valid: unprotectedFiles, rejected: protectedNames } = await filterPasswordProtectedPdfs(files);
    if (protectedNames.length > 0) {
      emitPasswordProtectedPdf(protectedNames);
    }
    if (unprotectedFiles.length === 0) {
      return;
    }

    // Upload all PDFs first
    const uploadPromises = unprotectedFiles.map(async (file) => {
      const { url: fileUrl, filename } = await uploadFileDirect(file);

      return {
        fileUrl,
        filename: filename || file.name,
        fileSize: file.size,
        name: file.name.replace(/\.pdf$/i, ''),
      };
    });

    const uploadResults = await Promise.all(uploadPromises);

    // Filter out any null results (files that couldn't be processed)
    const validResults = uploadResults.filter((result): result is NonNullable<typeof result> => result !== null);

    if (validResults.length > 0) {
      // Collect all PDF card data and create in a single batch event
      const pdfCardDefinitions = validResults.map((result) => {
        const pdfData: Partial<PdfData> = {
          fileUrl: result.fileUrl,
          filename: result.filename,
          fileSize: result.fileSize,
        };

        return {
          type: 'pdf' as const,
          name: result.name,
          initialData: pdfData,
        };
      });

      // Create all PDF cards atomically in a single event
      const createdIds = operations.createItems(pdfCardDefinitions);

      // Auto-navigate to first created item
      handleCreatedItems(createdIds);
    }
  };


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
        }),
      })
        .then((res) => res.json())
        .then((result) => {
          if (result.success) {
            window.dispatchEvent(
              new CustomEvent("audio-processing-complete", {
                detail: {
                  itemId,
                  summary: result.summary,
                  segments: result.segments,
                },
              })
            );
          } else {
            window.dispatchEvent(
              new CustomEvent("audio-processing-complete", {
                detail: {
                  itemId,
                  error: result.error || "Processing failed",
                },
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
  }, [addItem, handleCreatedItems]);

  // Get search params for invite check
  const searchParams = useSearchParams();
  const hasInviteParam = searchParams.get('invite');

  return (
    <div
      className="relative size-full flex flex-col"
      data-tour="workspace-canvas"
      onMouseDown={handleWorkspaceMouseDown}
    >
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
                  searchQuery={searchQuery}
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
                onFlashcards: () => {
                  if (addItem) {
                    const itemId = addItem("flashcard");
                    if (handleCreatedItems && itemId) {
                      handleCreatedItems([itemId]);
                    }
                  }
                },
                onQuiz: () => {
                  if (setIsChatExpanded && !isChatExpanded && isDesktop) {
                    setIsChatExpanded(true);
                  }
                  aui.composer().setText("Create a quiz about ");
                  focusComposerInput();
                  toast.success("Quiz creation started");
                },
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
                ? 'Are you sure you want to delete this card? This action cannot be undone.'
                : `Are you sure you want to delete ${selectedCardIds.size} cards? This action cannot be undone.`
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

      {/* Upload Dialog (PDF + Image) */}
      {operations && currentWorkspaceId && (
        <UploadDialog
          open={showUploadDialog}
          onOpenChange={setShowUploadDialog}
          onImageCreate={handleImageCreate}
          onPDFUpload={handlePDFUpload}
        />
      )}

      {/* Website Dialog */}
      {currentWorkspaceId && (
        <CreateWebsiteDialog
          open={showWebsiteDialog}
          onOpenChange={setShowWebsiteDialog}
          workspaceId={currentWorkspaceId}
          folderId={activeFolderId || undefined}
          onNoteCreated={(noteId) => {
            void queryClient.invalidateQueries({
              queryKey: ["workspace", currentWorkspaceId, "events"],
            });
          }}
        />
      )}
      {/* Audio Recorder Dialog */}
      <AudioRecorderDialog
        open={showAudioDialog}
        onOpenChange={(open) => { if (open) openAudioDialog(); else closeAudioDialog(); }}
        onAudioReady={handleAudioReady}
      />
      {/* Floating recording indicator (visible when dialog is closed but recording is active) */}
      <AudioRecordingIndicator />
    </div>
  );
}

