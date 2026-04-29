"use client";

import { memo, useMemo, useCallback, useState } from "react";
import { ChevronRight, FolderOpen, Folder as FolderIcon, MoreVertical, Trash2, Pencil, FolderInput } from "lucide-react";
import {
    SidebarMenu,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuButton,
    SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import {
    Collapsible,
    CollapsibleContent,
} from "@/components/ui/collapsible";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentWorkspaceId } from "@/contexts/WorkspaceContext";
import {
  useWorkspaceItems,
  useWorkspaceItemsLoading,
} from "@/hooks/workspace/use-workspace-items";
import { useWorkspaceOperations } from "@/hooks/workspace/use-workspace-operations";
import { useUIStore } from "@/lib/stores/ui-store";
import type { Item, CardType } from "@/lib/workspace-state/types";
import { getChildFolders, getFolderPath } from "@/lib/workspace-state/search";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { WorkspaceItemTypeIcon } from "@/components/workspace/WorkspaceItemTypeIcon";
import { WorkspaceCardDialogs } from "@/components/workspace-canvas/WorkspaceCardDialogs";
import { useItemActionDialogs } from "@/hooks/workspace/use-item-action-dialogs";

function getCardTypeIcon(type: CardType) {
    return <WorkspaceItemTypeIcon type={type} className="size-3.5" />;
}

interface SidebarItemProps {
    item: Item;
    allItems: Item[];
    workspaceName: string;
    workspaceIcon?: string | null;
    workspaceColor?: string | null;
    onItemClick: (item: Item) => void;
    onDeleteItem?: (itemId: string) => void;
    onRenameItem?: (itemId: string, newName: string) => void;
    onMoveItem?: (itemId: string, folderId: string | null) => void;
    isNested?: boolean;
}

function SidebarItem({ item, allItems, workspaceName, workspaceIcon, workspaceColor, onItemClick, onDeleteItem, onRenameItem, onMoveItem, isNested = false }: SidebarItemProps) {
    const [isHovered, setIsHovered] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const actions = useItemActionDialogs({
        item,
        onDeleteItem: onDeleteItem ? (id) => { onDeleteItem(id); } : () => {},
        onUpdateItem: onRenameItem ? (id, updates) => { if (updates.name !== undefined) onRenameItem(id, updates.name as string); } : () => {},
        onMoveItem: onMoveItem ? (id, folderId) => { onMoveItem(id, folderId); toast.success('Item moved'); } : undefined,
    });

    const Wrapper = isNested ? SidebarMenuSubItem : SidebarMenuItem;

    const content = (
        <Wrapper>
            <div
                className="relative w-full"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                <SidebarMenuButton
                    size={isNested ? "sm" : undefined}
                    className="w-full cursor-pointer p-0"
                    onClick={(e: React.MouseEvent) => {
                        if ((e.target as HTMLElement).closest('[data-menu-button]')) {
                            e.stopPropagation();
                            return;
                        }
                        onItemClick(item);
                    }}
                >
                    {isNested ? (
                        <div className="flex items-center gap-2 px-1 py-1 w-full">
                            {getCardTypeIcon(item.type)}
                            <span className={cn("flex-1 text-xs", (isHovered || isDropdownOpen) ? "truncate pr-6" : "truncate")}>
                                {item.name || "Untitled"}
                            </span>
                        </div>
                    ) : (
                        <div className="flex items-center w-full">
                            <div className="px-1 py-2 flex items-center justify-center flex-shrink-0 w-6">
                                {getCardTypeIcon(item.type)}
                            </div>
                            <div className={cn(
                                "flex-1 flex items-center px-1 py-1 rounded cursor-pointer min-w-0"
                            )}>
                                <span className={cn("flex-1 text-xs", (isHovered || isDropdownOpen) ? "truncate pr-6" : "truncate")}>
                                    {item.name || "Untitled"}
                                </span>
                            </div>
                        </div>
                    )}
                </SidebarMenuButton>
                {(isHovered || isDropdownOpen) && (onDeleteItem || onRenameItem) && (
                    <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
                        <DropdownMenuTrigger asChild>
                            <button
                                data-menu-button
                                className={cn(
                                    "absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center rounded hover:bg-sidebar-accent flex-shrink-0 z-50 pointer-events-auto cursor-pointer",
                                    isNested ? "h-5 w-5" : "h-6 w-6"
                                )}
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                }}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                }}
                                onMouseUp={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                }}
                                type="button"
                            >
                                <MoreVertical className={cn(
                                    "text-muted-foreground pointer-events-none",
                                    isNested ? "size-3" : "size-3.5"
                                )} />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            align="end"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {onRenameItem && (
                                <DropdownMenuItem
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsDropdownOpen(false);
                                        actions.requestRename();
                                    }}
                                >
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Rename
                                </DropdownMenuItem>
                            )}
                            {onMoveItem && (
                                <DropdownMenuItem
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsDropdownOpen(false);
                                        actions.requestMove();
                                    }}
                                >
                                    <FolderInput className="mr-2 h-4 w-4" />
                                    Move to
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsDropdownOpen(false);
                                    actions.requestDelete();
                                }}
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>
            <WorkspaceCardDialogs
                item={item}
                allItems={allItems}
                workspaceName={workspaceName}
                workspaceIcon={workspaceIcon}
                workspaceColor={workspaceColor}
                isColorPickerOpen={false}
                onColorPickerOpenChange={() => {}}
                showDeleteDialog={actions.showDeleteDialog}
                onDeleteDialogChange={actions.setShowDeleteDialog}
                showMoveDialog={actions.showMoveDialog}
                onMoveDialogChange={actions.setShowMoveDialog}
                showRenameDialog={actions.showRenameDialog}
                onRenameDialogChange={actions.setShowRenameDialog}
                onColorChange={() => {}}
                onDeleteConfirm={actions.confirmDelete}
                onRename={(newName) => { actions.handleRename(newName); toast.success('Item renamed'); }}
                onMove={onMoveItem ? actions.handleMove : undefined}
            />
        </Wrapper>
    );

    return content;
}

