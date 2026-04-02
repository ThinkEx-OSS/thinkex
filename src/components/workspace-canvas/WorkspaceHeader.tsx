"use client";

import type React from "react";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, X, ChevronDown, ChevronRight, FolderOpen, Plus, Settings, Share2, PanelRight, Loader2, ExternalLink } from "lucide-react";
import { LuCalendar, LuPanelLeftOpen } from "react-icons/lu";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThinkExLogo } from "@/components/ui/thinkex-logo";

import { formatKeyboardShortcut } from "@/lib/utils/keyboard-shortcut";
import ChatFloatingButton from "@/components/chat/ChatFloatingButton";
import { WorkspaceItemTypeIcon } from "@/components/workspace/WorkspaceItemTypeIcon";
import { useUIStore } from "@/lib/stores/ui-store";
import { IconRenderer } from "@/hooks/use-icon-picker";
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
import type { CardType, DocumentData, Item } from "@/lib/workspace-state/types";
import {
  exportMarkdownToGoogleDoc,
  getGoogleOAuthClientId,
} from "@/lib/exportToGoogleDocs";
import { DEFAULT_CARD_DIMENSIONS } from "@/lib/workspace-state/grid-layout-helpers";
import { getFolderPath } from "@/lib/workspace-state/search";
import { CreateYouTubeDialog } from "@/components/modals/CreateYouTubeDialog";
import { CreateWebsiteDialog } from "@/components/modals/CreateWebsiteDialog";
import { CollaboratorAvatars } from "@/components/workspace/CollaboratorAvatars";
import { AudioRecorderDialog } from "@/components/modals/AudioRecorderDialog";
import { useAudioRecordingStore } from "@/lib/stores/audio-recording-store";
import { renderWorkspaceMenuItems } from "./workspace-menu-items";
import { PromptBuilderDialog } from "@/components/assistant-ui/PromptBuilderDialog";
const EMPTY_ITEMS: Item[] = [];

function GoogleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      {...props}
    >
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917" />
      <path fill="#FF3D00" d="m6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.9 11.9 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917" />
    </svg>
  );
}
import { useWorkspaceFilePicker } from "@/hooks/workspace/use-workspace-file-picker";
import { startAudioProcessing } from "@/lib/audio/start-audio-processing";

interface WorkspaceHeaderProps {
  titleInputRef: React.RefObject<HTMLInputElement | null>;
  onOpenSearch?: () => void;
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
  onNavigateToRoot?: () => void;
  onNavigateToFolder?: (folderId: string) => void;
  onMinimizeActiveItem?: () => void;
  onMaximizeActiveItem?: (itemId: string | null) => void;
  onUpdateActiveItem?: (itemId: string, updates: Partial<Item>) => void;
  /** Flush pending saves and read latest document markdown from workspace cache (avoids stale export). */
  getDocumentMarkdownForExport?: (itemId: string) => string;
  googleLoginHint?: string | null;
}



