"use client";

import type { ReactNode } from "react";
import { Feedback } from "@dnd-kit/dom";
import { useSortable } from "@dnd-kit/react/sortable";
import type { Item } from "@/lib/workspace-state/types";
import { cn } from "@/lib/utils";
import { WorkspaceCardDragHandle } from "./WorkspaceCardDragHandle";

export type WorkspaceGridLane = "folders" | "items";

export function getWorkspaceSortableGroup(
  containerId: string | null | undefined,
  lane: WorkspaceGridLane,
): string {
  return `${containerId ?? "root"}:${lane}`;
}

interface SortableWorkspaceGridItemProps {
  item: Item;
  index: number;
  lane: WorkspaceGridLane;
  containerId: string | null;
  className?: string;
  children: (props: {
    dragHandle: ReactNode;
    isDragging: boolean;
    isDropTarget: boolean;
  }) => ReactNode;
}

export function SortableWorkspaceGridItem({
  item,
  index,
  lane,
  containerId,
  className,
  children,
}: SortableWorkspaceGridItemProps) {
  const group = getWorkspaceSortableGroup(containerId, lane);
  const sortableType = lane === "folders" ? "folder" : "item";
  const { ref, handleRef, isDragging, isDropTarget } = useSortable({
    id: item.id,
    index,
    group,
    type: sortableType,
    accept: sortableType,
    plugins: [Feedback.configure({ feedback: "clone" })],
    data: {
      group,
      lane,
      containerId,
      itemId: item.id,
    },
  });

  return (
    <div
      ref={ref as (element: HTMLDivElement | null) => void}
      className={cn(
        "size-full rounded-md transition-[box-shadow,opacity,transform] duration-150",
        className,
        isDragging && "z-20 opacity-70",
        isDropTarget && !isDragging && "ring-2 ring-primary/30 ring-offset-2 ring-offset-background",
      )}
      style={{
        opacity: isDragging ? 0.7 : undefined,
        transform: isDragging ? "scale(0.985)" : undefined,
        filter: isDragging
          ? "drop-shadow(0 12px 24px rgba(0, 0, 0, 0.18))"
          : undefined,
      }}
    >
      {children({
        dragHandle: (
          <WorkspaceCardDragHandle
            ref={handleRef as (element: HTMLButtonElement | null) => void}
            label={lane === "folders" ? "Reorder folder" : "Reorder card"}
          />
        ),
        isDragging,
        isDropTarget,
      })}
    </div>
  );
}