interface SidebarFolderItemProps {
    folder: Item;
    isActive: boolean;
    isOpen: boolean;
    allItems: Item[];
    workspaceName: string;
    workspaceIcon?: string | null;
    workspaceColor?: string | null;
    onFolderClick: () => void;
    onToggle: () => void;
    onItemClick: (item: Item) => void;
    openFolders: Set<string>;
    onToggleFolder: (folderId: string) => void;
    activeFolderId: string | null;
    onFolderClickHandler: (folderId: string) => void;
    isNested?: boolean;
    onDeleteItem?: (itemId: string) => void;
    onDeleteFolder?: (folderId: string) => void;
    onRenameFolder?: (folderId: string, newName: string) => void;
    onRenameItem?: (itemId: string, newName: string) => void;
    onMoveItem?: (itemId: string, folderId: string | null) => void;
}

function SidebarFolderItem({
    folder,
    isActive,
    isOpen,
    allItems,
    workspaceName,
    workspaceIcon,
    workspaceColor,
    onFolderClick,
    onToggle,
    onItemClick,
    openFolders,
    onToggleFolder,
    activeFolderId,
    onFolderClickHandler,
    isNested = false,
    onDeleteItem,
    onDeleteFolder,
    onRenameFolder,
    onRenameItem,
    onMoveItem,
}: SidebarFolderItemProps) {
    const [isHovered, setIsHovered] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const handleChevronClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onToggle();
    }, [onToggle]);

    const handleFolderClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (isActive) return;
        onFolderClick();
    }, [onFolderClick, isActive]);

    const childFolders = useMemo(() => {
        return getChildFolders(folder.id, allItems);
    }, [folder.id, allItems]);

    const directItems = useMemo(() => {
        return allItems.filter(
            (item) => item.folderId === folder.id && item.type !== "folder"
        );
    }, [folder.id, allItems]);

    const totalItemCount = childFolders.length + directItems.length;

    const actions = useItemActionDialogs({
        item: folder,
        itemCount: totalItemCount,
        onDeleteItem: onDeleteFolder ? (id) => { onDeleteFolder(id); } : () => {},
        onUpdateItem: onRenameFolder ? (id, updates) => { if (updates.name !== undefined) onRenameFolder(id, updates.name as string); } : () => {},
        onMoveItem: onMoveItem ? (id, folderId) => { onMoveItem(id, folderId); toast.success('Folder moved'); } : undefined,
    });

    const folderContent = (
        <Collapsible open={isOpen} onOpenChange={onToggle}>
            <div
                className="relative w-full"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                <SidebarMenuButton
                    className={cn(
                        "w-full cursor-pointer p-0 group/folder-item",
                        isNested && "ml-1",
                        isActive ? "bg-blue-600/30 cursor-default hover:bg-blue-600/30" : "cursor-pointer"
                    )}
                    onClick={(e: React.MouseEvent) => {
                        if ((e.target as HTMLElement).closest('[data-menu-button]')) {
                            e.stopPropagation();
                            return;
                        }
                    }}
                >
                    <div className="flex items-center w-full">
                        <div
                            onClick={handleChevronClick}
                            className={cn(
                                "px-1 py-2 rounded flex items-center justify-center flex-shrink-0 relative z-10 group/chevron cursor-default w-6",
                                !isActive && "hover:bg-primary/10"
                            )}
                            aria-label={isOpen ? "Collapse" : "Expand"}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    handleChevronClick(e as unknown as React.MouseEvent);
                                }
                            }}
                        >
                            {isOpen || isHovered ? (
                                <ChevronRight
                                    className={cn(
                                        "size-4 text-muted-foreground group-hover/chevron:text-primary transition-opacity",
                                        isOpen && "rotate-90"
                                    )}
                                />
                            ) : (
                                isActive ? (
                                    <FolderOpen className="size-3.5 flex-shrink-0 transition-opacity" style={{ color: '#3B82F6' }} />
                                ) : (
                                    <FolderIcon className="size-3.5 flex-shrink-0 transition-opacity" style={{ color: folder.color || '#F59E0B' }} />
                                )
                            )}
                        </div>
                        <div
                            onClick={handleFolderClick}
                            className={cn(
                                "flex-1 flex items-center gap-2 px-1 py-1 rounded min-w-0",
                                isActive ? "cursor-default hover:bg-transparent" : "cursor-pointer hover:bg-sidebar-accent hover:bg-opacity-50"
                            )}
                        >
                            <span className={cn("flex-1 text-xs", (isHovered || isDropdownOpen) ? "truncate pr-6" : "truncate")}>{folder.name}</span>
                        </div>
                    </div>
                </SidebarMenuButton>
                {(isHovered || isDropdownOpen) && (onDeleteFolder || onRenameFolder) && (
                    <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
                        <DropdownMenuTrigger asChild>
                            <button
                                data-menu-button
                                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded hover:bg-sidebar-accent flex-shrink-0 z-50 pointer-events-auto cursor-pointer"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                }}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                }}
                                onMouseUp={(e) => {
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
                            {onRenameFolder && (
                                <DropdownMenuItem
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsDropdownOpen(false);
                                        actions.requestRename();
                                    }}
                                >
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Rename
                                </DropdownMenuItem>
                            )}
                            {onMoveItem && (
                                <DropdownMenuItem
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsDropdownOpen(false);
                                        actions.requestMove();
                                    }}
                                >
                                    <FolderInput className="mr-2 h-4 w-4" />
                                    Move to
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsDropdownOpen(false);
                                    actions.requestDelete();
                                }}
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete Folder
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>
            <CollapsibleContent>
                <SidebarMenuSub>
                    {childFolders.map((childFolder) => (
                        <SidebarFolderItem
                            key={childFolder.id}
                            folder={childFolder}
                            isActive={activeFolderId === childFolder.id}
                            isOpen={openFolders.has(`folder-${childFolder.id}`)}
                            allItems={allItems}
                            workspaceName={workspaceName}
                            workspaceIcon={workspaceIcon}
                            workspaceColor={workspaceColor}
                            onFolderClick={() => onFolderClickHandler(childFolder.id)}
                            onToggle={() => onToggleFolder(`folder-${childFolder.id}`)}
                            onItemClick={onItemClick}
                            openFolders={openFolders}
                            onToggleFolder={onToggleFolder}
                            activeFolderId={activeFolderId}
                            onFolderClickHandler={onFolderClickHandler}
                            isNested={true}
                            onDeleteItem={onDeleteItem}
                            onDeleteFolder={onDeleteFolder}
                            onRenameFolder={onRenameFolder}
                            onRenameItem={onRenameItem}
                            onMoveItem={onMoveItem}
                        />
                    ))}
                    {directItems.map((item) => (
                        <SidebarItem
                            key={item.id}
                            item={item}
                            allItems={allItems}
                            workspaceName={workspaceName}
                            workspaceIcon={workspaceIcon}
                            workspaceColor={workspaceColor}
                            onItemClick={onItemClick}
                            onDeleteItem={onDeleteItem}
                            onRenameItem={onRenameItem}
                            onMoveItem={onMoveItem}
                            isNested={true}
                        />
                    ))}
                    {totalItemCount === 0 && (
                        <SidebarMenuSubItem>
                            <span className="text-xs text-muted-foreground px-2 py-1">
                                No items in folder
                            </span>
                        </SidebarMenuSubItem>
                    )}
                </SidebarMenuSub>
            </CollapsibleContent>
            <WorkspaceCardDialogs
                item={folder}
                allItems={allItems}
                workspaceName={workspaceName}
                workspaceIcon={workspaceIcon}
                workspaceColor={workspaceColor}
                isColorPickerOpen={false}
                onColorPickerOpenChange={() => {}}
                showDeleteDialog={actions.showDeleteDialog}
                onDeleteDialogChange={actions.setShowDeleteDialog}
                showMoveDialog={actions.showMoveDialog}
                onMoveDialogChange={actions.setShowMoveDialog}
                showRenameDialog={actions.showRenameDialog}
                onRenameDialogChange={actions.setShowRenameDialog}
                onColorChange={() => {}}
                onDeleteConfirm={actions.confirmDelete}
                onRename={(newName) => { actions.handleRename(newName); toast.success('Folder renamed'); }}
                onMove={onMoveItem ? actions.handleMove : undefined}
                itemCount={totalItemCount}
            />
        </Collapsible>
    );

    if (isNested) {
        return (
            <SidebarMenuSubItem>
                {folderContent}
            </SidebarMenuSubItem>
        );
    }

    return (
        <SidebarMenuItem>
            {folderContent}
        </SidebarMenuItem>
    );
}

