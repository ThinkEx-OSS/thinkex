import type React from "react";
import { useState, useRef, useEffect, useCallback } from "react";
import { Search, X, ChevronRight, ChevronDown, FolderOpen, ChevronLeft, Plus, Upload, Layers, FileText, Folder, Settings, Share2, Play, MoreHorizontal, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { formatKeyboardShortcut } from "@/lib/utils/keyboard-shortcut";
import WorkspaceSaveIndicator from "@/components/workspace/WorkspaceSaveIndicator";
import ChatFloatingButton from "@/components/chat/ChatFloatingButton";
import { useUIStore } from "@/lib/stores/ui-store";
import { IconRenderer } from "@/hooks/use-icon-picker";
import { useAssistantApi } from "@assistant-ui/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { CardType, Item } from "@/lib/workspace-state/types";
import { getFolderPath } from "@/lib/workspace-state/search";
import { useMemo } from "react";
import { CreateYouTubeDialog } from "@/components/modals/CreateYouTubeDialog";
interface WorkspaceHeaderProps {
  titleInputRef: React.RefObject<HTMLInputElement | null>;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  // Save indicator props
  isSaving?: boolean;
  lastSavedAt?: Date | null;
  hasUnsavedChanges?: boolean;
  onManualSave?: () => void;
  currentWorkspaceId?: string | null;
  // Version control props
  onShowHistory?: () => void;
  // Chat button props
  isDesktop?: boolean;
  isChatExpanded?: boolean;
  setIsChatExpanded?: (expanded: boolean) => void;
  // Workspace info for breadcrumbs
  workspaceName?: string;
  workspaceIcon?: string | null;
  workspaceColor?: string | null;
  // New button props
  addItem?: (type: CardType, name?: string, initialData?: Partial<Item['data']>) => string;
  onPDFUpload?: (files: File[]) => Promise<void>;

  setOpenModalItemId?: (id: string | null) => void;
  // Folder props
  activeFolderName?: string;
  activeFolderColor?: string;
  items?: Item[]; // All items for building folder path
  // Rename folder function
  onRenameFolder?: (folderId: string, newName: string) => void;
  // Workspace actions
  onOpenSettings?: () => void;
  onOpenShare?: () => void;
  isItemPanelOpen?: boolean;
}

export default function WorkspaceHeader({
  titleInputRef,
  searchQuery,
  onSearchChange,
  isSaving,
  lastSavedAt,
  hasUnsavedChanges,
  onManualSave,
  currentWorkspaceId,
  onShowHistory,
  isDesktop = true,
  isChatExpanded = false,
  setIsChatExpanded,
  workspaceName,
  workspaceIcon,
  workspaceColor,
  addItem,
  onPDFUpload,

  setOpenModalItemId,
  activeFolderName,
  activeFolderColor,
  items = [],
  onRenameFolder,
  onOpenSettings,
  onOpenShare,
  isItemPanelOpen = false,
}: WorkspaceHeaderProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameFolderId, setRenameFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [showYouTubeDialog, setShowYouTubeDialog] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Assistant API for Deep Research action
  const api = useAssistantApi();
  const setSelectedActions = useUIStore((state) => state.setSelectedActions);




  // Get active folder from UI store
  const activeFolderId = useUIStore((state) => state.activeFolderId);
  const setActiveFolderId = useUIStore((state) => state.setActiveFolderId);
  const clearActiveFolder = useUIStore((state) => state.clearActiveFolder);

  // Build folder path for breadcrumbs
  const folderPath = useMemo(() => {
    if (!activeFolderId || !items.length) return [];
    return getFolderPath(activeFolderId, items);
  }, [activeFolderId, items]);

  // Compact mode when space is tight (item panel open + chat expanded)
  const isCompactMode = isItemPanelOpen && isChatExpanded;

  // Handle folder click - navigate or rename if already active
  const handleFolderClick = useCallback((folderId: string) => {
    if (activeFolderId === folderId && onRenameFolder) {
      // Folder is already active, open rename dialog
      const folder = items.find(i => i.id === folderId && i.type === 'folder');
      if (folder) {
        setRenameFolderId(folderId);
        setRenameValue(folder.name);
        setShowRenameDialog(true);
      }
    } else {
      // Navigate to folder
      setActiveFolderId(folderId);
    }
  }, [activeFolderId, items, onRenameFolder, setActiveFolderId]);

  // Handle rename
  const handleRename = useCallback(() => {
    if (onRenameFolder && renameFolderId && renameValue.trim()) {
      onRenameFolder(renameFolderId, renameValue.trim());
      setShowRenameDialog(false);
      setRenameFolderId(null);
      toast.success('Folder renamed');
    }
  }, [onRenameFolder, renameFolderId, renameValue]);

  // Auto-focus and select all text when dialog opens
  useEffect(() => {
    if (showRenameDialog && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [showRenameDialog]);

  // Auto-focus search input when expanded
  useEffect(() => {
    if (isSearchExpanded && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchExpanded]);

  // Handle keyboard shortcut Cmd/Ctrl+K to expand search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K / Ctrl+K - Expand and focus search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchExpanded(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Handle search input blur - collapse if empty
  const handleSearchBlur = () => {
    setIsFocused(false);
    if (!searchQuery) {
      setIsSearchExpanded(false);
    }
  };

  // Handle search icon click
  const handleSearchIconClick = () => {
    setIsSearchExpanded(true);
  };

  // Navigation history
  const folderHistoryBack = useUIStore((state) => state.folderHistoryBack);
  const folderHistoryForward = useUIStore((state) => state.folderHistoryForward);
  const navigateFolderBack = useUIStore((state) => state.navigateFolderBack);
  const navigateFolderForward = useUIStore((state) => state.navigateFolderForward);

  const canNavigateBack = folderHistoryBack.length > 0;
  const canNavigateForward = folderHistoryForward !== null;

  // Handle PDF upload
  const handlePDFUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    // Filter for PDF files only
    const pdfFiles = files.filter(file =>
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    );

    if (pdfFiles.length === 0) {
      toast.error('Please select PDF files only');
      return;
    }

    if (pdfFiles.length !== files.length) {
      toast.error('Some files were skipped - only PDF files are supported');
    }

    // Check individual file size limit (10MB per file)
    const maxIndividualSize = 10 * 1024 * 1024; // 10MB
    const oversizedFiles = pdfFiles.filter(file => file.size > maxIndividualSize);
    if (oversizedFiles.length > 0) {
      toast.error(`${oversizedFiles.length} file(s) exceed the 10MB individual limit`);
      return;
    }

    // Check combined size limit (100MB total)
    const totalSize = pdfFiles.reduce((sum, file) => sum + file.size, 0);
    const maxCombinedSize = 100 * 1024 * 1024; // 100MB
    if (totalSize > maxCombinedSize) {
      const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(1);
      toast.error(`Total file size (${totalSizeMB}MB) exceeds the 100MB combined limit`);
      return;
    }

    setIsUploading(true);
    try {
      if (onPDFUpload) {
        await onPDFUpload(pdfFiles);
        toast.success(`${pdfFiles.length} PDF${pdfFiles.length > 1 ? 's' : ''} uploaded successfully`);
      }
    } catch (error) {
      console.error('Error uploading PDFs:', error);
      toast.error('Failed to upload PDF files');
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleYouTubeCreate = useCallback((url: string, name: string) => {
    if (addItem) {
      addItem("youtube", name, { url });
    }
    setIsNewMenuOpen(false);
  }, [addItem]);

  return (
    <div className="relative py-2 z-20 bg-sidebar">
      {/* Main container with flex layout */}
      <div className="flex items-center justify-between w-full px-3">
        {/* Left Side: Sidebar Toggle + Navigation Arrows + Breadcrumbs */}
        <div className="flex items-center gap-2 pointer-events-auto min-w-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <SidebarTrigger />
            </TooltipTrigger>
            <TooltipContent side="right">
              Toggle Sidebar <kbd className="ml-1 pointer-events-none inline-flex h-5 select-none items-center gap-1 font-mono text-sm font-medium text-muted-foreground opacity-100">{formatKeyboardShortcut('S', true)}</kbd>
            </TooltipContent>
          </Tooltip>

          {/* Navigation Arrows */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={navigateFolderBack}
              disabled={!canNavigateBack}
              className={cn(
                "h-7 w-6 flex items-center justify-center rounded-md transition-colors",
                canNavigateBack
                  ? "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent cursor-pointer"
                  : "text-sidebar-foreground/30 cursor-not-allowed"
              )}
              aria-label="Navigate back"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={navigateFolderForward}
              disabled={!canNavigateForward}
              className={cn(
                "h-7 w-6 flex items-center justify-center rounded-md transition-colors",
                canNavigateForward
                  ? "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent cursor-pointer"
                  : "text-sidebar-foreground/30 cursor-not-allowed"
              )}
              aria-label="Navigate forward"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Breadcrumbs */}
          <nav className="flex items-center gap-1.5 text-sm text-sidebar-foreground/70 min-w-0">
            {/* Workspace icon + name (clickable to go back to root if in a folder) */}
            {/* Hidden in compact mode when inside a folder - the folder dropdown has workspace option */}
            {activeFolderId && !isCompactMode ? (
              <button
                onClick={clearActiveFolder}
                className="flex items-center gap-1.5 min-w-0 rounded transition-colors hover:bg-sidebar-accent cursor-pointer px-1 py-0.5 -mx-1 -my-0.5"
              >
                <IconRenderer
                  icon={workspaceIcon}
                  className="h-4 w-4 shrink-0"
                  style={{ color: workspaceColor || undefined }}
                />
                <span className="truncate text-sidebar-foreground font-medium max-w-[200px]" title={workspaceName}>
                  {workspaceName || "Untitled"}
                </span>
              </button>
            ) : !activeFolderId ? (
              // When at root level, show dropdown menu on click
              (onOpenSettings || onOpenShare) ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-1.5 min-w-0 rounded transition-colors hover:bg-sidebar-accent cursor-pointer px-1 py-0.5 -mx-1 -my-0.5">
                      <IconRenderer
                        icon={workspaceIcon}
                        className="h-4 w-4 shrink-0"
                        style={{ color: workspaceColor || undefined }}
                      />
                      <span className="truncate text-sidebar-foreground font-medium max-w-[200px]" title={workspaceName}>
                        {workspaceName || "Untitled"}
                      </span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    {onOpenSettings && (
                      <DropdownMenuItem
                        onClick={onOpenSettings}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <Settings className="h-4 w-4" />
                        Settings
                      </DropdownMenuItem>
                    )}
                    {onOpenShare && (
                      <DropdownMenuItem
                        onClick={onOpenShare}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <Share2 className="h-4 w-4" />
                        Share
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <div className="flex items-center gap-1.5 min-w-0">
                  <IconRenderer
                    icon={workspaceIcon}
                    className="h-4 w-4 shrink-0"
                    style={{ color: workspaceColor || undefined }}
                  />
                  <span className="truncate text-sidebar-foreground font-medium max-w-[200px]" title={workspaceName}>
                    {workspaceName || "Untitled"}
                  </span>
                </div>
              )
            ) : null}

            {/* Folder path breadcrumbs - compact mode shows dropdown only */}
            {folderPath.length > 0 && (
              <>
                {isCompactMode ? (
                  /* Compact mode: Show dropdown with current folder only, full path in dropdown */
                  <>
                    <span className="text-sidebar-foreground/50 mx-1 font-bold">/</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="flex items-center gap-1.5 min-w-0 rounded transition-colors hover:bg-sidebar-accent cursor-pointer px-1 py-0.5 -mx-1 -my-0.5">
                          <FolderOpen
                            className="h-3.5 w-3.5 shrink-0"
                            style={{ color: folderPath[folderPath.length - 1].color || undefined }}
                          />
                          <span className="truncate text-sidebar-foreground font-medium max-w-[80px]" title={folderPath[folderPath.length - 1].name}>
                            {folderPath[folderPath.length - 1].name}
                          </span>
                          <ChevronDown className="h-3 w-3 text-sidebar-foreground/50" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="max-w-[200px]">
                        <DropdownMenuItem
                          onClick={clearActiveFolder}
                          className="flex items-center gap-1.5 cursor-pointer"
                        >
                          <IconRenderer
                            icon={workspaceIcon}
                            className="h-3.5 w-3.5 shrink-0"
                            style={{ color: workspaceColor || undefined }}
                          />
                          <span className="truncate" title={workspaceName}>
                            {workspaceName || "Workspace"}
                          </span>
                        </DropdownMenuItem>
                        {folderPath.map((folder) => (
                          <DropdownMenuItem
                            key={folder.id}
                            onClick={() => handleFolderClick(folder.id)}
                            className="flex items-center gap-1.5 cursor-pointer"
                          >
                            <FolderOpen
                              className="h-3.5 w-3.5 shrink-0"
                              style={{ color: folder.color || undefined }}
                            />
                            <span className="truncate" title={folder.name}>
                              {folder.name}
                            </span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                ) : folderPath.length === 1 ? (
                  folderPath.map((folder) => (
                    <span key={folder.id} className="flex items-center gap-1.5">
                      <span className="text-sidebar-foreground/50 mx-1 font-bold">/</span>
                      <button
                        onClick={() => handleFolderClick(folder.id)}
                        className="flex items-center gap-1.5 min-w-0 rounded transition-colors hover:bg-sidebar-accent cursor-pointer px-1 py-0.5 -mx-1 -my-0.5"
                      >
                        <FolderOpen
                          className="h-3.5 w-3.5 shrink-0"
                          style={{ color: folder.color || undefined }}
                        />
                        <span className="truncate text-sidebar-foreground font-medium max-w-[120px]" title={folder.name}>
                          {folder.name}
                        </span>
                      </button>
                    </span>
                  ))
                ) : (
                  /* Show root, dropdown with all middle folders, and last for 2+ levels */
                  <>
                    <span className="text-sidebar-foreground/50 mx-1 font-bold">/</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="flex items-center gap-1 min-w-0 rounded transition-colors hover:bg-sidebar-accent cursor-pointer px-1 py-0.5 -mx-1 -my-0.5 text-sidebar-foreground/70 hover:text-sidebar-foreground">
                          <span className="truncate font-medium">...</span>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="max-w-[200px]">
                        {folderPath.slice(0, -1).map((folder) => (
                          <DropdownMenuItem
                            key={folder.id}
                            onClick={() => handleFolderClick(folder.id)}
                            className="flex items-center gap-1.5 cursor-pointer"
                          >
                            <FolderOpen
                              className="h-3.5 w-3.5 shrink-0"
                              style={{ color: folder.color || undefined }}
                            />
                            <span className="truncate" title={folder.name}>
                              {folder.name}
                            </span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <span className="text-sidebar-foreground/50 mx-1 font-bold">/</span>
                    <button
                      onClick={() => handleFolderClick(folderPath[folderPath.length - 1].id)}
                      className="flex items-center gap-1.5 min-w-0 rounded transition-colors hover:bg-sidebar-accent cursor-pointer px-1 py-0.5 -mx-1 -my-0.5"
                    >
                      <FolderOpen
                        className="h-3.5 w-3.5 shrink-0"
                        style={{ color: folderPath[folderPath.length - 1].color || undefined }}
                      />
                      <span className="truncate text-sidebar-foreground font-medium max-w-[120px]" title={folderPath[folderPath.length - 1].name}>
                        {folderPath[folderPath.length - 1].name}
                      </span>
                    </button>
                  </>
                )}
              </>
            )}


          </nav>
        </div>

        {/* Right Side: Save Indicator + Search + Chat Button */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Save Indicator - hidden in compact mode */}
          {!isCompactMode && (
            <WorkspaceSaveIndicator
              isSaving={isSaving || false}
              lastSavedAt={lastSavedAt || null}
              hasUnsavedChanges={hasUnsavedChanges}
              onManualSave={onManualSave}
              currentWorkspaceId={currentWorkspaceId}
              onShowHistory={onShowHistory}
            />
          )}

          {/* Search Input */}
          {isSearchExpanded ? (
            <div className="relative w-24" data-tour="search-bar">
              <Search
                className={cn(
                  "absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors duration-200 pointer-events-none z-10",
                  isFocused ? "text-sidebar-foreground" : "text-sidebar-foreground/70"
                )}
              />
              <input
                ref={(node) => {
                  searchInputRef.current = node;
                  if (titleInputRef) {
                    (titleInputRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
                  }
                }}
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  onSearchChange(e.target.value);
                }}
                onFocus={() => setIsFocused(true)}
                onBlur={handleSearchBlur}
                placeholder="Search..."
                className={cn(
                  "w-full h-8 pl-9 outline-none rounded-md text-sm pointer-events-auto box-border",
                  searchQuery ? "pr-8" : "pr-3",
                  "border border-sidebar-border text-sidebar-foreground/70 placeholder:text-sidebar-foreground/50 transition-colors",
                  isFocused
                    ? "text-sidebar-foreground bg-sidebar-accent"
                    : "hover:text-sidebar-foreground hover:bg-sidebar-accent"
                )}
              />
              {/* Clear button - only show when there's text */}
              {searchQuery && (
                <button
                  onClick={() => {
                    onSearchChange('');
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:scale-110 transition-all duration-200 pointer-events-auto z-10 cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleSearchIconClick}
                  className={cn(
                    "h-8 w-8 flex items-center justify-center rounded-md transition-colors pointer-events-auto cursor-pointer",
                    "border border-sidebar-border text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent"
                  )}
                  data-tour="search-bar"
                  aria-label="Search workspace"
                >
                  <Search className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Search workspace <kbd className="ml-1 pointer-events-none inline-flex h-5 select-none items-center gap-1 font-mono text-sm font-medium text-muted-foreground opacity-100">{formatKeyboardShortcut('K')}</kbd>
              </TooltipContent>
            </Tooltip>
          )}

          {/* New Button */}
          {addItem && (
            <DropdownMenu open={isNewMenuOpen} onOpenChange={setIsNewMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "h-8 outline-none rounded-md text-sm pointer-events-auto whitespace-nowrap relative cursor-pointer box-border",
                    "border border-sidebar-border text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors",
                    isCompactMode
                      ? "w-8 flex items-center justify-center px-0"
                      : "inline-flex items-center gap-2 px-2",
                    isNewMenuOpen && "text-sidebar-foreground bg-sidebar-accent"
                  )}
                  disabled={isUploading}
                  data-tour="add-card-button"
                >
                  <Plus className="h-4 w-4" />
                  {!isCompactMode && <span>Create</span>}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48" sideOffset={8}>
                <DropdownMenuItem
                  onClick={() => {
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
                </DropdownMenuItem>

                {addItem && (
                  <DropdownMenuItem
                    onClick={() => {
                      if (addItem) {
                        addItem("folder");
                      }
                    }}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Folder className="size-4" />
                    Folder
                  </DropdownMenuItem>
                )}

                <DropdownMenuItem
                  onClick={() => {
                    triggerFileSelect();
                  }}
                  disabled={isUploading}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Upload className="size-4" />
                  {isUploading ? 'Uploading...' : 'Upload PDFs'}
                </DropdownMenuItem>

                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="flex items-center gap-2 cursor-pointer">
                    <MoreHorizontal className="size-4" />
                    Other
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem
                      onClick={() => {
                        if (addItem) {
                          addItem("flashcard");
                        }
                      }}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <Layers className="size-4" />
                      Flashcards
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setShowYouTubeDialog(true);
                      }}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <Play className="size-4" />
                      YouTube
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        toast.success("Deep Research action selected");
                        setSelectedActions(["deep-research"]);
                        api?.composer().setText("I want to do research on ");
                        if (setIsChatExpanded && !isChatExpanded) {
                          setIsChatExpanded(true);
                        }
                      }}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <Globe className="size-4" />
                      Deep Research
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Hidden file input for PDF upload */}
          {onPDFUpload && (
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              multiple
              onChange={handlePDFUpload}
              className="hidden"
            />
          )}

          {!isItemPanelOpen && setIsChatExpanded ? (
            <ChatFloatingButton
              isDesktop={isDesktop}
              isChatExpanded={isChatExpanded}
              setIsChatExpanded={setIsChatExpanded}
            />
          ) : null}
        </div>
      </div>

      {/* Rename Folder Dialog */}
      {
        onRenameFolder && (
          <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
            <DialogContent onClick={(e) => e.stopPropagation()}>
              <DialogHeader>
                <DialogTitle>Rename Folder</DialogTitle>
                <DialogDescription>
                  Enter a new name for this folder.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Input
                  ref={renameInputRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && renameValue.trim()) {
                      handleRename();
                    } else if (e.key === 'Escape') {
                      setShowRenameDialog(false);
                    }
                  }}
                  placeholder="Folder name"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowRenameDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleRename} disabled={!renameValue.trim()}>
                  Rename
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )
      }

      {/* YouTube Dialog */}
      <CreateYouTubeDialog
        open={showYouTubeDialog}
        onOpenChange={setShowYouTubeDialog}
        onCreate={handleYouTubeCreate}
      />
    </div >
  );
}



