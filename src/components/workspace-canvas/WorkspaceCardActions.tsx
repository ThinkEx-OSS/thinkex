"use client";

import type { ComponentType, MouseEvent, ReactNode } from "react";
import {
  MoreVertical,
  Trash2,
  Palette,
  CheckCircle2,
  FolderInput,
  Copy,
  X,
  Pencil,
} from "lucide-react";
import { PiMouseScrollFill, PiMouseScrollBold } from "react-icons/pi";
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
  onCopyMarkdown: () => void;
  onOpenColorPicker: () => void;
  onDelete: () => void;
  MenuItem: MenuItemComponent;
  MenuSeparator: MenuSeparatorComponent;
}

function stopCardPropagation(event: MouseEvent<HTMLElement>) {
  event.stopPropagation();
}

function WorkspaceCardMenuItems({
  itemType,
  canMove,
  onOpenRename,
  onOpenMove,
  onCopyMarkdown,
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
      {itemType === "document" && (
        <>
          <MenuItem onSelect={onCopyMarkdown}>
            <Copy className="mr-2 h-4 w-4" />
            <span>Copy Markdown</span>
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

function getFloatingControlStyle(backgroundColor: string): React.CSSProperties {
  return {
    backgroundColor,
    backdropFilter: "blur(8px)",
  };
}

interface WorkspaceCardControlsProps {
  itemType: Item["type"];
  showScrollLockButton: boolean;
  useDarkOverlay: boolean;
  resolvedTheme?: string;
  isScrollLocked: boolean;
  isSelected: boolean;
  isEditingTitle: boolean;
  canMove: boolean;
  onToggleScrollLock: () => void;
  onToggleSelection: () => void;
  onOpenRename: () => void;
  onOpenMove: () => void;
  onCopyMarkdown: () => void;
  onOpenColorPicker: () => void;
  onDelete: () => void;
}

export function WorkspaceCardControls({
  itemType,
  showScrollLockButton,
  useDarkOverlay,
  resolvedTheme,
  isScrollLocked,
  isSelected,
  isEditingTitle,
  canMove,
  onToggleScrollLock,
  onToggleSelection,
  onOpenRename,
  onOpenMove,
  onCopyMarkdown,
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

  return (
    <div
      className={cn(
        "absolute top-3 right-3 z-20 flex items-center gap-2",
        isEditingTitle ? "" : "opacity-0 group-hover:opacity-100",
      )}
    >
      {showScrollLockButton && (
        <button
          type="button"
          aria-label={
            isScrollLocked ? "Click to unlock scroll" : "Click to lock scroll"
          }
          title={
            isScrollLocked ? "Click to unlock scroll" : "Click to lock scroll"
          }
          className={cn(
            floatingControlButtonClassName,
            "gap-1.5 pl-2.5 pr-3 hover:scale-105",
          )}
          style={getFloatingControlStyle(defaultBackgroundColor)}
          onMouseDown={(event) => {
            event.stopPropagation();
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.backgroundColor =
              defaultHoverBackgroundColor;
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.backgroundColor = defaultBackgroundColor;
          }}
          onClick={(event) => {
            event.stopPropagation();
            onToggleScrollLock();
          }}
        >
          {isScrollLocked ? (
            <PiMouseScrollFill className="h-4 w-4 shrink-0" />
          ) : (
            <PiMouseScrollBold className="h-4 w-4 shrink-0" />
          )}
          <span
            className={cn(
              "text-xs font-medium",
              resolvedTheme === "dark" ? "text-white/90" : "text-white/80",
            )}
          >
            {isScrollLocked ? "Scroll" : "Lock"}
          </span>
        </button>
      )}

      <button
        type="button"
        aria-label={isSelected ? "Deselect card" : "Select card"}
        title={isSelected ? "Deselect card" : "Select card"}
        className={cn(floatingControlButtonClassName, "w-8 hover:scale-110")}
        style={getFloatingControlStyle(selectionBackgroundColor)}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.backgroundColor =
            selectionHoverBackgroundColor;
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.backgroundColor = selectionBackgroundColor;
        }}
        onClick={(event) => {
          event.stopPropagation();
          onToggleSelection();
        }}
      >
        {isSelected ? <X className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Card settings"
            title="Card settings"
            className={cn(floatingControlButtonClassName, "w-8 hover:scale-110")}
            style={getFloatingControlStyle(defaultBackgroundColor)}
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.backgroundColor =
                defaultHoverBackgroundColor;
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.backgroundColor = defaultBackgroundColor;
            }}
            onClick={(event) => {
              event.stopPropagation();
            }}
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
            onCopyMarkdown={onCopyMarkdown}
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
  onCopyMarkdown: () => void;
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
