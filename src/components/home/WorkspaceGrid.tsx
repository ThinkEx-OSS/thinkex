"use client";

import { useState } from "react";
import { FolderPlus, MoreVertical } from "lucide-react";
import { useUIStore } from "@/lib/stores/ui-store";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { IconRenderer } from "@/hooks/use-icon-picker";
import { cn } from "@/lib/utils";
import WorkspaceSettingsModal from "@/components/workspace/WorkspaceSettingsModal";
import type { WorkspaceWithState } from "@/lib/workspace-state/types";
import { getCardColorCSS, getCardAccentColor, type CardColor } from "@/lib/workspace-state/colors";

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
        <div className="mb-4">
          <h2 className="text-lg font-normal text-muted-foreground">Recent workspaces</h2>
        </div>

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
            <h3 className="font-medium text-lg text-foreground group-hover:text-foreground/80 transition-colors text-center">
              New workspace
            </h3>
          </div>

          {/* Existing Workspaces */}
          {workspaces.map((workspace) => {
            const color = workspace.color as CardColor | undefined;
            const bgColor = color ? getCardColorCSS(color, 0.25) : 'var(--card)';
            const borderColor = color ? getCardAccentColor(color, 0.5) : 'var(--sidebar-border)';

            return (
              <div
                key={workspace.id}
                role="button"
                tabIndex={0}
                onClick={() => switchWorkspace(workspace.slug || workspace.id)}
                onKeyDown={(e) => handleKeyDown(e, () => switchWorkspace(workspace.slug || workspace.id))}
                className={cn(
                  "group relative p-4 rounded-md shadow-sm min-h-[180px]",
                  "hover:shadow-lg",
                  "transition-all duration-200 text-left cursor-pointer",
                  "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background",
                  "flex flex-col items-start justify-between"
                )}
                style={{
                  backgroundColor: bgColor,
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
                {/* Title */}
                <h3 className="font-medium text-lg text-foreground truncate group-hover:text-foreground/80 transition-colors w-full relative z-10">
                  {workspace.name}
                </h3>

                {/* Centered Icon */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <IconRenderer
                    icon={workspace.icon}
                    className="h-12 w-12 opacity-30 group-hover:opacity-40 group-hover:scale-110 transition-all duration-200"
                    style={{ color: workspace.color || "hsl(var(--primary))" }}
                  />
                </div>

                {/* Settings Toggle */}
                <button
                  type="button"
                  onClick={(e) => handleSettingsClick(e, workspace)}
                  className="absolute top-3 right-3 p-1.5 rounded-md hover:bg-sidebar-accent opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-20"
                >
                  <MoreVertical className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                </button>
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
    </>
  );
}
