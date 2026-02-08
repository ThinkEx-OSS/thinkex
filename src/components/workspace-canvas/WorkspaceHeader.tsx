"use client";

import type React from "react";
import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, X, ChevronRight, ChevronDown, FolderOpen, Plus, Upload, FileText, Folder as FolderIcon, Settings, Share2, Play, MoreHorizontal, Globe, Brain, Maximize, File, Newspaper, ImageIcon } from "lucide-react";
import { LuBook } from "react-icons/lu";
import { PiCardsThreeBold } from "react-icons/pi";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { formatKeyboardShortcut } from "@/lib/utils/keyboard-shortcut";
import WorkspaceSaveIndicator from "@/components/workspace/WorkspaceSaveIndicator";
import ChatFloatingButton from "@/components/chat/ChatFloatingButton";
import { useUIStore } from "@/lib/stores/ui-store";
import { IconRenderer } from "@/hooks/use-icon-picker";
import { useAui } from "@assistant-ui/react";
import { focusComposerInput } from "@/lib/utils/composer-utils";
import ItemHeader from "@/components/workspace-canvas/ItemHeader"; // Import ItemHeader
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
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
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
import { CreateWebsiteDialog } from "@/components/modals/CreateWebsiteDialog";
import { useQueryClient } from "@tanstack/react-query";
import { CollaboratorAvatars } from "@/components/workspace/CollaboratorAvatars";
import { UploadDialog } from "@/components/modals/UploadDialog";
import { getBestFrameForRatio } from "@/lib/workspace-state/aspect-ratios";
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
  addItem?: (type: CardType, name?: string, initialData?: Partial<Item['data']>, initialLayout?: any) => string;
  onPDFUpload?: (files: File[]) => Promise<void>;
  // Callback for when items are created (for auto-scroll/selection)
  onItemCreated?: (itemIds: string[]) => void;

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

  // Active Item Props
  activeItems?: Item[];
  activeItemMode?: 'maximized' | 'split' | null;
  onCloseActiveItem?: (itemId: string) => void;
  onMinimizeActiveItem?: (itemId: string) => void;
  onMaximizeActiveItem?: (itemId: string | null) => void;
  onUpdateActiveItem?: (itemId: string, updates: Partial<Item>) => void;
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
  onItemCreated,

  setOpenModalItemId,
  activeFolderName,
  activeFolderColor,
  items = [],
  onRenameFolder,
  onOpenSettings,
  onOpenShare,
  isItemPanelOpen = false,

  activeItems = [],
  activeItemMode = null,
  onCloseActiveItem,
  onMinimizeActiveItem,
  onMaximizeActiveItem,
  onUpdateActiveItem,
}: WorkspaceHeaderProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renamingTarget, setRenamingTarget] = useState<{ id: string, type: 'folder' | 'item' } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [showYouTubeDialog, setShowYouTubeDialog] = useState(false);
  const [showWebsiteDialog, setShowWebsiteDialog] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const isWorkspaceRoute = pathname.startsWith("/workspace");

  // Track drag hover state for breadcrumb elements
  const [hoveredBreadcrumbTarget, setHoveredBreadcrumbTarget] = useState<string | null>(null); // 'root' or folderId
  const isDraggingRef = useRef(false);
  const [ellipsisDropdownOpen, setEllipsisDropdownOpen] = useState(false);

  // Assistant API for Deep Research action
  const aui = useAui();
  const setSelectedActions = useUIStore((state) => state.setSelectedActions);

  // React Query client for cache invalidation
  const queryClient = useQueryClient();

  // Consistent breadcrumb item styling
  const breadcrumbItemClass = "flex items-center gap-1.5 min-w-0 rounded transition-colors hover:bg-sidebar-accent cursor-pointer px-2 py-1.5 -mx-2 -my-1.5";




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
    // If we have active items, close them to "navigate back" to the folder view
    if (activeItems.length > 0) {
      onMaximizeActiveItem?.(null);
      activeItems.forEach(item => onCloseActiveItem?.(item.id));

      // Ensure we are in the correct folder
      if (activeFolderId !== folderId) {
        setActiveFolderId(folderId);
      }
      return;
    }

    if (activeFolderId === folderId && onRenameFolder) {
      // Folder is already active, open rename dialog
      const folder = items.find(i => i.id === folderId && i.type === 'folder');
      if (folder) {
        setRenamingTarget({ id: folderId, type: 'folder' });
        setRenameValue(folder.name);
        setShowRenameDialog(true);
      }
    } else {
      // Navigate to folder
      setActiveFolderId(folderId);
    }
  }, [activeFolderId, items, onRenameFolder, setActiveFolderId, activeItems, onMaximizeActiveItem, onCloseActiveItem]);

  // Handle rename
  const handleRename = useCallback(() => {
    if (!renamingTarget || !renameValue.trim()) return;

    if (renamingTarget.type === 'folder' && onRenameFolder) {
      onRenameFolder(renamingTarget.id, renameValue.trim());
      toast.success('Folder renamed');
    } else if (renamingTarget.type === 'item' && onUpdateActiveItem) {
      onUpdateActiveItem(renamingTarget.id, { name: renameValue.trim() });
      toast.success('Item renamed');
    }

    setShowRenameDialog(false);
    setRenamingTarget(null);
  }, [onRenameFolder, onUpdateActiveItem, renamingTarget, renameValue]);

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

  // Listen for drag hover events on breadcrumb elements
  useEffect(() => {
    const handleDragHover = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { folderId, isHovering } = customEvent.detail || {};

      // Track drag state - if we get a hover event, dragging is active
      if (isHovering !== undefined) {
        isDraggingRef.current = isHovering;
      }

      if (isHovering) {
        // When folderId is null, it means hovering over root (breadcrumb target)
        // When folderId is a string, it means hovering over a folder (could be breadcrumb or card)
        // We need to check if it's actually a breadcrumb target by checking data attributes
        let foundTarget: string | null = null;

        if (folderId === null) {
          // Hovering over root - check if there's a root breadcrumb target
          const rootTargets = document.querySelectorAll('[data-breadcrumb-target="root"]');
          if (rootTargets.length > 0) {
            foundTarget = 'root';
          }
        } else {
          // Hovering over a folder - check if it's a breadcrumb target
          const folderTargets = document.querySelectorAll(`[data-breadcrumb-target="folder"][data-folder-id="${folderId}"]`);
          if (folderTargets.length > 0) {
            foundTarget = folderId;
          }
        }

        // Only show visual feedback if it's actually a breadcrumb target
        // (The validation in WorkspaceGrid already ensures it's a valid drop, so we can show feedback)
        setHoveredBreadcrumbTarget(foundTarget);
      } else {
        setHoveredBreadcrumbTarget(null);
      }
    };

    window.addEventListener('folder-drag-hover', handleDragHover);

    return () => {
      window.removeEventListener('folder-drag-hover', handleDragHover);
    };
  }, []);

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

  const handleYouTubeCreate = useCallback((url: string, name: string, thumbnail?: string) => {
    if (addItem) {
      addItem("youtube", name, { url, thumbnail });
    }
    setIsNewMenuOpen(false);
  }, [addItem]);

  const handleImageCreate = useCallback(async (url: string, name: string) => {
    if (!addItem) return;

    // Attempt to load image to get dimensions for adaptive layout
    let initialLayout = undefined;
    try {
      const img = new window.Image();
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

    addItem('image', name, { url, altText: name }, initialLayout);
    toast.success("Image added to workspace");
    setIsNewMenuOpen(false);
  }, [addItem]);

  // Close popover when folder path changes
  useEffect(() => {
    setEllipsisDropdownOpen(false);
  }, [folderPath]);

  return (
    <div className="relative py-2 z-20 bg-sidebar">
      {/* Main container with flex layout */}
      <div className="flex items-center justify-between w-full px-4">
        {/* Left Side: Sidebar Toggle + Navigation Arrows + Breadcrumbs */}
        <div className="flex items-center gap-2 pointer-events-auto min-w-0">
          {isWorkspaceRoute && (
            <Link
              href="/home"
              className="group flex items-center mr-2 shrink-0 rounded-md cursor-pointer"
              aria-label="ThinkEx"
            >
              <div className="relative h-6 w-6 flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
                <Image
                  src="/newlogothinkex.svg"
                  alt="ThinkEx Logo"
                  width={24}
                  height={24}
                  className="object-contain"
                  priority
                />
              </div>
            </Link>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <SidebarTrigger />
            </TooltipTrigger>
            <TooltipContent side="right">
              Toggle Sidebar <kbd className="ml-1 pointer-events-none inline-flex h-5 select-none items-center gap-1 font-mono text-sm font-medium text-muted-foreground opacity-100">{formatKeyboardShortcut('S', true)}</kbd>
            </TooltipContent>
          </Tooltip>

          {/* Breadcrumbs */}
          <nav className="flex items-center gap-1.5 text-xs text-sidebar-foreground/70 min-w-0 ml-1">
            {/* Workspace icon + name (clickable to go back to root if in a folder) */}
            {/* Workspace icon + name (clickable to go back to root if in a folder or has active items) */}
            {/* Hidden in compact mode when inside a folder/item - the logic handles this */}
            {(activeFolderId || activeItems.length > 0) && !isCompactMode ? (
              <button
                onClick={() => {
                  if (activeFolderId) clearActiveFolder();
                  if (activeItems.length > 0) {
                    onMaximizeActiveItem?.(null);
                    activeItems.forEach(item => onCloseActiveItem?.(item.id));
                  }
                }}
                data-breadcrumb-target="root"
                className={cn(
                  breadcrumbItemClass,
                  hoveredBreadcrumbTarget === 'root' && "border-2 border-blue-500 bg-blue-500/10 rounded"
                )}
              >
                <IconRenderer
                  icon={workspaceIcon}
                  className="h-4 w-4 shrink-0"
                  style={{ color: workspaceColor || undefined }}
                />
                <span className="truncate text-sidebar-foreground max-w-[300px]" title={workspaceName}>
                  {workspaceName || "Untitled"}
                </span>
              </button>
            ) : (!activeFolderId && activeItems.length === 0) ? (
              // When at root level, show dropdown menu on click
              ((onOpenSettings || onOpenShare) ? (<DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    data-breadcrumb-target="root"
                    className={cn(
                      breadcrumbItemClass,
                      hoveredBreadcrumbTarget === 'root' && "border-2 border-blue-500 bg-blue-500/10 rounded"
                    )}
                  >
                    <IconRenderer
                      icon={workspaceIcon}
                      className="h-4 w-4 shrink-0"
                      style={{ color: workspaceColor || undefined }}
                    />
                    <span className="truncate text-sidebar-foreground max-w-[300px]" title={workspaceName}>
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
              </DropdownMenu>) : (<div
                data-breadcrumb-target="root"
                className={cn(
                  "flex items-center gap-1.5 min-w-0",
                  hoveredBreadcrumbTarget === 'root' && "border-2 border-blue-500 bg-blue-500/10 rounded px-2 py-1.5 -mx-2 -my-1.5"
                )}
              >
                <IconRenderer
                  icon={workspaceIcon}
                  className="h-4 w-4 shrink-0"
                  style={{ color: workspaceColor || undefined }}
                />
                <span className="truncate text-sidebar-foreground max-w-[300px]" title={workspaceName}>
                  {workspaceName || "Untitled"}
                </span>
              </div>))
            ) : null}

            {/* Folder path breadcrumbs - compact mode shows dropdown only */}
            {folderPath.length > 0 && (
              <>
                {isCompactMode ? (
                  /* Compact mode: Show dropdown with current folder only, full path in dropdown */
                  (<>
                    <span className="text-sidebar-foreground/50 mx-1 font-bold text-sm">/</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          data-breadcrumb-target="folder"
                          data-folder-id={folderPath[folderPath.length - 1].id}
                          className={cn(
                            breadcrumbItemClass,
                            hoveredBreadcrumbTarget === folderPath[folderPath.length - 1].id && "border-2 border-blue-500 bg-blue-500/10 rounded"
                          )}
                        >
                          <FolderOpen
                            className="h-3.5 w-3.5 shrink-0"
                            style={{ color: folderPath[folderPath.length - 1].color || undefined }}
                          />
                          <span className="truncate text-sidebar-foreground max-w-[150px]" title={folderPath[folderPath.length - 1].name}>
                            {folderPath[folderPath.length - 1].name}
                          </span>
                          <ChevronDown className="h-3 w-3 text-sidebar-foreground/50" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="max-w-[200px]">
                        <DropdownMenuItem
                          onClick={clearActiveFolder}
                          data-breadcrumb-target="root"
                          className={cn(
                            "flex items-center gap-1.5 cursor-pointer",
                            hoveredBreadcrumbTarget === 'root' && "border-2 border-blue-500 bg-blue-500/10 rounded"
                          )}
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
                            data-breadcrumb-target="folder"
                            data-folder-id={folder.id}
                            className={cn(
                              "flex items-center gap-1.5 cursor-pointer",
                              hoveredBreadcrumbTarget === folder.id && "border-2 border-blue-500 bg-blue-500/10 rounded"
                            )}
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
                  </>)
                ) : folderPath.length === 1 ? (
                  folderPath.map((folder) => (
                    <span key={folder.id} className="flex items-center gap-1.5">
                      <span className="text-sidebar-foreground/50 mx-1 font-bold text-sm">/</span>
                      <button
                        onClick={() => handleFolderClick(folder.id)}
                        data-breadcrumb-target="folder"
                        data-folder-id={folder.id}
                        className={cn(
                          breadcrumbItemClass,
                          hoveredBreadcrumbTarget === folder.id && "border-2 border-blue-500 bg-blue-500/10 rounded"
                        )}
                      >
                        <FolderOpen
                          className="h-3.5 w-3.5 shrink-0"
                          style={{ color: folder.color || undefined }}
                        />
                        <span className="truncate text-sidebar-foreground max-w-[200px]" title={folder.name}>
                          {folder.name}
                        </span>
                      </button>
                    </span>
                  ))
                ) : (
                  /* Show root, dropdown with all middle folders, and last for 2+ levels */
                  (<>
                    <span className="text-sidebar-foreground/50 mx-1 font-bold text-sm">/</span>
                    <HoverCard
                      open={ellipsisDropdownOpen}
                      onOpenChange={setEllipsisDropdownOpen}
                      openDelay={0}
                      closeDelay={100}
                    >
                      <HoverCardTrigger asChild>
                        <button
                          className={cn(
                            breadcrumbItemClass,
                            "text-sidebar-foreground/70 hover:text-sidebar-foreground"
                          )}
                        >
                          <span className="truncate font-medium">...</span>
                        </button>
                      </HoverCardTrigger>
                      <HoverCardContent
                        align="start"
                        className="max-w-[200px] p-1 !animate-none data-[state=open]:!animate-none data-[state=closed]:!animate-none"
                      >
                        <div className="flex flex-col">
                          {folderPath.slice(0, -1).map((folder) => (
                            <button
                              key={folder.id}
                              onClick={() => handleFolderClick(folder.id)}
                              data-breadcrumb-target="folder"
                              data-folder-id={folder.id}
                              className={cn(
                                "flex items-center gap-1.5 cursor-pointer px-2 py-1.5 rounded-sm text-sm hover:bg-accent hover:text-accent-foreground",
                                hoveredBreadcrumbTarget === folder.id && "border-2 border-blue-500 bg-blue-500/10 rounded"
                              )}
                            >
                              <FolderOpen
                                className="h-3.5 w-3.5 shrink-0"
                                style={{ color: folder.color || undefined }}
                              />
                              <span className="truncate" title={folder.name}>
                                {folder.name}
                              </span>
                            </button>
                          ))}
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                    <span className="text-sidebar-foreground/50 mx-1 font-bold text-sm">/</span>
                    <button
                      onClick={() => handleFolderClick(folderPath[folderPath.length - 1].id)}
                      data-breadcrumb-target="folder"
                      data-folder-id={folderPath[folderPath.length - 1].id}
                      className={cn(
                        breadcrumbItemClass,
                        hoveredBreadcrumbTarget === folderPath[folderPath.length - 1].id && "border-2 border-blue-500 bg-blue-500/10 rounded"
                      )}
                    >
                      <FolderOpen
                        className="h-3.5 w-3.5 shrink-0"
                        style={{ color: folderPath[folderPath.length - 1].color || undefined }}
                      />
                      <span className="truncate text-sidebar-foreground max-w-[200px]" title={folderPath[folderPath.length - 1].name}>
                        {folderPath[folderPath.length - 1].name}
                      </span>
                    </button>
                  </>)
                )}
              </>
            )}




            {activeItems.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-sidebar-foreground/70 min-w-0">
                <span className="text-sidebar-foreground/50 mx-1 font-bold text-sm">/</span>

                {activeItems.length === 1 ? (
                  // Single Active Item (Maximized or Single Panel) - Editable
                  // Single Active Item (Maximized or Single Panel) - Click to Rename (Folder style)
                  <button
                    onClick={() => {
                      setRenamingTarget({ id: activeItems[0].id, type: 'item' });
                      setRenameValue(activeItems[0].name);
                      setShowRenameDialog(true);
                    }}
                    className={breadcrumbItemClass}
                  >
                    {/* Icon based on type */}
                    {activeItems[0].type === 'note' && <FileText className="h-3.5 w-3.5 shrink-0 text-blue-400" />}
                    {activeItems[0].type === 'pdf' && <File className="h-3.5 w-3.5 shrink-0 text-red-400" />}
                    {activeItems[0].type === 'flashcard' && <PiCardsThreeBold className="h-3.5 w-3.5 shrink-0 text-purple-400 rotate-180" />}
                    {activeItems[0].type === 'youtube' && <Play className="h-3.5 w-3.5 shrink-0 text-red-500" />}
                    {activeItems[0].type === 'quiz' && <Brain className="h-3.5 w-3.5 shrink-0 text-green-400" />}
                    {activeItems[0].type === 'image' && <ImageIcon className="h-3.5 w-3.5 shrink-0 text-emerald-500" />}
                    {activeItems[0].type === 'folder' && <FolderIcon className="h-3.5 w-3.5 shrink-0 text-amber-400" />}

                    <span className="truncate text-sidebar-foreground max-w-[300px]" title={activeItems[0].name}>
                      {activeItems[0].name}
                    </span>
                  </button>
                ) : (
                  // Multiple Active Items (Split View)
                  <span className="flex items-center gap-1 min-w-0">
                    <span className="truncate font-medium flex items-center gap-1">
                      {activeItems.map((item, idx) => (
                        <span key={item.id} className="flex items-center gap-1">
                          {idx > 0 && <span className="text-sidebar-foreground/30">|</span>}
                          <span className="truncate max-w-[200px]" title={item.name}>{item.name}</span>
                        </span>
                      ))}
                    </span>
                  </span>
                )}
              </div>
            )}
          </nav>
        </div>

        {/* Right Side: Save Indicator + Search + Chat Button */}
        {activeItemMode === 'maximized' && activeItems.length === 1 ? (
          // Maximized Mode: Show Item Controls
          <div className="flex items-center gap-2 pointer-events-auto">
            <div id="workspace-header-portal" className="flex items-center gap-2" />


            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onCloseActiveItem?.(activeItems[0].id)}
                  className="h-8 w-8 flex items-center justify-center rounded-md border border-sidebar-border text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Close</TooltipContent>
            </Tooltip>

            {setIsChatExpanded ? (
              <ChatFloatingButton
                isDesktop={isDesktop}
                isChatExpanded={isChatExpanded}
                setIsChatExpanded={setIsChatExpanded}
              />
            ) : null}
          </div>
        ) : (
          // Default Mode: Standard Workspace Controls
          <div className="flex items-center gap-2 pointer-events-auto">
            {/* Collaborator Avatars - show who's in the workspace */}
            <CollaboratorAvatars />

            {/* Share Button - hidden in compact mode */}
            {!isCompactMode && onOpenShare && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onOpenShare}
                className="h-8 px-2 text-muted-foreground hover:text-foreground font-normal relative"
              >
                Share
                <span className="ml-1.5 bg-red-600 text-white text-[9px] px-1.5 py-0.5 rounded-full font-semibold">
                  NEW
                </span>
              </Button>
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
                    data-tour="add-card-button"
                  >
                    <Plus className="h-4 w-4" />
                    {!isCompactMode && <span>New</span>}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48" sideOffset={8}>
                  <DropdownMenuItem
                    onClick={() => {
                      if (addItem) {
                        const itemId = addItem("note");
                        // Auto-navigate to the newly created note instead of opening modal
                        if (onItemCreated && itemId) {
                          onItemCreated([itemId]);
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
                      <FolderIcon className="size-4" />
                      Folder
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuItem
                    onClick={() => {
                      setShowUploadDialog(true);
                      setIsNewMenuOpen(false);
                    }}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Upload className="size-4" />
                    Upload (PDF, Image)
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => {
                      if (addItem) {
                        const itemId = addItem("flashcard");
                        if (onItemCreated && itemId) {
                          onItemCreated([itemId]);
                        }
                      }
                    }}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <PiCardsThreeBold className="size-4 text-muted-foreground rotate-180" />
                    Flashcards
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      // Open chat if closed
                      if (setIsChatExpanded && !isChatExpanded) {
                        setIsChatExpanded(true);
                      }
                      // Fill composer with quiz creation prompt
                      aui?.composer().setText("Create a quiz about ");
                      // Focus the composer input
                      focusComposerInput();
                      toast.success("Quiz creation started");
                    }}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Brain className="size-4" />
                    Quiz
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
                      setShowWebsiteDialog(true);
                      setIsNewMenuOpen(false);
                    }}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Newspaper className="size-4" />
                    Website
                  </DropdownMenuItem>
                  {/* <DropdownMenuItem
                    onClick={() => {
                      toast.success("Deep Research action selected");
                      setSelectedActions(["deep-research"]);
                      aui?.composer().setText("I want to do research on ");
                      if (setIsChatExpanded && !isChatExpanded) {
                        setIsChatExpanded(true);
                      }
                    }}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Globe className="size-4" />
                    Deep Research
                  </DropdownMenuItem> */}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {!isItemPanelOpen && setIsChatExpanded ? (
              <ChatFloatingButton
                isDesktop={isDesktop}
                isChatExpanded={isChatExpanded}
                setIsChatExpanded={setIsChatExpanded}
              />
            ) : null}
          </div>
        )}
      </div>
      {/* Rename Dialog */}
      {
        (onRenameFolder || onUpdateActiveItem) && (
          <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
            <DialogContent onClick={(e) => e.stopPropagation()}>
              <DialogHeader>
                <DialogTitle>Rename {renamingTarget?.type === 'folder' ? 'Folder' : 'Item'}</DialogTitle>
                <DialogDescription>
                  Enter a new name for this {renamingTarget?.type === 'folder' ? 'folder' : 'item'}.
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
                  placeholder={renamingTarget?.type === 'folder' ? 'Folder name' : 'Item name'}
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
      {/* Website Dialog */}
      {
        currentWorkspaceId && (
          <CreateWebsiteDialog
            open={showWebsiteDialog}
            onOpenChange={setShowWebsiteDialog}
            workspaceId={currentWorkspaceId}
            folderId={activeFolderId || undefined}
            onNoteCreated={(noteId) => {
              // Invalidate workspace events cache to trigger refetch
              void queryClient.invalidateQueries({
                queryKey: ["workspace", currentWorkspaceId, "events"],
              });
            }}
          />
        )
      }
      {/* Upload Dialog (PDF + Image) */}
      {onPDFUpload && (
        <UploadDialog
          open={showUploadDialog}
          onOpenChange={setShowUploadDialog}
          onImageCreate={handleImageCreate}
          onPDFUpload={onPDFUpload}
        />
      )}
    </div>
  );
}