function SidebarCardList() {
    const currentWorkspaceId = useCurrentWorkspaceId();
    const state = useWorkspaceItems();
    const isLoading = useWorkspaceItemsLoading();
    const { workspaces } = useWorkspaceContext();
    const activeFolderId = useUIStore((state) => state.activeFolderId);
    const setActiveFolderId = useUIStore((state) => state.setActiveFolderId);
    const openWorkspaceItem = useUIStore((state) => state.openWorkspaceItem);

    const currentWorkspace = useMemo(() => {
        return workspaces.find(w => w.id === currentWorkspaceId) || null;
    }, [workspaces, currentWorkspaceId]);

    const operations = useWorkspaceOperations(currentWorkspaceId, state || { items: [] });

    const handleDeleteItem = useCallback(
        async (itemId: string) => {
            if (operations) {
                await operations.deleteItem(itemId);
            }
        },
        [operations]
    );

    const handleDeleteFolder = useCallback(
        async (folderId: string) => {
            if (operations) {
                operations.deleteFolder(folderId);
            }
        },
        [operations]
    );

    const handleRenameItem = useCallback(
        async (itemId: string, newName: string) => {
            if (operations) {
                operations.updateItem(itemId, { name: newName });
            }
        },
        [operations]
    );

    const handleRenameFolder = useCallback(
        async (folderId: string, newName: string) => {
            if (operations) {
                operations.updateItem(folderId, { name: newName });
            }
        },
        [operations]
    );

    const handleMoveItem = useCallback(
        (itemId: string, folderId: string | null) => {
            if (operations) {
                operations.moveItemToFolder(itemId, folderId);
            }
        },
        [operations]
    );

    const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());

    const toggleFolder = useCallback((folderId: string) => {
        setOpenFolders((prev) => {
            const next = new Set(prev);
            if (next.has(folderId)) {
                next.delete(folderId);
            } else {
                next.add(folderId);
            }
            return next;
        });
    }, []);

    const allItems = useMemo(() => {
        return state || [];
    }, [state]);

    const rootFolders = useMemo(() => {
        return getChildFolders(null, allItems);
    }, [allItems]);

    const looseItems = useMemo(() => {
        return allItems.filter(item =>
            item.type !== 'folder' && !item.folderId
        );
    }, [allItems]);

    const handleFolderClick = useCallback(
        (folderId: string) => {
            if (activeFolderId === folderId) {
                setActiveFolderId(null);
            } else {
                setActiveFolderId(folderId);
            }
        },
        [activeFolderId, setActiveFolderId]
    );

    const handleItemClick = useCallback(
        (item: Item) => {
            if (item.type === "folder") return;

            if (item.folderId) {
                const folderPath = getFolderPath(item.folderId, allItems);
                setOpenFolders((prev) => {
                    const next = new Set(prev);
                    folderPath.forEach((folder) => {
                        next.add(`folder-${folder.id}`);
                    });
                    return next;
                });
                setActiveFolderId(item.folderId);
            } else {
                setActiveFolderId(null);
            }

            openWorkspaceItem(item.id);
        },
        [allItems, setActiveFolderId, openWorkspaceItem]
    );

    if (isLoading) {
        return (
            <div className="px-3 py-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                Loading cards...
            </div>
        );
    }

    const totalCards = (state || []).filter(item => item.type !== 'folder').length;

    if (totalCards === 0) {
        return (
            <div className="px-3 py-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                No cards in this workspace
            </div>
        );
    }

    const workspaceName = currentWorkspace?.name || "Workspace";
    const workspaceIcon = currentWorkspace?.icon;
    const workspaceColor = currentWorkspace?.color;

    return (
        <div className="group-data-[collapsible=icon]:hidden">
            <SidebarMenu>
                {rootFolders.map((folder) => (
                    <SidebarFolderItem
                        key={folder.id}
                        folder={folder}
                        isActive={activeFolderId === folder.id}
                        isOpen={openFolders.has(`folder-${folder.id}`)}
                        allItems={allItems}
                        workspaceName={workspaceName}
                        workspaceIcon={workspaceIcon}
                        workspaceColor={workspaceColor}
                        onFolderClick={() => handleFolderClick(folder.id)}
                        onToggle={() => toggleFolder(`folder-${folder.id}`)}
                        onItemClick={handleItemClick}
                        openFolders={openFolders}
                        onToggleFolder={toggleFolder}
                        activeFolderId={activeFolderId}
                        onFolderClickHandler={handleFolderClick}
                        onDeleteItem={handleDeleteItem}
                        onDeleteFolder={handleDeleteFolder}
                        onRenameFolder={handleRenameFolder}
                        onRenameItem={handleRenameItem}
                        onMoveItem={handleMoveItem}
                    />
                ))}

                {looseItems.map((item) => (
                    <SidebarItem
                        key={item.id}
                        item={item}
                        allItems={allItems}
                        workspaceName={workspaceName}
                        workspaceIcon={workspaceIcon}
                        workspaceColor={workspaceColor}
                        onItemClick={handleItemClick}
                        onDeleteItem={handleDeleteItem}
                        onRenameItem={handleRenameItem}
                        onMoveItem={handleMoveItem}
                        isNested={false}
                    />
                ))}
            </SidebarMenu>
        </div>
    );
}

export default memo(SidebarCardList);
