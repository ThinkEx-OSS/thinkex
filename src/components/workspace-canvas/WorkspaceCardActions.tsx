"use client";

import type { ComponentType, MouseEvent, ReactNode } from "react";
import { MoreVertical, Trash2, Palette, CheckCircle2, FolderInput, X, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
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

function getControlHandlers(onClick?: () => void) {
  return {
    onMouseDown: preventCardMouseDown,
    onClick: (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onClick?.();
    },
  };
}

interface WorkspaceCardControlsProps {
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
  const buttonClassName = cn(
    "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground outline-hidden transition-colors",
    "hover:bg-black/10 dark:hover:bg-white/14 hover:text-foreground",
    "focus-visible:ring-2 focus-visible:ring-sidebar-ring/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
    "hover:text-foreground",
  );
  const selectionClassName = isSelected
    ? "bg-red-500/18 hover:bg-red-500/24"
    : "";

  return (
    <div
      className={cn(
        "flex max-w-0 shrink-0 items-center gap-1 overflow-hidden opacity-0 pointer-events-none transition-[max-width,opacity] duration-200",
        "group-hover:max-w-24 group-hover:opacity-100 group-hover:pointer-events-auto",
        "has-[button[data-state=open]]:max-w-24 has-[button[data-state=open]]:opacity-100 has-[button[data-state=open]]:pointer-events-auto",
      )}
    >
      <button
        type="button"
        aria-label={isSelected ? `Deselect ${selectionLabel}` : `Select ${selectionLabel}`}
        title={isSelected ? `Deselect ${selectionLabel}` : `Select ${selectionLabel}`}
        className={cn(buttonClassName, selectionClassName)}
        {...getControlHandlers(onToggleSelection)}
      >
        {isSelected ? <X className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={settingsLabel}
            title={settingsLabel}
            className={buttonClassName}
            {...getControlHandlers()}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-48"
          onClick={stopCardPropagation}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
          }}
        >
          <WorkspaceCardMenuItems
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
