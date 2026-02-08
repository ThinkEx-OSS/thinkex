"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { FolderPlus, MoreVertical, Users, Trash2, Share2, X, CheckSquare } from "lucide-react";
import { useUIStore } from "@/lib/stores/ui-store";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import CreateWorkspaceModal from "@/components/workspace/CreateWorkspaceModal";
import { useSession } from "@/lib/auth-client";
import { IconRenderer } from "@/hooks/use-icon-picker";
import { cn } from "@/lib/utils";
import WorkspaceSettingsModal from "@/components/workspace/WorkspaceSettingsModal";
import ShareWorkspaceDialog from "@/components/workspace/ShareWorkspaceDialog";
import type { WorkspaceWithState } from "@/lib/workspace-state/types";
import { getCardColorCSS, getCardAccentColor, type CardColor } from "@/lib/workspace-state/colors";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";

import { WorkspaceGridSkeleton } from "@/components/home/WorkspaceGridSkeleton";

interface WorkspaceGridProps {
  searchQuery?: string;
}

export function WorkspaceGrid({ searchQuery = "" }: WorkspaceGridProps) {
  const router = useRouter();
  const { showCreateWorkspaceModal, setShowCreateWorkspaceModal } = useUIStore();
  const { workspaces, switchWorkspace, loadWorkspaces, deleteWorkspace, loadingWorkspaces } = useWorkspaceContext();
  const { data: session } = useSession();
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);



  // Filter workspaces based on search query
  const filteredWorkspaces = useMemo(() => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) return workspaces;
    const query = trimmedQuery.toLowerCase();
    return workspaces.filter((w) =>
      w.name.toLowerCase().includes(query)
    );
  }, [workspaces, searchQuery]);
  const [settingsWorkspace, setSettingsWorkspace] = useState<WorkspaceWithState | null>(null);
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const hasAttemptedWelcomeWorkspace = useRef(false);
  const prefetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const isSelectionMode = selectedIds.size > 0;

  const toggleSelection = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());

    // Reset inline border styles that may have been set during selection
    // We need to manually reset these because they were set via inline styles
    setTimeout(() => {
      filteredWorkspaces.forEach((workspace) => {
        const element = document.querySelector(`[data-workspace-id="${workspace.id}"]`);
        if (element instanceof HTMLElement) {
          const color = workspace.color as CardColor | undefined;
          const borderColor = color ? getCardAccentColor(color, 0.5) : 'var(--sidebar-border)';
          element.style.borderColor = borderColor;
        }
      });
    }, 0);
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} workspaces?`)) return;

    // In a real app, use a bulk delete API. Here we loop (as per plan).
    // We can use Promise.all but context might not support concurrent optimistic updates well?
    // Let's try Promise.all.
    const { deleteWorkspace } = useWorkspaceContext(); // We need to access this from context properly
    // The hook provides deleteWorkspace, but we destructuring it inside the component is fine?
    // Wait, useWorkspaceContext is called at the top: const { workspaces, switchWorkspace, loadWorkspaces } = useWorkspaceContext();
    // I need to add deleteWorkspace to that destructuring.

    try {
      // Implementation detail: we need to import deleteWorkspace from context above
      // For now, I'll update the destructuring in a separate chunk or assume I can access it
    } catch (e) {
      // Error handling
    }
  };

  // Lazy workspace creation for anonymous users
  useEffect(() => {
    const createWelcomeWorkspace = async () => {
      if (!session?.user?.isAnonymous) return;
      if (workspaces.length > 0) return; // Already has workspaces
      if (isCreatingWorkspace) return; // Already creating
      if (hasAttemptedWelcomeWorkspace.current) return; // Avoid retry loop

      setIsCreatingWorkspace(true);
      hasAttemptedWelcomeWorkspace.current = true;
      try {
        console.log("Welcome workspace creation disabled");
        // const res = await fetch("/api/guest/create-welcome-workspace", {
        //   method: "POST",
        // });

        // if (res.ok) {
        //   // Reload workspaces to show the newly created one
        //   await loadWorkspaces();
        // }
      } catch (error) {
        console.error("Failed to create welcome workspace:", error);
      } finally {
        setIsCreatingWorkspace(false);
      }
    };

    createWelcomeWorkspace();
  }, [session, workspaces.length, loadWorkspaces]);

  // Format date helper
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  // Get preview text from workspace
  const getPreviewText = (workspace: WorkspaceWithState) => {
    if (workspace.state?.items && workspace.state.items.length > 0) {
      const firstItem = workspace.state.items[0];
      if (firstItem.type === "note") {
        const noteData = firstItem.data as { field1?: string; blockContent?: unknown };
        if (noteData.field1) {
          return noteData.field1.split("\n").slice(0, 3).join("\n");
        }
      }
      return firstItem.name;
    }
    return "";
  };

  const handleSettingsClick = (e: React.MouseEvent | React.KeyboardEvent, workspace: WorkspaceWithState) => {
    e.stopPropagation();
    setSettingsWorkspace(workspace);
    setShowSettingsModal(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      action();
    }
  };

  const handleCreateNew = () => {
    setShowCreateWorkspaceModal(true);
  };

  // Show skeleton if loading and no workspaces (initial load)
  if (loadingWorkspaces && workspaces.length === 0) {
    return <WorkspaceGridSkeleton />;
  }

  return (
    <>
      <div className="w-full">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* New Workspace Card */}
          <div
            role="button"
            tabIndex={0}
            onClick={handleCreateNew}
            onKeyDown={(e) => handleKeyDown(e, handleCreateNew)}
            className={cn(
              "group relative p-4 rounded-md shadow-sm min-h-[180px]",
              "hover:shadow-lg",
              "transition-all duration-200 cursor-pointer",
              "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background",
              "flex flex-col items-center justify-center gap-3",
              "bg-background/30 border-2 border-dashed border-sidebar-border/60",
              "hover:border-solid hover:border-primary/50 hover:bg-background/50"
            )}
          >
            {/* Centered Icon */}
            <FolderPlus
              className="h-12 w-12 opacity-50 group-hover:opacity-70 group-hover:scale-110 transition-all duration-200"
              style={{ color: "hsl(var(--primary))" }}
            />

            {/* Title */}
            <h3 className="font-normal text-lg text-foreground group-hover:text-foreground/80 transition-colors text-center">
              New workspace
            </h3>
          </div>

          {/* Loading state for anonymous users creating first workspace */}
          {session?.user?.isAnonymous && workspaces.length === 0 && isCreatingWorkspace && (
            <div className="relative rounded-md shadow-sm min-h-[180px] overflow-hidden flex flex-col items-center justify-center gap-3 bg-muted/40 border border-muted-foreground/20">
              <div className="w-8 h-8 border-2 border-primary/30 border-t-primary animate-spin rounded-full" />
              <p className="text-sm text-muted-foreground">Setting up your workspace...</p>
            </div>
          )}

          {/* Existing Workspaces */}
          {filteredWorkspaces.map((workspace) => {
            const color = workspace.color as CardColor | undefined;
            const borderColor = color ? getCardAccentColor(color, 0.5) : 'var(--sidebar-border)';
            const previewText = getPreviewText(workspace);

            return (
              <div
                key={workspace.id}
                data-workspace-id={workspace.id}
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  if (isSelectionMode) {
                    toggleSelection(e, workspace.id);
                  } else {
                    switchWorkspace(workspace.slug || workspace.id);
                  }
                }}
                onKeyDown={(e) => handleKeyDown(e, () => {
                  if (isSelectionMode) {
                    // We need a synthetic event or just call the logic
                    // toggleSelection expects a MouseEvent, but we can extract logic or mock it
                    // Let's refactor toggleSelection slightly or just pass a mock
                    const newSelected = new Set(selectedIds);
                    if (newSelected.has(workspace.id)) {
                      newSelected.delete(workspace.id);
                    } else {
                      newSelected.add(workspace.id);
                    }
                    setSelectedIds(newSelected);
                  } else {
                    switchWorkspace(workspace.slug || workspace.id);
                  }
                })}
                className={cn(
                  "group relative rounded-md shadow-sm min-h-[180px] overflow-hidden",
                  "hover:shadow-lg",
                  "transition-all duration-200 text-left cursor-pointer",
                  "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background",
                  "flex flex-col"
                )}
                style={{
                  backgroundColor: 'hsl(var(--muted) / 0.4)',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  borderColor: borderColor,
                }}
                onMouseEnter={(e) => {
                  // Debounce prefetching to prevent spam when sweeping across grid
                  prefetchTimeoutRef.current = setTimeout(() => {
                    router.prefetch(`/workspace/${workspace.slug || workspace.id}`);
                  }, 100); // 100ms delay

                  if (!selectedIds.has(workspace.id)) {
                    e.currentTarget.style.borderColor = 'white';
                  }
                }}
                onMouseLeave={(e) => {
                  // Cancel prefetch if user leaves quickly
                  if (prefetchTimeoutRef.current) {
                    clearTimeout(prefetchTimeoutRef.current);
                    prefetchTimeoutRef.current = null;
                  }

                  if (!selectedIds.has(workspace.id)) {
                    e.currentTarget.style.borderColor = borderColor;
                  }
                }}
              >
                {/* Selection Checkbox - Top Left */}
                <div
                  className={cn(
                    "absolute top-3 left-3 z-30 transition-opacity duration-200",
                    selectedIds.has(workspace.id) ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  )}
                  onClick={(e) => e.stopPropagation()} // Stop propagation from div wrapper
                >
                  <Checkbox
                    checked={selectedIds.has(workspace.id)}
                    onCheckedChange={() => {
                      // Manual toggle logic since onCheckedChange handles boolean
                      // functionality happens in onClick of wrapper or custom handler?
                      // Actually pure ShadCN Checkbox handles click events.
                      // But we need to pass event to stop propagation.
                    }}
                    onClick={(e) => toggleSelection(e, workspace.id)}
                    className="data-[state=checked]:bg-primary data-[state=checked]:border-primary border-white/50 bg-black/40 backdrop-blur-sm h-5 w-5"
                  />
                </div>
                {/* Shared Badge */}
                {workspace.isShared && (
                  <div className="absolute top-2 right-2 z-10 flex gap-1.5">
                    {/* New Badge for unseen shared workspaces */}
                    {!workspace.lastOpenedAt && (
                      <div className="bg-blue-600/90 text-foreground text-[10px] px-2 py-0.5 rounded-full flex items-center shadow-lg border border-blue-400 font-semibold animate-pulse dark:text-white">
                        NEW
                      </div>
                    )}
                    <div className="bg-background/80 text-foreground text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 backdrop-blur-sm border border-border shadow-sm">
                      <Users className="h-3 w-3" />
                      <span className="font-medium">Shared</span>
                    </div>
                  </div>
                )}

                {/* Top section - content area */}
                <div className="flex-1 p-3 relative">
                  {previewText ? (
                    <div className="text-sm text-foreground whitespace-pre-wrap line-clamp-3">
                      {previewText}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full pt-8">
                      <IconRenderer
                        icon={workspace.icon}
                        className="h-12 w-12 opacity-30 group-hover:opacity-40 group-hover:scale-110 transition-all duration-200"
                        style={{ color: workspace.color || "hsl(var(--primary))" }}
                      />
                    </div>
                  )}
                </div>

                {/* Bottom section with title, date, menu, and avatar */}
                <div className="flex flex-col justify-end px-4 pb-3 pt-2 relative" style={{ minHeight: '70px' }}>
                  {/* Title */}
                  <h3 className="font-normal text-base text-foreground truncate mb-1 leading-6">
                    {workspace.name}
                  </h3>

                  {/* Date and Avatar Row */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {formatDate(workspace.createdAt)}
                    </span>
                    {/* Settings Toggle */}
                    <button
                      type="button"
                      onClick={(e) => handleSettingsClick(e, workspace)}
                      className="p-1 rounded-md hover:bg-sidebar-accent opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-20"
                    >
                      <MoreVertical className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bulk Action Bar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-foreground text-background px-4 py-2 rounded-full shadow-xl border border-border/20"
          >
            <div className="flex items-center gap-2 pr-4 border-r border-background/20 mr-2">
              <div className="bg-primary text-primary-foreground text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {selectedIds.size}
              </div>
              <span className="text-sm font-medium whitespace-nowrap">Selected</span>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="h-8 hover:bg-background/20 hover:text-background text-background/90"
              onClick={() => setShowShareDialog(true)}
            >
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-8 hover:bg-red-500/20 hover:text-red-400 text-red-400"
              onClick={async () => {
                if (confirm(`Delete ${selectedIds.size} workspaces? This cannot be undone.`)) {
                  const ids = Array.from(selectedIds);
                  clearSelection(); // Clear UI first

                  let successCount = 0;
                  for (const id of ids) {
                    try {
                      await deleteWorkspace(id);
                      successCount++;
                    } catch (err) {
                      console.error(`Failed to delete ${id}`, err);
                    }
                  }

                  if (successCount > 0) {
                    toast.success(`Deleted ${successCount} workspaces`);
                  }
                }
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 ml-2 hover:bg-background/20 hover:text-background rounded-full"
              onClick={clearSelection}
            >
              <X className="h-4 w-4" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <WorkspaceSettingsModal
        workspace={settingsWorkspace}
        open={showSettingsModal}
        onOpenChange={setShowSettingsModal}
        onUpdate={loadWorkspaces}
      />

      {/* Bulk Share Dialog */}
      <ShareWorkspaceDialog
        workspace={null}
        workspaceIds={Array.from(selectedIds)}
        open={showShareDialog}
        onOpenChange={(open) => {
          setShowShareDialog(open);
          if (!open) clearSelection(); // Optional: clear selection after sharing? Or keep it? Keeping it is safer.
          // Actually, usually bulk actions don't clear selection automatically unless it's a "move" or "delete".
          // Let's keep selection.
        }}
      />

      {/* Create Workspace Modal */}
      <CreateWorkspaceModal
        open={showCreateWorkspaceModal}
        onOpenChange={setShowCreateWorkspaceModal}
      />
    </>
  );
}
