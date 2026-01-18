"use client";

import { useState } from "react";
import { FolderPlus, MoreVertical } from "lucide-react";
import { useUIStore } from "@/lib/stores/ui-store";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { IconRenderer } from "@/hooks/use-icon-picker";
import { cn } from "@/lib/utils";
import WorkspaceSettingsModal from "@/components/workspace/WorkspaceSettingsModal";
import type { WorkspaceWithState } from "@/lib/workspace-state/types";

export function WorkspaceGrid() {
  const { setShowCreateWorkspaceModal } = useUIStore();
  const { workspaces, switchWorkspace, loadWorkspaces } = useWorkspaceContext();
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsWorkspace, setSettingsWorkspace] = useState<WorkspaceWithState | null>(null);

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
      <div className="w-full max-w-6xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-normal text-muted-foreground">Your workspaces</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Create New Card - First */}
          <div
            role="button"
            tabIndex={0}
            onClick={handleCreateNew}
            onKeyDown={(e) => handleKeyDown(e, handleCreateNew)}
            className={cn(
              "group relative px-4 py-8 rounded-md border-2 border-dashed border-sidebar-border bg-sidebar/20 backdrop-blur-sm aspect-[3.5/1]",
              "hover:border-primary/50 hover:bg-primary/5 hover:shadow-md",
              "transition-all duration-300 cursor-pointer",
              "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background",
              "flex flex-col items-center justify-start"
            )}
          >
            {/* Icon and Title */}
            <div className="flex flex-col items-center gap-8">
              <div className="flex-shrink-0 w-16 h-16 rounded-md flex items-center justify-center bg-primary/20 group-hover:bg-primary/30 transition-colors">
                <FolderPlus className="h-8 w-8 text-primary" />
              </div>
              <div className="min-w-0 w-full">
                <h3 className="font-medium text-xl text-muted-foreground group-hover:text-primary transition-colors text-center truncate w-full">
                  Create new workspace
                </h3>
              </div>
            </div>
          </div>

          {/* Existing Workspaces */}
          {workspaces.map((workspace) => (
            <div
              key={workspace.id}
              role="button"
              tabIndex={0}
              onClick={() => switchWorkspace(workspace.slug || workspace.id)}
              onKeyDown={(e) => handleKeyDown(e, () => switchWorkspace(workspace.slug || workspace.id))}
              className={cn(
                "group relative px-4 py-8 rounded-md border border-sidebar-border/50 backdrop-blur-sm aspect-[3.5/1]",
                "hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5",
                "transition-all duration-300 text-left cursor-pointer",
                "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background",
                "flex flex-col items-start justify-between"
              )}
            >
              {/* Dynamic Background Tint */}
              <div
                className="absolute inset-0 rounded-md opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none"
                style={{ backgroundColor: workspace.color || "hsl(var(--primary))" }}
              />

              {/* Icon and Title */}
              <div className="flex flex-col gap-8 w-full">
                <div
                  className="flex-shrink-0 w-16 h-16 rounded-md flex items-center justify-center bg-sidebar-accent shadow-sm"
                  style={{
                    backgroundColor: workspace.color ? `color-mix(in srgb, ${workspace.color}, transparent 70%)` : undefined,
                  }}
                >
                  <IconRenderer
                    icon={workspace.icon}
                    className="h-8 w-8"
                    style={{ color: workspace.color || "hsl(var(--primary))" }}
                  />
                </div>
                <div className="min-w-0 w-full">
                  <h3 className="font-medium text-xl text-foreground truncate group-hover:text-primary transition-colors w-full">
                    {workspace.name}
                  </h3>
                </div>
              </div>

              {/* Settings Toggle */}
              <button
                type="button"
                onClick={(e) => handleSettingsClick(e, workspace)}
                className="absolute top-3 right-3 p-1.5 rounded-md hover:bg-sidebar-accent opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                <MoreVertical className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Settings Modal */}
      <WorkspaceSettingsModal
        workspace={settingsWorkspace}
        open={showSettingsModal}
        onOpenChange={setShowSettingsModal}
        onUpdate={loadWorkspaces}
      />
    </>
  );
}
