"use client";

import { useState, useCallback, memo } from "react";
import { Globe, Settings, MoreVertical } from "lucide-react";
import { FiShare } from "react-icons/fi";
import {
  SidebarMenuSubItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandList,
} from "@/components/ui/command";
import { SwatchesPicker, ColorResult } from "react-color";
import { SWATCHES_COLOR_GROUPS, type CardColor } from "@/lib/workspace-state/colors";
import type { WorkspaceWithState } from "@/lib/workspace-state/types";
import { useIconPicker } from "@/hooks/use-icon-picker";
import { IconRenderer } from "@/hooks/use-icon-picker";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { cn } from "@/lib/utils";

interface WorkspaceItemProps {
  workspace: WorkspaceWithState;
  isActive: boolean;
  onWorkspaceClick: (workspaceSlug: string) => void;
  onSettingsClick: (workspace: WorkspaceWithState) => void;
  onShareClick: (workspace: WorkspaceWithState) => void;
}

function WorkspaceItem({
  workspace,
  isActive,
  onWorkspaceClick,
  onSettingsClick,
  onShareClick,
}: WorkspaceItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const { updateWorkspaceLocal } = useWorkspaceContext();
  const { search, setSearch, icons } = useIconPicker();

  const handleMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleMouseLeave = useCallback(() => setIsHovered(false), []);
  const handleClick = useCallback(() => onWorkspaceClick(workspace.slug || workspace.id), [onWorkspaceClick, workspace.slug, workspace.id]);

  const handleSettings = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSettingsClick(workspace);
    },
    [onSettingsClick, workspace]
  );

  const handleShare = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onShareClick(workspace);
    },
    [onShareClick, workspace]
  );

  const handleIconChange = useCallback(
    async (icon: string | null) => {
      try {
        const response = await fetch(`/api/workspaces/${workspace.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ icon }),
        });

        if (response.ok) {
          // Optimistically update just this workspace locally
          updateWorkspaceLocal(workspace.id, { icon });
          setIsPickerOpen(false);
        }
      } catch (error) {
        console.error("Error updating workspace icon:", error);
      }
    },
    [workspace.id, updateWorkspaceLocal]
  );

  const handleColorChange = useCallback(
    async (color: CardColor) => {
      try {
        const response = await fetch(`/api/workspaces/${workspace.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ color }),
        });

        if (response.ok) {
          // Optimistically update just this workspace locally
          updateWorkspaceLocal(workspace.id, { color });
          setIsPickerOpen(false);
        }
      } catch (error) {
        console.error("Error updating workspace color:", error);
      }
    },
    [workspace.id, updateWorkspaceLocal]
  );

  const handleSelectIcon = useCallback(
    (iconName: string) => {
      // If clicking the same icon, clear it
      if (workspace.icon === iconName) {
        handleIconChange(null);
      } else {
        handleIconChange(iconName);
      }
    },
    [workspace.icon, handleIconChange]
  );

  const handleIconClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
    },
    []
  );

  return (
    <SidebarMenuSubItem
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ cursor: "pointer" }}
    >
      <div className="relative w-full">
        <SidebarMenuButton
          asChild
          onClick={handleClick}
          size="sm"
          className={cn(
            "group/workspace w-full cursor-pointer p-0",
            isActive ? "bg-accent text-accent-foreground" : ""
          )}
          style={{ cursor: "inherit" }}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0 px-1 py-1">
            {workspace.isPublic && (
              <Globe className="size-3 text-muted-foreground flex-shrink-0" />
            )}
            <div className="flex items-center flex-shrink-0">
              <Popover open={isPickerOpen} onOpenChange={setIsPickerOpen}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        onClick={handleIconClick}
                        className="hover:opacity-80 transition-all duration-200 flex items-center cursor-pointer hover:scale-110"
                      >
                        <IconRenderer
                          icon={workspace.icon}
                          className="size-4"
                          style={{
                            color: workspace.color || undefined,
                          }}
                        />
                      </button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={6}>
                    Modify icon
                  </TooltipContent>
                </Tooltip>
                <PopoverContent
                  className="w-[420px] p-0"
                  align="start"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Tabs defaultValue="icon" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mx-0 rounded-none border-b">
                      <TabsTrigger value="icon" className="rounded-none">Icon</TabsTrigger>
                      <TabsTrigger value="color" className="rounded-none">Color</TabsTrigger>
                    </TabsList>

                    <TabsContent value="icon" className="p-2 m-0">
                      <Command>
                        <CommandInput
                          placeholder="Search icons..."
                          value={search}
                          onValueChange={setSearch}
                        />
                        <CommandList>
                          <CommandEmpty>No icons found.</CommandEmpty>
                        </CommandList>
                        <div className="p-2">
                          <div className="grid grid-cols-8 gap-1 max-h-[300px] overflow-y-auto">
                            {icons.map((icon) => {
                              const IconComponent = icon.Component;
                              const isSelected = workspace.icon === icon.name;
                              return (
                                <button
                                  key={icon.name}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectIcon(icon.name);
                                  }}
                                  className={cn(
                                    "flex items-center justify-center aspect-square p-2 cursor-pointer rounded-md transition-colors border",
                                    isSelected
                                      ? "bg-primary text-primary-foreground border-primary"
                                      : "hover:bg-accent border-transparent"
                                  )}
                                  title={icon.friendly_name}
                                >
                                  <IconComponent
                                    className="size-5"
                                    style={{
                                      color: workspace.color || undefined,
                                    }}
                                  />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </Command>
                    </TabsContent>

                    <TabsContent value="color" className="p-4 m-0">
                      <div className="flex justify-center color-picker-wrapper">
                        <SwatchesPicker
                          color={workspace.color || '#3B82F6'}
                          colors={SWATCHES_COLOR_GROUPS}
                          onChangeComplete={(color: ColorResult) => {
                            handleColorChange(color.hex as CardColor);
                          }}
                        />
                      </div>
                    </TabsContent>
                  </Tabs>
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex-1 min-w-0">
              <div className={cn(
                "truncate text-xs font-medium",
                (isHovered || isDropdownOpen) ? "pr-6" : ""
              )}>
                {workspace.name}
              </div>
            </div>
          </div>
        </SidebarMenuButton>

        {/* Three dots menu button - appears on hover or when dropdown is open */}
        {(isHovered || isDropdownOpen) && (
          <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <button
                data-menu-button
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded hover:bg-sidebar-accent flex-shrink-0 z-50 pointer-events-auto cursor-pointer"
                onClick={(e: React.MouseEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onMouseDown={(e: React.MouseEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onMouseUp={(e: React.MouseEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                type="button"
              >
                <MoreVertical className="size-3.5 text-muted-foreground pointer-events-none" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setIsDropdownOpen(false);
                  onShareClick(workspace);
                }}
                className="cursor-pointer"
              >
                <FiShare className="mr-2 h-4 w-4" />
                Share
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setIsDropdownOpen(false);
                  onSettingsClick(workspace);
                }}
                className="cursor-pointer"
              >
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </SidebarMenuSubItem>
  );
}

// Memoize to prevent unnecessary re-renders
export default memo(WorkspaceItem, (prevProps, nextProps) => {
  return (
    prevProps.workspace.id === nextProps.workspace.id &&
    prevProps.workspace.name === nextProps.workspace.name &&
    prevProps.workspace.slug === nextProps.workspace.slug &&
    prevProps.workspace.icon === nextProps.workspace.icon &&
    prevProps.workspace.color === nextProps.workspace.color &&
    prevProps.isActive === nextProps.isActive &&
    prevProps.onWorkspaceClick === nextProps.onWorkspaceClick &&
    prevProps.onSettingsClick === nextProps.onSettingsClick &&
    prevProps.onShareClick === nextProps.onShareClick
  );
});

