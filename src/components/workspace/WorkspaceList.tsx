"use client";

import { memo } from "react";
import { Plus, FolderOpen } from "lucide-react";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSub,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import WorkspaceItem from "./WorkspaceItem";
import type { WorkspaceWithState } from "@/lib/workspace-state/types";

interface WorkspaceListProps {
  workspaces: WorkspaceWithState[];
  currentWorkspaceId?: string;
  currentSlug?: string | null;
  onCreateWorkspace: () => void;
  onWorkspaceClick: (workspaceSlug: string) => void;
  onSettingsClick: (workspace: WorkspaceWithState) => void;
  onShareClick: (workspace: WorkspaceWithState) => void;
}

function WorkspaceList({
  workspaces,
  currentWorkspaceId,
  currentSlug,
  onCreateWorkspace,
  onWorkspaceClick,
  onSettingsClick,
  onShareClick,
}: WorkspaceListProps) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div className="flex items-center gap-2 px-3 py-2 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:justify-center">
          <div className="group-data-[collapsible=icon]:cursor-pointer">
            <FolderOpen className="size-4 text-blue-400" />
          </div>
          <div className="flex items-center gap-2 flex-1 group-data-[collapsible=icon]:hidden">
            <span className="truncate">Workspaces</span>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 ml-auto hover:bg-sidebar-accent group-data-[collapsible=icon]:hidden transition-transform duration-200 hover:scale-110"
                onClick={onCreateWorkspace}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              Create new workspace
            </TooltipContent>
          </Tooltip>
        </div>

        <SidebarMenuSub className="group-data-[collapsible=icon]:hidden">
          {/* Workspaces list */}
          {workspaces.map((workspace) => (
            <WorkspaceItem
              key={workspace.id}
              workspace={workspace}
              isActive={currentSlug === workspace.slug || currentWorkspaceId === workspace.id}
              onWorkspaceClick={onWorkspaceClick}
              onSettingsClick={onSettingsClick}
              onShareClick={onShareClick}
            />
          ))}

          {/* Empty state */}
          {workspaces.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              No workspaces yet
            </div>
          )}
        </SidebarMenuSub>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

// Memoize to prevent unnecessary re-renders
export default memo(WorkspaceList);

