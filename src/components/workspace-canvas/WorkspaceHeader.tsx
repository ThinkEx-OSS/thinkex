"use client";

import type React from "react";
import {
  Fragment,
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useLayoutEffect,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Search,
  X,
  ChevronRight,
  FolderOpen,
  Plus,
  Settings,
  Share2,
  Loader2,
  ExternalLink,
  MessageSquareText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThinkExLogo } from "@/components/ui/thinkex-logo";

import { formatKeyboardShortcut } from "@/lib/utils/keyboard-shortcut";
import ChatFloatingButton from "@/components/chat/ChatFloatingButton";
import { WorkspaceItemTypeIcon } from "@/components/workspace/WorkspaceItemTypeIcon";
import { useUIStore } from "@/lib/stores/ui-store";
import { IconRenderer } from "@/hooks/use-icon-picker";
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
import { WorkspaceFeedbackDialog } from "./WorkspaceFeedbackDialog";
import { PromptBuilderDialog } from "@/components/chat-v2/composer/PromptBuilderDialog";
const EMPTY_ITEMS: Item[] = [];
const EMPTY_RESPONSIVE_BREADCRUMBS = {
  visibleTailKeys: [] as string[],
  hiddenKeys: [] as string[],
};
const BREADCRUMB_ROOT_TEXT_CLASS =
  "min-w-0 max-w-[220px] truncate text-sidebar-foreground";
const BREADCRUMB_FOLDER_TEXT_CLASS =
  "min-w-0 max-w-[180px] truncate text-sidebar-foreground";
const BREADCRUMB_ITEM_TEXT_CLASS =
  "min-w-0 max-w-[240px] truncate text-sidebar-foreground";
const BREADCRUMB_INTERACTIVE_CLASS =
  "cursor-pointer text-sidebar-foreground/75 hover:text-sidebar-foreground hover:bg-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/60";
const BREADCRUMB_DRAG_TARGET_CLASS =
  "bg-blue-500/10 text-sidebar-foreground ring-1 ring-inset ring-blue-500/50";
const BREADCRUMB_MENU_ITEM_CLASS =
  "flex items-center gap-1.5 rounded-md px-2 py-1.5 cursor-pointer";
/** Shared shell for header toolbar controls — same border/hover as labeled actions; icon-only uses square hit target */
const WORKSPACE_HEADER_TOOLBAR_BTN_BASE =
  "h-8 rounded-md border border-sidebar-border text-muted-foreground hover:text-sidebar-foreground hover:bg-accent transition-colors pointer-events-auto cursor-pointer outline-none";
/** Icon + label with border (primary toolbar CTA, e.g. New) */
const WORKSPACE_HEADER_BORDERED_ACTION_CLASS = cn(
  WORKSPACE_HEADER_TOOLBAR_BTN_BASE,
  "inline-flex items-center gap-2 px-2 text-sm box-border whitespace-nowrap relative",
);
/** Text-only actions (Feedback, Share) — no border; hover shifts label/icon color only */
const WORKSPACE_HEADER_TEXT_ACTION_CLASS =
  "inline-flex h-8 items-center gap-1.5 rounded-md px-1 text-sm font-normal text-muted-foreground transition-colors hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/50 pointer-events-auto cursor-pointer bg-transparent border-0 shadow-none";
/** Icon-only (Search) — same visual family; tooltip + aria-label carry the name */
const WORKSPACE_HEADER_TOOLBAR_ICON_ONLY_CLASS = cn(
  WORKSPACE_HEADER_TOOLBAR_BTN_BASE,
  "w-8 shrink-0 flex items-center justify-center",
);

type BreadcrumbEntry =
  | {
      key: string;
      kind: "root";
      label: string;
      icon: string | null | undefined;
      color: string | null | undefined;
    }
  | {
      key: string;
      kind: "folder";
      id: string;
      label: string;
      color: string | null | undefined;
    }
  | {
      key: string;
      kind: "item";
      id: string;
      label: string;
      itemType: Item["type"];
    };