export function WorkspaceHeader({
  titleInputRef,
  onOpenSearch,
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
  items = EMPTY_ITEMS,
  onRenameFolder,
  onOpenSettings,
  onOpenShare,
  isItemPanelOpen = false,

  activeItems = EMPTY_ITEMS,
  activeItemMode = null,
  onCloseActiveItem,
  onNavigateToRoot,
  onNavigateToFolder,
  onMinimizeActiveItem,
  onMaximizeActiveItem,
  onUpdateActiveItem,
  getDocumentMarkdownForExport,
  googleLoginHint,
}: WorkspaceHeaderProps) {
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renamingTarget, setRenamingTarget] = useState<{ id: string, type: 'folder' | 'item' } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [showYouTubeDialog, setShowYouTubeDialog] = useState(false);
  const [showWebsiteDialog, setShowWebsiteDialog] = useState(false);
  const [showQuizDialog, setShowQuizDialog] = useState(false);
  const [showFlashcardsDialog, setShowFlashcardsDialog] = useState(false);
  const [googleExportLoading, setGoogleExportLoading] = useState(false);
  const [showExportFallbackDialog, setShowExportFallbackDialog] = useState(false);
  const [blockedExportUrl, setBlockedExportUrl] = useState<string | null>(null);
  const showAudioDialog = useAudioRecordingStore((s) => s.isDialogOpen);
  const openAudioDialog = useAudioRecordingStore((s) => s.openDialog);
  const closeAudioDialog = useAudioRecordingStore((s) => s.closeDialog);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const isWorkspaceRoute = pathname.startsWith("/workspace");

  // Track drag hover state for breadcrumb elements
  const [hoveredBreadcrumbTarget, setHoveredBreadcrumbTarget] = useState<string | null>(null); // 'root' or folderId
  const isDraggingRef = useRef(false);
  const [ellipsisDropdownOpen, setEllipsisDropdownOpen] = useState(false);

  // Consistent breadcrumb item styling
  const breadcrumbItemClass = "flex items-center gap-1.5 min-w-0 rounded transition-colors hover:bg-accent cursor-pointer px-2 py-1.5 -mx-2 -my-1.5";




  // Get active folder from UI store
  const activeFolderId = useUIStore((state) => state.activeFolderId);
  const openPanel = useUIStore((state) => state.openPanel);
  const viewMode = useUIStore((state) => state.viewMode);

  // Build folder path for breadcrumbs
  const folderPath = useMemo(() => {
    if (!activeFolderId || !items.length) return [];
    return getFolderPath(activeFolderId, items);
  }, [activeFolderId, items]);

  // Compact mode when space is tight (item panel open + chat expanded)
  const isCompactMode = isItemPanelOpen && isChatExpanded;

  // Handle folder click - switch folder or rename if already active (and no panel open)
  const handleFolderClick = useCallback((folderId: string) => {
    // If panel is open, delegate to parent (closes if focused, else just switches folder) — don't open rename
    if (activeItems.length > 0) {
      onNavigateToFolder?.(folderId);
      return;
    }
    if (activeFolderId === folderId && onRenameFolder) {
      // Folder is already active and no panel — open rename dialog
      const folder = items.find(i => i.id === folderId && i.type === 'folder');
      if (folder) {
        setRenamingTarget({ id: folderId, type: 'folder' });
        setRenameValue(folder.name);
        setShowRenameDialog(true);
      }
    } else {
      onNavigateToFolder?.(folderId);
    }
  }, [activeFolderId, activeItems.length, items, onRenameFolder, onNavigateToFolder]);

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

  const handleYouTubeCreate = useCallback((url: string, name: string, thumbnail?: string) => {
    if (addItem) {
      addItem("youtube", name, { url, thumbnail });
    }
    setIsNewMenuOpen(false);
  }, [addItem]);

  const handleAudioReady = useCallback(async (file: File) => {
    if (!addItem) return;

    // Import uploadFileDirect dynamically to avoid top-level client import issues
    const { uploadFileDirect } = await import("@/lib/uploads/client-upload");

    const loadingToastId = toast.loading("Uploading audio...");

    try {
      // Upload the audio file to storage
      const { url: fileUrl } = await uploadFileDirect(file);

      // Create the audio card immediately (shows "processing" state)
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

      if (onItemCreated && itemId) {
        onItemCreated([itemId]);
      }

      toast.dismiss(loadingToastId);
      toast.success("Audio uploaded — analyzing with Gemini...");

      if (currentWorkspaceId && itemId) {
        void startAudioProcessing({
          workspaceId: currentWorkspaceId,
          itemId,
          fileUrl,
          filename: file.name,
          mimeType: file.type || "audio/webm",
        }).catch((processingError) => {
          console.error("[WORKSPACE_HEADER] Failed to start audio processing:", processingError);
        });
      }
    } catch (error: any) {
      toast.dismiss(loadingToastId);
      toast.error(error.message || "Failed to upload audio");
    }
  }, [addItem, currentWorkspaceId, onItemCreated]);

  const handleWebsiteCreate = useCallback((url: string, name: string, favicon?: string) => {
    if (!addItem) return;
    addItem("website", name, { url, favicon }, DEFAULT_CARD_DIMENSIONS.website);
    setIsNewMenuOpen(false);
  }, [addItem]);

  const {
    fileInputRef,
    inputProps: fileInputProps,
    openFilePicker,
  } = useWorkspaceFilePicker({
    onFilesSelected: onPDFUpload,
  });

  const handleUploadPickerOpen = useCallback(() => {
    openFilePicker();
    setIsNewMenuOpen(false);
  }, [openFilePicker]);

  // Close popover when folder path changes
  useEffect(() => {
    setEllipsisDropdownOpen(false);
  }, [folderPath]);

  return (
    <div className="relative py-2 z-20 bg-sidebar">
      <input
        ref={fileInputRef}
        {...fileInputProps}
      />
      {/* Main container with flex layout */}
      <div className="flex items-center justify-between w-full px-3">
        {/* Left Side: Sidebar Toggle + Navigation Arrows + Breadcrumbs */}
        <div className="flex items-center gap-2 pointer-events-auto min-w-0">
          {isWorkspaceRoute && (
            <Link
              href="/home"
              className="group flex items-center mr-1 shrink-0 rounded-md cursor-pointer"
              aria-label="ThinkEx"
            >
              <div className="relative h-6 w-6 flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
                <ThinkExLogo size={24} priority />
              </div>
            </Link>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <SidebarTrigger />
            </TooltipTrigger>
            <TooltipContent side="right">
              Toggle Sidebar <Kbd className="ml-1">{formatKeyboardShortcut('S', true)}</Kbd>
            </TooltipContent>
          </Tooltip>

          {/* Breadcrumbs */}
          <nav className="flex items-center gap-1.5 text-xs text-sidebar-foreground/70 min-w-0 ml-1">
            {/* Workspace icon + name (clickable to go back to root if in a folder) */}
            {/* Workspace icon + name (clickable to go back to root if in a folder or has active items) */}
            {/* Hidden in compact mode when inside a folder/item - the logic handles this */}
            {(activeFolderId || activeItems.length > 0) && !isCompactMode ? (
              <button
                onClick={() => onNavigateToRoot?.()}
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
                    <ChevronRight className="h-3.5 w-3.5 text-sidebar-foreground/50 mx-1 shrink-0" />
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
                          onClick={() => onNavigateToRoot?.()}
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
                      <ChevronRight className="h-3.5 w-3.5 text-sidebar-foreground/50 mx-1 shrink-0" />
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
                    <ChevronRight className="h-3.5 w-3.5 text-sidebar-foreground/50 mx-1 shrink-0" />
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
                    <ChevronRight className="h-3.5 w-3.5 text-sidebar-foreground/50 mx-1 shrink-0" />
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




            {activeItems.length > 0 && viewMode !== 'workspace+panel' && (
              <div className="flex items-center gap-1.5 text-xs text-sidebar-foreground/70 min-w-0">
                <ChevronRight className="h-3.5 w-3.5 text-sidebar-foreground/50 mx-1 shrink-0" />

                {activeItems.length === 1 ? (
                  // Single Active Item (Maximized or Single Panel) - Editable
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setRenamingTarget({ id: activeItems[0].id, type: 'item' });
                      setRenameValue(activeItems[0].name);
                      setShowRenameDialog(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        setRenamingTarget({ id: activeItems[0].id, type: 'item' });
                        setRenameValue(activeItems[0].name);
                        setShowRenameDialog(true);
                      }
                    }}
                    className={cn(breadcrumbItemClass, "group pr-1")}
                  >
                    {/* Icon based on type */}
                    <WorkspaceItemTypeIcon type={activeItems[0].type} className="h-3.5 w-3.5 shrink-0" />

                    <span className="truncate text-sidebar-foreground max-w-[300px]" title={activeItems[0].name}>
                      {activeItems[0].name}
                    </span>

                    <div
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseActiveItem?.(activeItems[0].id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation();
                          onCloseActiveItem?.(activeItems[0].id);
                        }
                      }}
                      className="ml-1 text-sidebar-foreground/50 hover:text-red-600 p-0.5 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-full transition-all cursor-pointer opacity-0 group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </div>
                  </div>
                ) : (
                  // Multiple Active Items (Split View)
                  <span className="flex items-center gap-1 min-w-0">
                    <span className="truncate font-medium flex items-center gap-1">
                      {activeItems.map((item, idx) => (
                        <span key={item.id} className="flex items-center gap-1">
                          {idx > 0 && <span className="text-sidebar-foreground/30">|</span>}
                          <div className="flex items-center gap-1 group/item">
                            <span className="truncate max-w-[200px]" title={item.name}>{item.name}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onCloseActiveItem?.(item.id);
                              }}
                              className="text-sidebar-foreground/50 hover:text-red-600 p-0.5 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-full transition-all opacity-0 group-hover/item:opacity-100"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
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
          // Portal divs only for PDF (PdfPanelHeader uses them); skip for documents to avoid double gap
          <div className="flex items-center gap-2 pointer-events-auto">
            {activeItems[0]?.type === "pdf" && (
              <div id="workspace-header-portal" className="flex items-center gap-2" />
            )}

            {/* Open Button - only for website cards */}
            {activeItems[0]?.type === "website" && (() => {
              const websiteData = activeItems[0].data as import("@/lib/workspace-state/types").WebsiteData;
              return (
                <button
                  className="h-8 flex items-center justify-center gap-1.5 rounded-md border border-sidebar-border text-muted-foreground hover:text-sidebar-foreground hover:bg-accent transition-colors cursor-pointer px-2"
                  aria-label="Open link in new tab"
                  onClick={() => window.open(websiteData.url, '_blank', 'noopener,noreferrer')}
                >
                  <ExternalLink className="h-4 w-4" />
                  <span className="text-xs font-medium">Open</span>
                </button>
              );
            })()}

            {activeItems[0]?.type === "document" && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="h-8 flex items-center justify-center gap-1.5 rounded-md border border-sidebar-border text-muted-foreground hover:text-sidebar-foreground hover:bg-accent transition-colors cursor-pointer px-2 disabled:pointer-events-none disabled:opacity-50"
                    aria-label="Export"
                    disabled={googleExportLoading}
                  >
                    {googleExportLoading ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                    ) : null}
                    <span className="text-xs font-medium">Export</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40" sideOffset={8}>
                  <DropdownMenuItem
                    disabled={googleExportLoading}
                    onClick={async () => {
                      const item = activeItems[0];
                      if (!item || item.type !== "document") return;
                      if (!getGoogleOAuthClientId()) {
                        toast.error(
                          "Set NEXT_PUBLIC_GOOGLE_CLIENT_ID in your environment to export to Google Docs."
                        );
                        return;
                      }
                      setGoogleExportLoading(true);
                      try {
                        const md = getDocumentMarkdownForExport
                          ? getDocumentMarkdownForExport(item.id)
                          : ((item.data as DocumentData).markdown ?? "");
                        const result = await exportMarkdownToGoogleDoc(md, item.name, {
                          loginHint: googleLoginHint,
                        });
                        setBlockedExportUrl(result.url);
                        setShowExportFallbackDialog(true);
                      } catch (e) {
                        toast.error(
                          e instanceof Error ? e.message : "Could not export to Google Docs"
                        );
                      } finally {
                        setGoogleExportLoading(false);
                      }
                    }}
                    className="cursor-pointer"
                  >
                    <GoogleIcon className="h-4 w-4 shrink-0" />
                    Google Docs
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Split View Button — transitions from focus to workspace+panel */}
            <button
              className="h-8 flex items-center justify-center gap-1.5 rounded-md border border-sidebar-border text-muted-foreground hover:text-sidebar-foreground hover:bg-accent transition-colors cursor-pointer px-2"
              aria-label="Open split view"
              onClick={() => {
                // Get the first active item and open it in panel mode (workspace+panel)
                const itemId = activeItems[0]?.id;
                if (itemId) {
                  openPanel(itemId);
                }
              }}
            >
              <LuPanelLeftOpen className="h-4 w-4" />
              <span className="text-xs font-medium">
                Split
              </span>
            </button>

            {activeItems[0]?.type === "pdf" && (
              <div id="workspace-header-portal-right" className="flex items-center gap-2" />
            )}

            {/* Close Button */}
            <button
              type="button"
              aria-label="Close"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-sidebar-border text-muted-foreground hover:text-sidebar-foreground hover:bg-accent transition-colors cursor-pointer"
              onClick={() => onCloseActiveItem?.(activeItems[0]?.id)}
            >
              <X className="h-4 w-4" />
            </button>


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
              </Button>
            )}

            {/* Version History + Save Indicator Button - hidden in compact mode */}
            {!isCompactMode && onShowHistory && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onShowHistory}
                    disabled={isSaving}
                    className={cn(
                      "h-8 w-8 flex items-center justify-center rounded-md transition-colors pointer-events-auto cursor-pointer",
                      "border border-sidebar-border text-muted-foreground hover:text-sidebar-foreground hover:bg-accent",
                      isSaving && "cursor-default"
                    )}
                    aria-label="Version history"
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <LuCalendar className="h-4 w-4" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  Version history
                </TooltipContent>
              </Tooltip>
            )}

            {/* Search - opens command palette */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onOpenSearch?.()}
                  className={cn(
                    "h-8 w-8 flex items-center justify-center rounded-md transition-colors pointer-events-auto cursor-pointer",
                    "border border-sidebar-border text-muted-foreground hover:text-sidebar-foreground hover:bg-accent"
                  )}
                  data-tour="search-bar"
                  aria-label="Search workspace"
                >
                  <Search className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Search workspace <Kbd className="ml-1">{formatKeyboardShortcut('K')}</Kbd>
              </TooltipContent>
            </Tooltip>

            {/* New Button */}
            {addItem && (
              <DropdownMenu open={isNewMenuOpen} onOpenChange={setIsNewMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <button
                    className={cn(
                      "h-8 outline-none rounded-md text-sm pointer-events-auto whitespace-nowrap relative cursor-pointer box-border",
                      "border border-sidebar-border text-muted-foreground hover:text-sidebar-foreground hover:bg-accent transition-colors",
                      isCompactMode
                        ? "w-8 flex items-center justify-center px-0"
                        : "inline-flex items-center gap-2 px-2",
                      isNewMenuOpen && "text-sidebar-foreground bg-accent"
                    )}
                    data-tour="add-card-button"
                  >
                    <Plus className="h-4 w-4" />
                    {!isCompactMode && (
                      <span>New</span>
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56" sideOffset={8}>
                  {renderWorkspaceMenuItems({
                    callbacks: {
                      onCreateDocument: () => {
                        if (addItem) {
                          const itemId = addItem("document");
                          if (onItemCreated && itemId) {
                            onItemCreated([itemId]);
                          }
                        }
                      },
                      onCreateFolder: () => { if (addItem) addItem("folder"); },
                      onUpload: handleUploadPickerOpen,
                      onAudio: () => { openAudioDialog(); setIsNewMenuOpen(false); },
                      onYouTube: () => { setShowYouTubeDialog(true); setIsNewMenuOpen(false); },
                      onWebsite: () => { setShowWebsiteDialog(true); setIsNewMenuOpen(false); },
                      onFlashcards: () => {
                        setShowFlashcardsDialog(true);
                        setIsNewMenuOpen(false);
                      },
                      onQuiz: () => {
                        setShowQuizDialog(true);
                        setIsNewMenuOpen(false);
                      },
                    },
                    MenuItem: DropdownMenuItem,
                    MenuSub: DropdownMenuSub,
                    MenuSubTrigger: DropdownMenuSubTrigger,
                    MenuSubContent: DropdownMenuSubContent,
                  })}
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
      <Dialog
        open={showExportFallbackDialog}
        onOpenChange={(open) => {
          setShowExportFallbackDialog(open);
          if (!open) {
            setBlockedExportUrl(null);
          }
        }}
      >
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Open Exported Document</DialogTitle>
            <DialogDescription>
              Your export is ready. Use the link below to open the Google Doc.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {blockedExportUrl ? (
              <a
                href={blockedExportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary underline underline-offset-4 break-all"
              >
                {blockedExportUrl}
              </a>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowExportFallbackDialog(false);
                setBlockedExportUrl(null);
              }}
            >
              Close
            </Button>
            {blockedExportUrl ? (
              <Button asChild>
                <a
                  href={blockedExportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2"
                >
                  <GoogleIcon className="h-4 w-4 shrink-0" />
                  Open Google Docs
                </a>
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
        items={items}
        onBeforeSubmit={() => setIsChatExpanded?.(true)}
      />
      {/* Flashcards Prompt Builder Dialog */}
      <PromptBuilderDialog
        open={showFlashcardsDialog}
        onOpenChange={setShowFlashcardsDialog}
        action="flashcards"
        items={items}
        onBeforeSubmit={() => setIsChatExpanded?.(true)}
      />
    </div>
  );
}

export default WorkspaceHeader;
