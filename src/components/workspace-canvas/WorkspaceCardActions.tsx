"use client";

import type { CSSProperties, ComponentType, MouseEvent, ReactNode } from "react";
import {
  MoreVertical,
  Trash2,
  Palette,
  CheckCircle2,
  FolderInput,
  X,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Item } from "@/lib/workspace-state/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";

type MenuItemComponent = ComponentType<{
  onSelect?: () => void;
  className?: string;
  children: ReactNode;
}>;

type MenuSeparatorComponent = ComponentType<Record<string, never>>;

interface WorkspaceCardMenuItemsProps {
  itemType: Item["type"];
  canMove: boolean;
  onOpenRename: () => void;
  onOpenMove: () => void;
  onOpenColorPicker: () => void;
  onDelete: () => void;
  MenuItem: MenuItemComponent;
  MenuSeparator: MenuSeparatorComponent;
}

function stopCardPropagation(event: MouseEvent<HTMLElement>) {
  event.stopPropagation();
}

function preventCardMouseDown(event: MouseEvent<HTMLElement>) {
  event.preventDefault();
  event.stopPropagation();
}

function WorkspaceCardMenuItems({
  itemType,
  canMove,
  onOpenRename,
  onOpenMove,
  onOpenColorPicker,
  onDelete,
  MenuItem,
  MenuSeparator,
}: WorkspaceCardMenuItemsProps) {
  return (
    <>
      <MenuItem onSelect={onOpenRename}>
        <Pencil className="mr-2 h-4 w-4" />
        <span>Rename</span>
      </MenuItem>
      {canMove && (
        <>
          <MenuItem onSelect={onOpenMove}>
            <FolderInput className="mr-2 h-4 w-4" />
            <span>Move to</span>
          </MenuItem>
          <MenuSeparator />
        </>
      )}
      <MenuItem onSelect={onOpenColorPicker}>
        <Palette className="mr-2 h-4 w-4" />
        <span>Change Color</span>
      </MenuItem>
      <MenuSeparator />
      <MenuItem
        onSelect={onDelete}
        className="text-destructive focus:text-destructive"
      >
        <Trash2 className="mr-2 h-4 w-4" />
        <span>Delete</span>
      </MenuItem>
    </>
  );
}

const floatingControlButtonClassName =
  "inline-flex h-8 items-center justify-center rounded-xl text-white/90 hover:text-white hover:shadow-lg transition-all duration-200 cursor-pointer";

function getFloatingControlStyle(backgroundColor: string): CSSProperties {
  return {
    backgroundColor,
    backdropFilter: "blur(8px)",
  };
}

function getFloatingControlHandlers({
  defaultBackgroundColor,
  hoverBackgroundColor,
  onClick,
}: {
  defaultBackgroundColor: string;
  hoverBackgroundColor: string;
  onClick?: () => void;
}) {
  return {
    onMouseDown: preventCardMouseDown,
    onMouseEnter: (event: MouseEvent<HTMLButtonElement>) => {
      event.currentTarget.style.backgroundColor = hoverBackgroundColor;
    },
    onMouseLeave: (event: MouseEvent<HTMLButtonElement>) => {
      event.currentTarget.style.backgroundColor = defaultBackgroundColor;
    },
    onClick: (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onClick?.();
    },
  };
}

interface WorkspaceCardControlsProps {
  itemType: Item["type"];
  useDarkOverlay: boolean;
  resolvedTheme?: string;
  isSelected: boolean;
  canMove: boolean;
  selectionLabel?: string;
  settingsLabel?: string;
  onToggleSelection: () => void;
  onOpenRename: () => void;
  onOpenMove: () => void;
  onOpenColorPicker: () => void;
  onDelete: () => void;
}

export function WorkspaceCardControls({
  itemType,
  useDarkOverlay,
  resolvedTheme,
  isSelected,
  canMove,
  selectionLabel = "card",
  settingsLabel = "Card settings",
  onToggleSelection,
  onOpenRename,
  onOpenMove,
  onOpenColorPicker,
  onDelete,
}: WorkspaceCardControlsProps) {
  const defaultBackgroundColor = useDarkOverlay
    ? "rgba(0, 0, 0, 0.6)"
    : resolvedTheme === "dark"
      ? "rgba(255, 255, 255, 0.1)"
      : "rgba(0, 0, 0, 0.2)";
  const defaultHoverBackgroundColor = useDarkOverlay
    ? "rgba(0, 0, 0, 0.8)"
    : resolvedTheme === "dark"
      ? "rgba(0, 0, 0, 0.5)"
      : "rgba(0, 0, 0, 0.3)";
  const selectionBackgroundColor = isSelected
    ? useDarkOverlay
      ? "rgba(239, 68, 68, 0.4)"
      : "rgba(239, 68, 68, 0.3)"
    : defaultBackgroundColor;
  const selectionHoverBackgroundColor = isSelected
    ? useDarkOverlay
      ? "rgba(239, 68, 68, 0.6)"
      : "rgba(239, 68, 68, 0.5)"
    : defaultHoverBackgroundColor;
  const selectionHandlers = getFloatingControlHandlers({
    defaultBackgroundColor: selectionBackgroundColor,
    hoverBackgroundColor: selectionHoverBackgroundColor,
    onClick: onToggleSelection,
  });
  const settingsHandlers = getFloatingControlHandlers({
    defaultBackgroundColor,
    hoverBackgroundColor: defaultHoverBackgroundColor,
  });

  return (
    <div className="absolute top-3 right-3 z-20 flex items-center gap-2 opacity-0 group-hover:opacity-100">
      <button
        type="button"
        aria-label={isSelected ? `Deselect ${selectionLabel}` : `Select ${selectionLabel}`}
        title={isSelected ? `Deselect ${selectionLabel}` : `Select ${selectionLabel}`}
        className={cn(floatingControlButtonClassName, "w-8 hover:scale-110")}
        style={getFloatingControlStyle(selectionBackgroundColor)}
        {...selectionHandlers}
      >
        {isSelected ? <X className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={settingsLabel}
            title={settingsLabel}
            className={cn(floatingControlButtonClassName, "w-8 hover:scale-110")}
            style={getFloatingControlStyle(defaultBackgroundColor)}
            {...settingsHandlers}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-48"
          onClick={stopCardPropagation}
        >
          <WorkspaceCardMenuItems
            itemType={itemType}
            canMove={canMove}
            onOpenRename={onOpenRename}
            onOpenMove={onOpenMove}
            onOpenColorPicker={onOpenColorPicker}
            onDelete={onDelete}
            MenuItem={DropdownMenuItem}
            MenuSeparator={DropdownMenuSeparator}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

interface WorkspaceCardContextMenuItemsProps {
  itemType: Item["type"];
  canMove: boolean;
  onOpenRename: () => void;
  onOpenMove: () => void;
  onOpenColorPicker: () => void;
  onDelete: () => void;
}

export function WorkspaceCardContextMenuItems(
  props: WorkspaceCardContextMenuItemsProps,
) {
  return (
    <WorkspaceCardMenuItems
      {...props}
      MenuItem={ContextMenuItem}
      MenuSeparator={ContextMenuSeparator}
    />
  );
}