function areStringArraysEqual(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function getResponsiveBreadcrumbs(
  entries: BreadcrumbEntry[],
  availableWidth: number,
  widths: Map<string, number>,
  separatorWidth: number,
  ellipsisWidth: number,
) {
  if (entries.length <= 1) {
    return EMPTY_RESPONSIVE_BREADCRUMBS;
  }

  const keys = entries.map((entry) => entry.key);
  const rootKey = keys[0];
  const lastKey = keys[keys.length - 1];
  let visibleTailKeys = [lastKey];

  const getWidth = (key: string) => widths.get(key) ?? 0;
  const measureLayout = (candidateTailKeys: string[]) => {
    let totalWidth = getWidth(rootKey);
    const hiddenCount = Math.max(0, keys.length - 1 - candidateTailKeys.length);

    if (hiddenCount > 0) {
      totalWidth += separatorWidth + ellipsisWidth;
    }

    for (const key of candidateTailKeys) {
      totalWidth += separatorWidth + getWidth(key);
    }

    return totalWidth;
  };

  for (let index = keys.length - 2; index >= 1; index -= 1) {
    const nextVisibleTailKeys = [keys[index], ...visibleTailKeys];

    if (measureLayout(nextVisibleTailKeys) <= availableWidth) {
      visibleTailKeys = nextVisibleTailKeys;
    } else {
      break;
    }
  }

  return {
    visibleTailKeys,
    hiddenKeys: keys.slice(1, keys.length - visibleTailKeys.length),
  };
}

function BreadcrumbSeparator({
  measureRef,
}: {
  measureRef?: React.Ref<HTMLSpanElement>;
}) {
  return (
    <span
      ref={measureRef}
      className="mx-1 inline-flex shrink-0 items-center text-sidebar-foreground/50"
    >
      <ChevronRight className="h-3.5 w-3.5" />
    </span>
  );
}

function GoogleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" {...props}>
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917"
      />
      <path
        fill="#FF3D00"
        d="m6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.9 11.9 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917"
      />
    </svg>
  );
}
import { useWorkspaceFilePicker } from "@/hooks/workspace/use-workspace-file-picker";
import { startAudioProcessing } from "@/lib/audio/start-audio-processing";

interface WorkspaceHeaderProps {
  onOpenSearch?: () => void;
  // Save indicator props
  isSaving?: boolean;
  currentWorkspaceId?: string | null;
  // Chat button props
  isDesktop?: boolean;
  isChatExpanded?: boolean;
  setIsChatExpanded?: (expanded: boolean) => void;
  // Workspace info for breadcrumbs
  workspaceName?: string;
  workspaceIcon?: string | null;
  workspaceColor?: string | null;
  // New button props
  addItem?: (
    type: CardType,
    name?: string,
    initialData?: Partial<Item["data"]>,
    initialLayout?: { w: number; h: number },
  ) => string;
  onPDFUpload?: (files: File[]) => Promise<void>;
  // Callback for when items are created (for auto-scroll/selection)
  onItemCreated?: (itemIds: string[]) => void;

  // Folder props
  items?: Item[]; // All items for building folder path
  // Rename folder function
  onRenameFolder?: (folderId: string, newName: string) => void;
  // Workspace actions
  onOpenSettings?: () => void;
  onOpenShare?: () => void;

  /** Item shown in the fullscreen workspace viewer (`openMode === "single"`) — breadcrumbs + header actions */
  activeOpenWorkspaceItem?: Item | null;
  onCloseActiveItem?: (itemId: string) => void;
  onNavigateToRoot?: () => void;
  onNavigateToFolder?: (folderId: string) => void;
  onUpdateActiveItem?: (itemId: string, updates: Partial<Item>) => void;
  /** Flush pending saves and read latest document markdown from workspace cache (avoids stale export). */
  getDocumentMarkdownForExport?: (itemId: string) => string;
  googleLoginHint?: string | null;
}

