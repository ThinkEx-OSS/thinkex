import ShikiHighlighter from "react-shiki/web";
import { useMemo, useCallback, useRef, useState } from "react";
import { Plus, Copy, Check, Download, Upload } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import type { AgentState, Item, CardType } from "@/lib/workspace-state/types";
import { filterItems } from "@/lib/workspace-state/search";
import { useAutoScroll } from "@/hooks/ui/use-auto-scroll";
import { WorkspaceGrid } from "./WorkspaceGrid";
import type { LayoutItem } from "react-grid-layout";
import { useUIStore, selectSelectedCardIdsArray } from "@/lib/stores/ui-store";
import { useShallow } from "zustand/react/shallow";
import { useAui } from "@assistant-ui/react";
import { toast } from "sonner";

interface WorkspaceContentProps {
  viewState: AgentState;
  showJsonView: boolean;
  addItem: (type: CardType, name?: string, initialData?: Partial<Item['data']>) => string;
  updateItem: (itemId: string, updates: Partial<Item>) => void;
  deleteItem: (itemId: string) => void;
  updateAllItems: (items: Item[]) => void;
  getStatePreviewJSON: (s: AgentState | undefined) => Record<string, unknown>;
  searchQuery?: string;
  columns: number; // Pass columns from layout state instead of calculating here
  setOpenModalItemId: (id: string | null) => void;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  onGridDragStateChange?: (isDragging: boolean) => void;
  workspaceTitle?: string; // Add workspace title for download filename
  workspaceName?: string;
  workspaceIcon?: string | null;
  workspaceColor?: string | null;
  onMoveItem?: (itemId: string, folderId: string | null) => void; // Callback to move item to folder
  onMoveItems?: (itemIds: string[], folderId: string | null) => void; // Callback to move multiple items to folder (bulk move)
  onOpenFolder?: (folderId: string) => void; // Callback when folder is clicked
  onDeleteFolderWithContents?: (folderId: string) => void; // Callback to delete folder and all items inside
  onPDFUpload?: (files: File[]) => Promise<void>; // Function to handle PDF upload
  onItemCreated?: (itemIds: string[]) => void; // Callback for when items are created (for auto-scroll/selection)
}

