"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { FolderPlus, MoreVertical } from "lucide-react";
import { useUIStore } from "@/lib/stores/ui-store";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import CreateWorkspaceModal from "@/components/workspace/CreateWorkspaceModal";
import { useSession } from "@/lib/auth-client";
import { IconRenderer } from "@/hooks/use-icon-picker";
import { cn } from "@/lib/utils";
import WorkspaceSettingsModal from "@/components/workspace/WorkspaceSettingsModal";
import type { WorkspaceWithState } from "@/lib/workspace-state/types";
import { getCardColorCSS, getCardAccentColor, type CardColor } from "@/lib/workspace-state/colors";

interface WorkspaceGridProps {
  searchQuery?: string;
}

export function WorkspaceGrid({ searchQuery = "" }: WorkspaceGridProps) {
  const { showCreateWorkspaceModal, setShowCreateWorkspaceModal } = useUIStore();
  const { workspaces, switchWorkspace, loadWorkspaces } = useWorkspaceContext();
  const { data: session } = useSession();
  const [showSettingsModal, setShowSettingsModal] = useState(false);

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
                  role="button"
                  tabIndex={0}
                  onClick={() => switchWorkspace(workspace.slug || workspace.id)}
                  onKeyDown={(e) => handleKeyDown(e, () => switchWorkspace(workspace.slug || workspace.id))}
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
                    e.currentTarget.style.borderColor = 'white';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = borderColor;
                  }}
                >
                  {/* Top section - content area */}
                  <div className="flex-1 p-3 relative">
                    {previewText ? (
                      <div className="text-sm text-foreground whitespace-pre-wrap line-clamp-3">
                        {previewText}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full">
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

      {/* Settings Modal */}
      <WorkspaceSettingsModal
        workspace={settingsWorkspace}
        open={showSettingsModal}
        onOpenChange={setShowSettingsModal}
        onUpdate={loadWorkspaces}
      />

      {/* Create Workspace Modal */}
      <CreateWorkspaceModal
        open={showCreateWorkspaceModal}
        onOpenChange={setShowCreateWorkspaceModal}
      />
    </>
  );
}
