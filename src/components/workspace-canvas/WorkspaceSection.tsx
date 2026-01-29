import React, { RefObject, useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { AgentState, Item, CardType, PdfData } from "@/lib/workspace-state/types";
import type { WorkspaceOperations } from "@/hooks/workspace/use-workspace-operations";
import WorkspaceContent from "./WorkspaceContent";
import SelectionActionBar from "./SelectionActionBar";
import { WorkspaceSkeleton } from "@/components/workspace/WorkspaceSkeleton";
import { MarqueeSelector } from "./MarqueeSelector";
import { useUIStore, selectSelectedCardIdsArray } from "@/lib/stores/ui-store";
import { useShallow } from "zustand/react/shallow";

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

  // Modal
  modalManager?: React.ReactNode;

  // Workspace metadata
  workspaceTitle?: string;
  workspaceIcon?: string | null;
  workspaceColor?: string | null;
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
  modalManager,
  workspaceTitle,
  workspaceIcon,
  workspaceColor,
  operations,
  isItemPanelOpen,
}: WorkspaceSectionProps) {
  // Card selection state from UI store
  // Use array selector with shallow comparison to prevent unnecessary re-renders and SSR issues
  const selectedCardIdsArray = useUIStore(
    useShallow(selectSelectedCardIdsArray)
  );
  const selectedCardIds = useMemo(() => new Set(selectedCardIdsArray), [selectedCardIdsArray]);
  const clearCardSelection = useUIStore((state) => state.clearCardSelection);
  const openPanel = useUIStore((state) => state.openPanel);
  const setSelectedActions = useUIStore((state) => state.setSelectedActions);

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

  // Get workspace data from context
  const { workspaces } = useWorkspaceContext();
  const currentWorkspace = useMemo(() => {
    if (!currentWorkspaceId) return null;
    return workspaces.find(w => w.id === currentWorkspaceId) || null;
  }, [currentWorkspaceId, workspaces]);

  const handleYouTubeCreate = useCallback((url: string, name: string) => {
    if (addItem) {
      addItem("youtube", name, { url });
    }
  }, [addItem]);

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

  // File input ref for PDF upload from context menu
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Handle PDF upload trigger from context menu
  const triggerFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Handle PDF upload from BottomActionBar
  const handlePDFUpload = async (files: File[]) => {
    if (!operations || !currentWorkspaceId) {
      throw new Error('Workspace operations not available');
    }

    // Upload all PDFs first (reusing logic from thread.tsx)
    const uploadPromises = files.map(async (file) => {
      // Upload file to Supabase
      const formData = new FormData();
      formData.append('file', file);

      const uploadResponse = await fetch('/api/upload-file', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload PDF: ${uploadResponse.statusText}`);
      }

      const { url: fileUrl, filename } = await uploadResponse.json();

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
      operations.createItems(pdfCardDefinitions);
    }
  };


  return (
    <div
      className="relative size-full flex flex-col"
      data-tour="workspace-canvas"
      onMouseDown={handleWorkspaceMouseDown}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div ref={scrollAreaRef} className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
            {/* Hidden file input for PDF upload from context menu */}
            {operations && currentWorkspaceId && (
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                multiple
                onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length > 0) {
                    await handlePDFUpload(files);
                  }
                  // Reset input
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                }}
                className="hidden"
              />
            )}

            <div className={cn(
              "relative min-h-full flex flex-col",
              showJsonView ? "h-full" : "",
            )}>
              {/* Show skeleton when loading workspaces, resolving workspace ID, or loading workspace events */}
              {loadingWorkspaces || (!currentWorkspaceId && currentSlug) || isLoadingWorkspace ? (
                <WorkspaceSkeleton />
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
          <ContextMenuContent className="w-48">
            <ContextMenuLabel className="text-xs text-muted-foreground px-2">Create</ContextMenuLabel>
            <ContextMenuItem
              onSelect={() => {
                if (addItem) {
                  const itemId = addItem("note");
                  // Automatically open the modal for the newly created note
                  if (setOpenModalItemId && itemId) {
                    setOpenModalItemId(itemId);
                  }
                }
              }}
              className="flex items-center gap-2 cursor-pointer"
            >
              <FileText className="size-4" />
              Note
            </ContextMenuItem>

            <ContextMenuItem
              onSelect={() => {
                if (addItem) {
                  addItem("folder");
                }
              }}
              className="flex items-center gap-2 cursor-pointer"
            >
              <Folder className="size-4" />
              Folder
            </ContextMenuItem>

            {operations && currentWorkspaceId && (
              <ContextMenuItem
                onSelect={triggerFileSelect}
                className="flex items-center gap-2 cursor-pointer"
              >
                <Upload className="size-4" />
                Upload PDFs
              </ContextMenuItem>
            )}

            <ContextMenuItem
              onSelect={() => {
                if (addItem) {
                  addItem("flashcard");
                }
              }}
              className="flex items-center gap-2 cursor-pointer"
            >
              <PiCardsThreeBold className="size-4 text-muted-foreground rotate-180" />
              Flashcards
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => {
                // Open chat if closed
                if (setIsChatExpanded && !isChatExpanded && isDesktop) {
                  setIsChatExpanded(true);
                }
                // Fill composer with quiz creation prompt
                aui.composer().setText("Create a quiz about ");
                // Focus the composer input
                focusComposerInput();
                toast.success("Quiz creation started");
              }}
              className="flex items-center gap-2 cursor-pointer"
            >
              <Brain className="size-4" />
              Quiz
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => setShowYouTubeDialog(true)}
              className="flex items-center gap-2 cursor-pointer"
            >
              <Play className="size-4" />
              YouTube
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => {
                toast.success("Deep Research action selected");
                setSelectedActions(["deep-research"]);
                aui.composer().setText("I want to do research on ");
                if (setIsChatExpanded && !isChatExpanded && isDesktop) {
                  setIsChatExpanded(true);
                }
              }}
              className="flex items-center gap-2 cursor-pointer"
            >
              <Globe className="size-4" />
              Deep Research
            </ContextMenuItem>
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
      {/* Modal Manager - scoped to workspace panel only */}
      {modalManager}
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
    </div>
  );
}

