"use client";

import { memo, useCallback, useState, useRef } from "react";
import { Plus, FolderOpen } from "lucide-react";
import { DragDropProvider } from "@dnd-kit/react";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSub,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import WorkspaceItem from "./WorkspaceItem";
import type { WorkspaceWithState } from "@/lib/workspace-state/types";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";

interface WorkspaceListProps {
  workspaces: WorkspaceWithState[];
  currentWorkspaceId?: string;
  currentSlug?: string | null;
  onCreateWorkspace: () => void;
  onWorkspaceClick: (workspaceSlug: string) => void;
  onSettingsClick: (workspace: WorkspaceWithState) => void;
  onShareClick: (workspace: WorkspaceWithState) => void;
}

// Helper function to reorder array based on drag event (similar to @dnd-kit/helpers move)
function moveArray<T>(array: T[], event: any): T[] {
  const { source, target } = event.operation;

  if (!source || !target) return array;
  if (source.id === target.id) return array;

  const sourceIndex = array.findIndex((item: any) => item.id === source.id);
  const targetIndex = array.findIndex((item: any) => item.id === target.id);

  if (sourceIndex === -1 || targetIndex === -1) return array;

  const newArray = [...array];
  const [removed] = newArray.splice(sourceIndex, 1);
  newArray.splice(targetIndex, 0, removed);

  return newArray;
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
  const { reorderWorkspaces } = useWorkspaceContext();

  // Track optimistic reordered state during drag
  const [optimisticOrder, setOptimisticOrder] = useState<string[] | null>(null);
  const previousOrder = useRef<string[]>(workspaces.map(w => w.id));

  // Handle drag over - optimistically update order (like the docs example)
  const handleDragOver = useCallback(
    (event: any) => {
      const { source, target } = event.operation;

      if (!source || !target || source.id === target.id) return;

      const sourceWorkspace = workspaces.find(w => w.id === source.id);
      const targetWorkspace = workspaces.find(w => w.id === target.id);

      if (!sourceWorkspace || !targetWorkspace) return;

      // Use move helper to calculate new order
      const reordered = moveArray(workspaces, event);
      const newOrder = reordered.map(w => w.id);

      setOptimisticOrder(newOrder);
    },
    [workspaces]
  );

  // Handle drag end event - persist the final order
  const handleDragEnd = useCallback(
    (event: any) => {
      const { operation, canceled } = event;

      // If canceled, revert to previous order
      if (canceled) {
        setOptimisticOrder(null);
        return;
      }

      // Use the optimistic order if available, otherwise try to calculate from event
      let finalOrder: string[];

      if (optimisticOrder) {
        // Use the optimistic order that was set during drag
        finalOrder = optimisticOrder;
      } else if (operation?.source && operation?.target && operation.source.id !== operation.target.id) {
        // Fallback: calculate from event operation
        const reordered = moveArray(workspaces, event);
        finalOrder = reordered.map(w => w.id);
      } else {
        setOptimisticOrder(null);
        return;
      }

      // Check if order actually changed
      const currentOrder = workspaces.map(w => w.id);
      if (JSON.stringify(finalOrder) === JSON.stringify(currentOrder)) {
        setOptimisticOrder(null);
        return;
      }

      // Persist to backend
      reorderWorkspaces(finalOrder);

      // Clear optimistic state
      setOptimisticOrder(null);
      previousOrder.current = finalOrder;
    },
    [workspaces, reorderWorkspaces, optimisticOrder]
  );

  // Handle drag start - save previous order for revert if canceled
  const handleDragStart = useCallback(() => {
    previousOrder.current = workspaces.map(w => w.id);
    setOptimisticOrder(null);
  }, [workspaces]);

  // Get current order to display (optimistic or actual)
  const displayOrder = optimisticOrder || workspaces.map(w => w.id);
  const displayWorkspaces = displayOrder
    .map(id => workspaces.find(w => w.id === id))
    .filter((w): w is WorkspaceWithState => w !== undefined);

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
          {/* Workspaces with drag-and-drop */}
          <DragDropProvider
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            {displayWorkspaces.map((workspace, index) => (
              <WorkspaceItem
                key={workspace.id}
                workspace={workspace}
                index={index}
                isActive={currentSlug === workspace.slug || currentWorkspaceId === workspace.id}
                onWorkspaceClick={onWorkspaceClick}
                onSettingsClick={onSettingsClick}
                onShareClick={onShareClick}
              />
            ))}
          </DragDropProvider>

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