export function WorkspaceHeader({
  onOpenSearch,
  isSaving,
  currentWorkspaceId,
  isDesktop = true,
  isChatExpanded = false,
  setIsChatExpanded,
  workspaceName,
  workspaceIcon,
  workspaceColor,
  addItem,
  onPDFUpload,
  onItemCreated,

  items = EMPTY_ITEMS,
  onRenameFolder,
  onOpenSettings,
  onOpenShare,

  activeOpenWorkspaceItem = null,
  onCloseActiveItem,
  onNavigateToRoot,
  onNavigateToFolder,
  onUpdateActiveItem,
  getDocumentMarkdownForExport,
  googleLoginHint,
}: WorkspaceHeaderProps) {
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renamingTarget, setRenamingTarget] = useState<{
    id: string;
    type: "folder" | "item";
  } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [showYouTubeDialog, setShowYouTubeDialog] = useState(false);
  const [showWebsiteDialog, setShowWebsiteDialog] = useState(false);
  const [showQuizDialog, setShowQuizDialog] = useState(false);
  const [showFlashcardsDialog, setShowFlashcardsDialog] = useState(false);
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
  const [googleExportLoading, setGoogleExportLoading] = useState(false);
  const [showExportFallbackDialog, setShowExportFallbackDialog] =
    useState(false);
  const [blockedExportUrl, setBlockedExportUrl] = useState<string | null>(null);
  const showAudioDialog = useAudioRecordingStore((s) => s.isDialogOpen);
  const openAudioDialog = useAudioRecordingStore((s) => s.openDialog);
  const closeAudioDialog = useAudioRecordingStore((s) => s.closeDialog);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const isWorkspaceRoute = pathname.startsWith("/workspace");

  // Track drag hover state for breadcrumb elements
  const [hoveredBreadcrumbTarget, setHoveredBreadcrumbTarget] = useState<
    string | null
  >(null); // 'root' or folderId
  const isDraggingRef = useRef(false);
  const breadcrumbNavRef = useRef<HTMLElement>(null);
  const breadcrumbMeasureRefs = useRef<Record<string, HTMLElement | null>>({});
  const breadcrumbSeparatorMeasureRef = useRef<HTMLSpanElement>(null);
  const breadcrumbEllipsisMeasureRef = useRef<HTMLDivElement>(null);
  const [ellipsisDropdownState, setEllipsisDropdownState] = useState<{
    breadcrumbLayoutKey: string;
    open: boolean;
  }>({
    breadcrumbLayoutKey: "",
    open: false,
  });
  const [responsiveBreadcrumbs, setResponsiveBreadcrumbs] = useState(
    EMPTY_RESPONSIVE_BREADCRUMBS,
  );

  // Consistent breadcrumb item styling
  const breadcrumbItemClass =
    "inline-flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors";

  // Get active folder from UI store
  const activeFolderId = useUIStore((state) => state.activeFolderId);

  // Build folder path for breadcrumbs
  const folderPath = useMemo(() => {
    if (!activeFolderId || !items.length) return [];
    return getFolderPath(activeFolderId, items);
  }, [activeFolderId, items]);
  const workspaceBreadcrumbLabel = workspaceName || "Untitled";
  const breadcrumbEntries = useMemo<BreadcrumbEntry[]>(() => {
    const entries: BreadcrumbEntry[] = [
      {
        key: "root",
        kind: "root",
        label: workspaceBreadcrumbLabel,
        icon: workspaceIcon,
        color: workspaceColor,
      },
    ];

    for (const folder of folderPath) {
      entries.push({
        key: `folder:${folder.id}`,
        kind: "folder",
        id: folder.id,
        label: folder.name,
        color: folder.color,
      });
    }

    if (activeOpenWorkspaceItem) {
      entries.push({
        key: `item:${activeOpenWorkspaceItem.id}`,
        kind: "item",
        id: activeOpenWorkspaceItem.id,
        label: activeOpenWorkspaceItem.name,
        itemType: activeOpenWorkspaceItem.type,
      });
    }

    return entries;
  }, [
    folderPath,
    activeOpenWorkspaceItem,
    workspaceBreadcrumbLabel,
    workspaceColor,
    workspaceIcon,
  ]);
  const breadcrumbLayoutKey = useMemo(
    () => breadcrumbEntries.map((entry) => entry.key).join("/"),
    [breadcrumbEntries],
  );
  const isEllipsisDropdownOpen =
    ellipsisDropdownState.breadcrumbLayoutKey === breadcrumbLayoutKey &&
    ellipsisDropdownState.open;
  const handleEllipsisDropdownOpenChange = useCallback(
    (open: boolean) => {
      setEllipsisDropdownState({
        breadcrumbLayoutKey,
        open,
      });
    },
    [breadcrumbLayoutKey],
  );

  // Handle folder click - switch folder or rename if already active (and no panel open)
  const handleFolderClick = useCallback(
    (folderId: string) => {
      // If panel is open, delegate to parent (closes if focused, else just switches folder) — don't open rename
      if (activeOpenWorkspaceItem) {
        onNavigateToFolder?.(folderId);
        return;
      }
      if (activeFolderId === folderId && onRenameFolder) {
        // Folder is already active and no panel — open rename dialog
        const folder = items.find(
          (i) => i.id === folderId && i.type === "folder",
        );
        if (folder) {
          setRenamingTarget({ id: folderId, type: "folder" });
          setRenameValue(folder.name);
          setShowRenameDialog(true);
        }
      } else {
        onNavigateToFolder?.(folderId);
      }
    },
    [
      activeFolderId,
      activeOpenWorkspaceItem,
      items,
      onRenameFolder,
      onNavigateToFolder,
    ],
  );

  // Handle rename
  const handleRename = useCallback(() => {
    if (!renamingTarget || !renameValue.trim()) return;

    if (renamingTarget.type === "folder" && onRenameFolder) {
      onRenameFolder(renamingTarget.id, renameValue.trim());
      toast.success("Folder renamed");
    } else if (renamingTarget.type === "item" && onUpdateActiveItem) {
      onUpdateActiveItem(renamingTarget.id, { name: renameValue.trim() });
      toast.success("Item renamed");
    }

    setShowRenameDialog(false);
    setRenamingTarget(null);
  }, [onRenameFolder, onUpdateActiveItem, renamingTarget, renameValue]);

  const openItemRenameDialog = useCallback(
    (itemId: string, itemName: string) => {
      setRenamingTarget({ id: itemId, type: "item" });
      setRenameValue(itemName);
      setShowRenameDialog(true);
    },
    [],
  );

  useEffect(() => {
    const validKeys = new Set(breadcrumbEntries.map((entry) => entry.key));

    for (const key of Object.keys(breadcrumbMeasureRefs.current)) {
      if (!validKeys.has(key)) {
        delete breadcrumbMeasureRefs.current[key];
      }
    }
  }, [breadcrumbEntries]);

  useLayoutEffect(() => {
    const navElement = breadcrumbNavRef.current;

    if (!navElement) {
      return;
    }

    let animationFrame = 0;

    const recomputeLayout = () => {
      animationFrame = 0;

      const availableWidth = navElement.clientWidth;
      if (availableWidth <= 0) {
        return;
      }

      const widths = new Map<string, number>();
      for (const entry of breadcrumbEntries) {
        widths.set(
          entry.key,
          Math.ceil(
            breadcrumbMeasureRefs.current[entry.key]?.getBoundingClientRect()
              .width ?? 0,
          ),
        );
      }

      const separatorWidth = Math.ceil(
        breadcrumbSeparatorMeasureRef.current?.getBoundingClientRect().width ??
          18,
      );
      const ellipsisWidth = Math.ceil(
        breadcrumbEllipsisMeasureRef.current?.getBoundingClientRect().width ??
          30,
      );
      const nextResponsiveBreadcrumbs = getResponsiveBreadcrumbs(
        breadcrumbEntries,
        availableWidth,
        widths,
        separatorWidth,
        ellipsisWidth,
      );

      setResponsiveBreadcrumbs((current) => {
        if (
          areStringArraysEqual(
            current.visibleTailKeys,
            nextResponsiveBreadcrumbs.visibleTailKeys,
          ) &&
          areStringArraysEqual(
            current.hiddenKeys,
            nextResponsiveBreadcrumbs.hiddenKeys,
          )
        ) {
          return current;
        }

        return nextResponsiveBreadcrumbs;
      });
    };

    const scheduleRecompute = () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }

      animationFrame = window.requestAnimationFrame(recomputeLayout);
    };

    scheduleRecompute();

    const resizeObserver = new ResizeObserver(scheduleRecompute);
    resizeObserver.observe(navElement);

    if (document.fonts?.ready) {
      void document.fonts.ready.then(scheduleRecompute);
    }

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
      resizeObserver.disconnect();
    };
  }, [breadcrumbEntries]);

  const breadcrumbEntryLookup = useMemo(
    () => new Map(breadcrumbEntries.map((entry) => [entry.key, entry])),
    [breadcrumbEntries],
  );
  const hiddenBreadcrumbEntries = useMemo(
    () =>
      responsiveBreadcrumbs.hiddenKeys
        .map((key) => breadcrumbEntryLookup.get(key))
        .filter((entry): entry is BreadcrumbEntry => Boolean(entry)),
    [breadcrumbEntryLookup, responsiveBreadcrumbs.hiddenKeys],
  );
  const visibleTailBreadcrumbEntries = useMemo(
    () =>
      responsiveBreadcrumbs.visibleTailKeys
        .map((key) => breadcrumbEntryLookup.get(key))
        .filter((entry): entry is BreadcrumbEntry => Boolean(entry)),
    [breadcrumbEntryLookup, responsiveBreadcrumbs.visibleTailKeys],
  );

  const renderRootBreadcrumbLabel = useCallback(
    () => (
      <>
        <IconRenderer
          icon={workspaceIcon}
          className="h-4 w-4 shrink-0"
          style={{ color: workspaceColor || undefined }}
        />
        <span
          className={BREADCRUMB_ROOT_TEXT_CLASS}
          title={workspaceBreadcrumbLabel}
        >
          {workspaceBreadcrumbLabel}
        </span>
      </>
    ),
    [workspaceBreadcrumbLabel, workspaceColor, workspaceIcon],
  );

  const renderFolderBreadcrumbLabel = useCallback(
    (entry: Extract<BreadcrumbEntry, { kind: "folder" }>) => (
      <>
        <FolderOpen
          className="h-3.5 w-3.5 shrink-0"
          style={{ color: entry.color || undefined }}
        />
        <span className={BREADCRUMB_FOLDER_TEXT_CLASS} title={entry.label}>
          {entry.label}
        </span>
      </>
    ),
    [],
  );

  const renderItemBreadcrumbLabel = useCallback(
    (entry: Extract<BreadcrumbEntry, { kind: "item" }>) => (
      <>
        <WorkspaceItemTypeIcon
          type={entry.itemType}
          className="h-3.5 w-3.5 shrink-0"
        />
        <span className={BREADCRUMB_ITEM_TEXT_CLASS} title={entry.label}>
          {entry.label}
        </span>
      </>
    ),
    [],
  );

  const renderRootBreadcrumb = useCallback(() => {
    const rootHighlightClass =
      hoveredBreadcrumbTarget === "root" && BREADCRUMB_DRAG_TARGET_CLASS;

    if (activeFolderId || activeOpenWorkspaceItem) {
      return (
        <button
          onClick={() => onNavigateToRoot?.()}
          data-breadcrumb-target="root"
          className={cn(
            breadcrumbItemClass,
            BREADCRUMB_INTERACTIVE_CLASS,
            rootHighlightClass,
          )}
        >
          {renderRootBreadcrumbLabel()}
        </button>
      );
    }

    if (onOpenSettings || onOpenShare) {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              data-breadcrumb-target="root"
              className={cn(
                breadcrumbItemClass,
                BREADCRUMB_INTERACTIVE_CLASS,
                rootHighlightClass,
              )}
            >
              {renderRootBreadcrumbLabel()}
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
      );
    }

    return (
      <div
        data-breadcrumb-target="root"
        className={cn(
          breadcrumbItemClass,
          "text-sidebar-foreground/75",
          hoveredBreadcrumbTarget === "root" && BREADCRUMB_DRAG_TARGET_CLASS,
        )}
      >
        {renderRootBreadcrumbLabel()}
      </div>
    );
  }, [
    activeFolderId,
    breadcrumbItemClass,
    hoveredBreadcrumbTarget,
    onNavigateToRoot,
    onOpenSettings,
    onOpenShare,
    activeOpenWorkspaceItem,
    renderRootBreadcrumbLabel,
  ]);

  const renderFolderBreadcrumb = useCallback(
    (entry: Extract<BreadcrumbEntry, { kind: "folder" }>) => (
      <button
        onClick={() => handleFolderClick(entry.id)}
        data-breadcrumb-target="folder"
        data-folder-id={entry.id}
        className={cn(
          breadcrumbItemClass,
          BREADCRUMB_INTERACTIVE_CLASS,
          hoveredBreadcrumbTarget === entry.id && BREADCRUMB_DRAG_TARGET_CLASS,
        )}
      >
        {renderFolderBreadcrumbLabel(entry)}
      </button>
    ),
    [
      breadcrumbItemClass,
      handleFolderClick,
      hoveredBreadcrumbTarget,
      renderFolderBreadcrumbLabel,
    ],
  );

  const renderItemBreadcrumb = useCallback(
    (
      entry: Extract<BreadcrumbEntry, { kind: "item" }>,
      measurement = false,
    ) => {
      if (measurement) {
        return (
          <div
            className={cn(
              breadcrumbItemClass,
              "group pr-0.5 text-sidebar-foreground/75",
            )}
          >
            {renderItemBreadcrumbLabel(entry)}
            <span
              aria-hidden="true"
              className="ml-0.5 rounded-full p-0.5 opacity-0"
            >
              <X className="h-3 w-3" />
            </span>
          </div>
        );
      }

      return (
        <div
          role="button"
          tabIndex={0}
          onClick={() => openItemRenameDialog(entry.id, entry.label)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              openItemRenameDialog(entry.id, entry.label);
            }
          }}
          className={cn(
            breadcrumbItemClass,
            BREADCRUMB_INTERACTIVE_CLASS,
            "group pr-0.5",
          )}
        >
          {renderItemBreadcrumbLabel(entry)}

          <button
            type="button"
            aria-label={`Close ${entry.label}`}
            onClick={(e) => {
              e.stopPropagation();
              onCloseActiveItem?.(entry.id);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
            }}
            className="ml-0.5 rounded-full p-0.5 transition-all cursor-pointer text-sidebar-foreground/45 hover:text-red-600 hover:bg-accent opacity-0 group-hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      );
    },
    [
      breadcrumbItemClass,
      onCloseActiveItem,
      openItemRenameDialog,
      renderItemBreadcrumbLabel,
    ],
  );

  const renderBreadcrumbEntry = useCallback(
    (entry: BreadcrumbEntry) => {
      switch (entry.kind) {
        case "root":
          return renderRootBreadcrumb();
        case "folder":
          return renderFolderBreadcrumb(entry);
        case "item":
          return renderItemBreadcrumb(entry);
        default:
          return null;
      }
    },
    [renderFolderBreadcrumb, renderItemBreadcrumb, renderRootBreadcrumb],
  );

  const renderMeasurementBreadcrumbEntry = useCallback(
    (entry: BreadcrumbEntry) => {
      switch (entry.kind) {
        case "root":
          return (
            <div className={breadcrumbItemClass}>
              {renderRootBreadcrumbLabel()}
            </div>
          );
        case "folder":
          return (
            <div className={breadcrumbItemClass}>
              {renderFolderBreadcrumbLabel(entry)}
            </div>
          );
        case "item":
          return renderItemBreadcrumb(entry, true);
        default:
          return null;
      }
    },
    [
      breadcrumbItemClass,
      renderFolderBreadcrumbLabel,
      renderItemBreadcrumb,
      renderRootBreadcrumbLabel,
    ],
  );

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
          const rootTargets = document.querySelectorAll(
            '[data-breadcrumb-target="root"]',
          );
          if (rootTargets.length > 0) {
            foundTarget = "root";
          }
        } else {
          // Hovering over a folder - check if it's a breadcrumb target
          const folderTargets = document.querySelectorAll(
            `[data-breadcrumb-target="folder"][data-folder-id="${folderId}"]`,
          );
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

    window.addEventListener("folder-drag-hover", handleDragHover);

    return () => {
      window.removeEventListener("folder-drag-hover", handleDragHover);
    };
  }, []);

  const handleYouTubeCreate = useCallback(
    (url: string, name: string, thumbnail?: string) => {
      if (addItem) {
        addItem("youtube", name, { url, thumbnail });
      }
      setIsNewMenuOpen(false);
    },
    [addItem],
  );

  const handleAudioReady = useCallback(
    async (file: File) => {
      if (!addItem) return;

      // Import uploadFileDirect dynamically to avoid top-level client import issues
      const { uploadFileDirect } = await import("@/lib/uploads/client-upload");

      const loadingToastId = toast.loading("Uploading audio...");

      try {
        // Upload the audio file to storage
        const { url: fileUrl } = await uploadFileDirect(file);

        // Create the audio card immediately (shows "processing" state)
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
            console.error(
              "[WORKSPACE_HEADER] Failed to start audio processing:",
              processingError,
            );
          });
        }
      } catch (error: unknown) {
        toast.dismiss(loadingToastId);
        toast.error(
          error instanceof Error ? error.message : "Failed to upload audio",
        );
      }
    },
    [addItem, currentWorkspaceId, onItemCreated],
  );

  const handleWebsiteCreate = useCallback(
    (url: string, name: string, favicon?: string) => {
      if (!addItem) return;
      addItem(
        "website",
        name,
        { url, favicon },
        DEFAULT_CARD_DIMENSIONS.website,
      );
      setIsNewMenuOpen(false);
    },
    [addItem],
  );

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

  return (
    <div className="relative py-2 z-20 bg-sidebar">
      <input ref={fileInputRef} {...fileInputProps} />
      {/* Main container with flex layout */}
      <div className="flex w-full items-center gap-3 px-3">
        {/* Left Side: Sidebar Toggle + Navigation Arrows + Breadcrumbs */}
        <div className="flex min-w-0 flex-1 items-center gap-2 pointer-events-auto">
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
              Toggle Sidebar{" "}
              <Kbd className="ml-1">{formatKeyboardShortcut("S", true)}</Kbd>
            </TooltipContent>
          </Tooltip>

          {/* Breadcrumbs */}
          <nav
            ref={breadcrumbNavRef}
            className="flex min-w-0 flex-1 items-center overflow-hidden text-xs text-sidebar-foreground/70"
          >
            {renderRootBreadcrumb()}

            {hiddenBreadcrumbEntries.length > 0 && (
              <>
                <BreadcrumbSeparator />
                <DropdownMenu
                  open={isEllipsisDropdownOpen}
                  onOpenChange={handleEllipsisDropdownOpenChange}
                >
                  <DropdownMenuTrigger asChild>
                    <button
                      className={cn(
                        breadcrumbItemClass,
                        BREADCRUMB_INTERACTIVE_CLASS,
                        "text-sidebar-foreground/70 hover:text-sidebar-foreground",
                      )}
                    >
                      <span className="font-medium">...</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-w-[220px]">
                    {hiddenBreadcrumbEntries.map((entry) => {
                      if (entry.kind !== "folder") {
                        return null;
                      }

                      return (
                        <DropdownMenuItem
                          key={entry.key}
                          onClick={() => handleFolderClick(entry.id)}
                          className={cn(
                            BREADCRUMB_MENU_ITEM_CLASS,
                            hoveredBreadcrumbTarget === entry.id &&
                              BREADCRUMB_DRAG_TARGET_CLASS,
                          )}
                        >
                          <FolderOpen
                            className="h-3.5 w-3.5 shrink-0"
                            style={{ color: entry.color || undefined }}
                          />
                          <span className="truncate" title={entry.label}>
                            {entry.label}
                          </span>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}

            {visibleTailBreadcrumbEntries.map((entry) => (
              <Fragment key={entry.key}>
                <BreadcrumbSeparator />
                {renderBreadcrumbEntry(entry)}
              </Fragment>
            ))}
          </nav>
        </div>

        {/* Right Side: Save Indicator + Search + Chat Button */}
        {activeOpenWorkspaceItem ? (
          // Item open: show type-specific header actions (aligned with breadcrumbs)
          <div className="flex shrink-0 items-center gap-2 pointer-events-auto">
            {activeOpenWorkspaceItem.type === "pdf" && (
              <div
                id="workspace-header-portal"
                className="flex items-center gap-2"
              />
            )}

            {activeOpenWorkspaceItem.type === "website" &&
              (() => {
                const websiteData =
                  activeOpenWorkspaceItem.data as import("@/lib/workspace-state/types").WebsiteData;
                return (
                  <button
                    className="h-8 flex items-center justify-center gap-1.5 rounded-md border border-sidebar-border text-muted-foreground hover:text-sidebar-foreground hover:bg-accent transition-colors cursor-pointer px-2"
                    aria-label="Open link in new tab"
                    onClick={() =>
                      window.open(
                        websiteData.url,
                        "_blank",
                        "noopener,noreferrer",
                      )
                    }
                  >
                    <ExternalLink className="h-4 w-4" />
                    <span className="text-xs font-medium">Open</span>
                  </button>
                );
              })()}

            {activeOpenWorkspaceItem.type === "document" && (
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
                <DropdownMenuContent
                  align="end"
                  className="w-40"
                  sideOffset={8}
                >
                  <DropdownMenuItem
                    disabled={googleExportLoading}
                    onClick={async () => {
                      const item = activeOpenWorkspaceItem;
                      if (!item || item.type !== "document") return;
                      if (!getGoogleOAuthClientId()) {
                        toast.error(
                          "Set NEXT_PUBLIC_GOOGLE_CLIENT_ID in your environment to export to Google Docs.",
                        );
                        return;
                      }
                      setGoogleExportLoading(true);
                      try {
                        const md = getDocumentMarkdownForExport
                          ? getDocumentMarkdownForExport(item.id)
                          : ((item.data as DocumentData).markdown ?? "");
                        const result = await exportMarkdownToGoogleDoc(
                          md,
                          item.name,
                          {
                            loginHint: googleLoginHint,
                          },
                        );
                        setBlockedExportUrl(result.url);
                        setShowExportFallbackDialog(true);
                      } catch (e) {
                        toast.error(
                          e instanceof Error
                            ? e.message
                            : "Could not export to Google Docs",
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

            {activeOpenWorkspaceItem.type === "pdf" && (
              <div
                id="workspace-header-portal-right"
                className="flex items-center gap-2"
              />
            )}

            <button
              type="button"
              aria-label="Close"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-sidebar-border text-muted-foreground hover:text-sidebar-foreground hover:bg-accent transition-colors cursor-pointer"
              onClick={() => onCloseActiveItem?.(activeOpenWorkspaceItem.id)}
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
          <div className="flex shrink-0 items-center gap-2 pointer-events-auto">
            {/* Collaborator Avatars - show who's in the workspace */}
            <CollaboratorAvatars />

            {/* Feedback button — opens in-app feedback dialog; lifecycle events still sent to PostHog survey 019d934f-3f98-0000-1f14-af80eef4dcb0 */}
            <button
              type="button"
              className={WORKSPACE_HEADER_TEXT_ACTION_CLASS}
              onClick={() => setShowFeedbackDialog(true)}
            >
              <MessageSquareText className="h-4 w-4 shrink-0" />
              Feedback
            </button>

            {onOpenShare && (
              <button
                type="button"
                onClick={onOpenShare}
                className={WORKSPACE_HEADER_TEXT_ACTION_CLASS}
              >
                <Share2 className="h-4 w-4 shrink-0" />
                Share
              </button>
            )}

            {/* Search - opens command palette */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onOpenSearch?.()}
                  className={WORKSPACE_HEADER_TOOLBAR_ICON_ONLY_CLASS}
                  data-tour="search-bar"
                  aria-label="Search workspace"
                >
                  <Search className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Search workspace{" "}
                <Kbd className="ml-1">{formatKeyboardShortcut("K")}</Kbd>
              </TooltipContent>
            </Tooltip>

            {/* New Button - keeps bordered style as primary CTA */}
            {addItem && (
              <DropdownMenu
                open={isNewMenuOpen}
                onOpenChange={setIsNewMenuOpen}
              >
                <DropdownMenuTrigger asChild>
                  <button
                    className={cn(
                      WORKSPACE_HEADER_BORDERED_ACTION_CLASS,
                      isNewMenuOpen && "text-sidebar-foreground bg-accent",
                    )}
                    data-tour="add-card-button"
                  >
                    <Plus className="h-4 w-4" />
                    <span>New</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-56"
                  sideOffset={8}
                >
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
                      onCreateFolder: () => {
                        if (addItem) addItem("folder");
                      },
                      onUpload: handleUploadPickerOpen,
                      onAudio: () => {
                        openAudioDialog();
                        setIsNewMenuOpen(false);
                      },
                      onYouTube: () => {
                        setShowYouTubeDialog(true);
                        setIsNewMenuOpen(false);
                      },
                      onWebsite: () => {
                        setShowWebsiteDialog(true);
                        setIsNewMenuOpen(false);
                      },
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

            {setIsChatExpanded ? (
              <ChatFloatingButton
                isDesktop={isDesktop}
                isChatExpanded={isChatExpanded}
                setIsChatExpanded={setIsChatExpanded}
              />
            ) : null}
          </div>
        )}
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 overflow-hidden opacity-0"
      >
        <div className="flex w-max items-center text-xs text-sidebar-foreground/70">
          {breadcrumbEntries.map((entry, index) => (
            <Fragment key={`measure-${entry.key}`}>
              {index > 0 ? (
                <BreadcrumbSeparator
                  measureRef={
                    index === 1 ? breadcrumbSeparatorMeasureRef : undefined
                  }
                />
              ) : null}
              <div
                ref={(node) => {
                  breadcrumbMeasureRefs.current[entry.key] = node;
                }}
              >
                {renderMeasurementBreadcrumbEntry(entry)}
              </div>
            </Fragment>
          ))}
          <div
            ref={breadcrumbEllipsisMeasureRef}
            className={cn(
              breadcrumbItemClass,
              "text-sidebar-foreground/70 hover:text-sidebar-foreground",
            )}
          >
            <span className="font-medium">...</span>
          </div>
        </div>
      </div>
      {/* Rename Dialog */}
      {(onRenameFolder || onUpdateActiveItem) && (
        <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
          <DialogContent onClick={(e) => e.stopPropagation()}>
            <DialogHeader>
              <DialogTitle>
                Rename {renamingTarget?.type === "folder" ? "Folder" : "Item"}
              </DialogTitle>
              <DialogDescription>
                Enter a new name for this{" "}
                {renamingTarget?.type === "folder" ? "folder" : "item"}.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input
                ref={renameInputRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && renameValue.trim()) {
                    handleRename();
                  } else if (e.key === "Escape") {
                    setShowRenameDialog(false);
                  }
                }}
                placeholder={
                  renamingTarget?.type === "folder"
                    ? "Folder name"
                    : "Item name"
                }
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowRenameDialog(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleRename} disabled={!renameValue.trim()}>
                Rename
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
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
      {/* Feedback Dialog — replaces legacy PostHog popover survey */}
      <WorkspaceFeedbackDialog
        open={showFeedbackDialog}
        onOpenChange={setShowFeedbackDialog}
      />
    </div>
  );
}

export default WorkspaceHeader;