export default function WorkspaceContent({
  viewState,
  showJsonView,
  addItem,
  updateItem,
  deleteItem,
  updateAllItems,
  getStatePreviewJSON,
  searchQuery = "",
  columns, // Columns now passed from parent (calculated in use-layout-state)
  setOpenModalItemId,
  scrollContainerRef: externalScrollContainerRef,
  onGridDragStateChange,
  workspaceTitle,
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
  // Use external ref if provided (from dashboard page), otherwise create local one
  const localScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = externalScrollContainerRef || localScrollContainerRef;

  // Auto-scroll during drag operations (extracted to custom hook)
  const { handleDragStart: onDragStart, handleDragStop: onDragStop } = useAutoScroll(scrollContainerRef);

  // Card selection state from UI store
  // Use array selector with shallow comparison to prevent unnecessary re-renders and SSR issues
  const selectedCardIdsArray = useUIStore(
    useShallow(selectSelectedCardIdsArray)
  );
  // OPTIMIZED: Only recreate Set if array contents actually changed
  // Create a stable string key for comparison (sorted to ensure order doesn't matter)
  const selectedCardIdsKey = useMemo(() => {
    return [...selectedCardIdsArray].sort().join(',');
  }, [selectedCardIdsArray]);
  const selectedCardIds = useMemo(() => {
    return new Set(selectedCardIdsArray);
  }, [selectedCardIdsKey]);
  const toggleCardSelection = useUIStore((state) => state.toggleCardSelection);




  // Folder filtering state from UI store
  const activeFolderId = useUIStore((state) => state.activeFolderId);
  const setActiveFolderId = useUIStore((state) => state.setActiveFolderId);

  // Copy state for JSON view
  const [isCopied, setIsCopied] = useState(false);

  // File upload for empty state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const aui = useAui();

  // Handle copy JSON to clipboard
  const handleCopyJson = useCallback(async () => {
    try {
      const jsonString = JSON.stringify(getStatePreviewJSON(viewState), null, 2);
      await navigator.clipboard.writeText(jsonString);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy JSON:', error);
    }
  }, [viewState, getStatePreviewJSON]);

  // Handle download JSON as file
  const handleDownloadJson = useCallback(() => {
    try {
      const jsonString = JSON.stringify(getStatePreviewJSON(viewState), null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      // Create filename from workspace title or fallback
      const sanitizedTitle = workspaceTitle
        ? workspaceTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()
        : 'workspace';
      const filename = `${sanitizedTitle}.json`;

      // Create and trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download JSON:', error);
    }
  }, [viewState, getStatePreviewJSON, workspaceTitle]);

  // Filter items based on search query and active folder
  const filteredItems = useMemo(() => {
    const filtered = filterItems(viewState.items, searchQuery, activeFolderId);
    return filtered;
  }, [viewState.items, searchQuery, activeFolderId]);

  // Handle opening a folder (folders are now items with type: 'folder')
  const handleOpenFolder = useCallback((folderId: string) => {
    setActiveFolderId(folderId);
    onOpenFolder?.(folderId);
  }, [setActiveFolderId, onOpenFolder]);

  // OPTIMIZED: Wrap callbacks to ensure stable references
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
    setOpenModalItemId(itemId);
  }, [setOpenModalItemId]);


  // Handle file upload click
  const handleFileUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Handle file selection
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) {
        return;
      }

      const MAX_FILES = 5;
      const MAX_FILE_SIZE_MB = 50;
      const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

      // Check file count limit
      if (files.length > MAX_FILES) {
        toast.error(`You can only upload up to ${MAX_FILES} PDFs at once. You selected ${files.length} files.`, {
          style: { color: '#fff' },
          duration: 5000,
        });
        // Reset input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        return;
      }

      // Validate file sizes
      const validFiles: File[] = [];
      const oversizedFiles: string[] = [];

      Array.from(files).forEach((file) => {
        if (file.size > MAX_FILE_SIZE_BYTES) {
          oversizedFiles.push(`${file.name} (${(file.size / (1024 * 1024)).toFixed(1)}MB)`);
        } else {
          validFiles.push(file);
        }
      });

      // Show error for oversized files
      if (oversizedFiles.length > 0) {
        toast.error(
          `The following PDF${oversizedFiles.length > 1 ? 's' : ''} exceed${oversizedFiles.length === 1 ? 's' : ''} the ${MAX_FILE_SIZE_MB}MB limit:\n${oversizedFiles.join('\n')}`,
          {
            style: { color: '#fff' },
            duration: 5000,
          }
        );
      }

      if (validFiles.length === 0) {
        // Reset input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        return;
      }

      // Use existing upload handler from parent component
      if (onPDFUpload) {
        try {
          await onPDFUpload(validFiles);
        } catch (error) {
          console.error("Failed to upload PDFs:", error);
          toast.error("Failed to upload PDFs");
        }
      } else {
        console.error("onPDFUpload handler not available");
        toast.error("PDF upload not available");
      }

      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [onPDFUpload]
  );

  // Handle drag start
  const handleDragStart = useCallback(() => {
    onDragStart();
  }, [onDragStart]);

  // Handle drag stop - save layout and notify auto-scroll hook
  const handleDragStop = useCallback((newLayout: LayoutItem[]) => {
    // Always notify auto-scroll hook to reset dragging state
    // NOTE: WorkspaceGrid.handleDragStop already handles saving the layout,
    // so we don't need to save here to avoid duplicate events
    onDragStop();
  }, [onDragStop]);

  // Check if we're in a filtered/folder view with no items
  const isFiltering = searchQuery.trim() !== '' || activeFolderId !== null;
  // Temporary filters (search) should not save layouts, but folder views should
  const isTemporaryFilter = searchQuery.trim() !== '';

  // Show empty state if no items exist at all OR if filtering yields no results (and no search query)
  // This allows users to see the "Drag and Drop" prompt when selecting a new empty folder
  if ((viewState.items ?? []).length === 0 || (isFiltering && !searchQuery && filteredItems.length === 0)) {
    return (
      <div className={showJsonView ? "h-full w-full" : "flex-1 py-4 overflow-hidden"}>
        <div className={`${selectedCardIdsArray.length > 0 ? 'pb-20' : ''} size-full workspace-grid-container px-4 sm:px-6`}>
          <EmptyState className="w-full min-w-0 max-w-full">
            <div className="mx-auto max-w-2xl w-full text-center px-4 sm:px-6 py-10 min-w-0">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileChange}
                accept="application/pdf,.pdf"
              />

              {/* Drag and Drop Prompt */}
              <div
                onClick={handleFileUploadClick}
                className="mb-8 p-8 rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 hover:border-solid hover:shadow-[inset_0_0_0_2px_hsl(var(--muted-foreground)/0.3)] hover:bg-muted/50 transition-all cursor-pointer group"
              >
                <Upload className="size-12 mx-auto mb-4 text-muted-foreground group-hover:text-primary group-hover:scale-110 transition-all duration-200" />
                <h3 className="text-base font-medium text-foreground mb-2">
                  {activeFolderId
                    ? `This folder is empty`
                    : "Drag and drop PDFs here"}
                </h3>
              </div>

              {/* Divider */}
              <div className="relative my-8">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 py-1.5 bg-muted text-muted-foreground rounded-lg">or</span>
                </div>
              </div>

              {/* Manual Note Creation */}
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Create your first item to get started</p>
                <button
                  onClick={() => {
                    const itemId = addItem("note");
                    if (itemId) {
                      toast.success("New note created");
                      if (onItemCreated) {
                        onItemCreated([itemId]);
                      }
                    }
                  }}
                  className="inline-flex items-center gap-2 px-6 py-3 text-base font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 hover:scale-105 transition-all duration-200 active:scale-95 cursor-pointer"
                >
                  <Plus className="size-5" />
                  New Note
                </button>
              </div>
            </div>
          </EmptyState>
        </div>
      </div>
    );
  }

  // Show no results message if search has no matches
  if (searchQuery && filteredItems.length === 0) {
    return (
      <div className={showJsonView ? "h-full w-full" : "flex-1 py-4 overflow-hidden"}>
        <div className={`${selectedCardIdsArray.length > 0 ? 'pb-20' : ''} size-full workspace-grid-container px-4 sm:px-6`}>
          <EmptyState className="w-full min-w-0 max-w-full">
            <div className="mx-auto max-w-lg text-center px-6 py-10">
              <h2 className="text-lg font-semibold text-foreground">No results found</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {`No items match "${searchQuery}". Try a different search term.`}
              </p>
            </div>
          </EmptyState>
        </div>
      </div>
    );
  }

  return (
    <div className={showJsonView ? "h-full w-full" : "py-4"}>
      {showJsonView ? (
        <div className="h-full w-full">
          <div className="rounded-2xl border shadow-sm bg-transparent h-full w-full overflow-y-auto overflow-x-auto max-md:text-sm">
            {/* Copy and Download buttons header */}
            <div className="sticky top-0 z-10 flex justify-between items-center p-4 pb-2 bg-background/80 backdrop-blur-sm border-b border-border/50">
              <h3 className="text-sm font-medium text-muted-foreground">Workspace JSON</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyJson}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-background hover:bg-accent transition-colors"
                >
                  {isCopied ? (
                    <>
                      <Check className="size-3" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="size-3" />
                      Copy JSON
                    </>
                  )}
                </button>
                <button
                  onClick={handleDownloadJson}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-background hover:bg-accent transition-colors"
                >
                  <Download className="size-3" />
                  Download JSON
                </button>
              </div>
            </div>
            <div className="p-4 pt-2 min-w-fit">
              <ShikiHighlighter
                language="json"
                theme="one-dark-pro"
                className="[&_pre]:!bg-transparent"
              >
                {JSON.stringify(getStatePreviewJSON(viewState), null, 2)}
              </ShikiHighlighter>
            </div>
          </div>
        </div>
      ) : (
        <WorkspaceGrid
          key={searchQuery || activeFolderId ? 'filtered' : 'all'}
          items={filteredItems}
          allItems={viewState.items}
          isFiltered={isFiltering}
          isTemporaryFilter={isTemporaryFilter}
          onDragStart={handleDragStart}
          onDragStop={handleDragStop}
          onUpdateItem={handleUpdateItem}
          onDeleteItem={handleDeleteItem}
          onUpdateAllItems={handleUpdateAllItems}
          onOpenModal={handleOpenModal}
          selectedCardIds={selectedCardIds}
          onToggleSelection={toggleCardSelection}
          onGridDragStateChange={onGridDragStateChange}
          workspaceName={workspaceName || "Workspace"}
          workspaceIcon={workspaceIcon}
          workspaceColor={workspaceColor}
          onMoveItem={onMoveItem}
          onMoveItems={onMoveItems}
          onOpenFolder={handleOpenFolder}
          onDeleteFolderWithContents={onDeleteFolderWithContents}
          addItem={addItem}
          onPDFUpload={onPDFUpload}
          setOpenModalItemId={setOpenModalItemId}
        />
      )}
    </div>
  );
}
