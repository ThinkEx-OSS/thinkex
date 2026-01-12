"use client";

import { memo, useMemo, useCallback, useState, useEffect, useRef } from "react";
import { ChevronRight, FileText, File, FolderOpen, Folder as FolderIcon, MoreVertical, Trash2, Pencil, FolderInput, Play } from "lucide-react";
import { PiCardsThreeFill } from "react-icons/pi";
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
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { useWorkspaceOperations } from "@/hooks/workspace/use-workspace-operations";
import { useUIStore } from "@/lib/stores/ui-store";
import type { Item, CardType } from "@/lib/workspace-state/types";
import { getChildFolders, getFolderPath } from "@/lib/workspace-state/search";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import MoveToDialog from "@/components/modals/MoveToDialog";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";

/**
 * Get icon for card type
 */
function getCardTypeIcon(type: CardType) {
    switch (type) {
        case "note":
            return <FileText className="size-3.5 text-blue-400" />;
        case "pdf":
            return <File className="size-3.5 text-red-400" />;
        case "flashcard":
            return <PiCardsThreeFill className="size-3.5 text-purple-400" />;
        case "youtube":
            return <Play className="size-3.5 text-red-500" />;
        case "folder":
            return <FolderIcon className="size-3.5 text-amber-400" />;
        default:
            return <FileText className="size-3.5 text-muted-foreground" />;
    }
}

/**
 * Sidebar item button component with hover menu (for nested items)
 */
interface SidebarItemButtonProps {
    item: Item;
    allItems: Item[];
    workspaceName: string;
    workspaceIcon?: string | null;
    workspaceColor?: string | null;
    onItemClick: (item: Item) => void;
    onDeleteItem?: (itemId: string) => void;
    onRenameItem?: (itemId: string, newName: string) => void;
    onMoveItem?: (itemId: string, folderId: string | null) => void;
}

function SidebarItemButton({ item, allItems, workspaceName, workspaceIcon, workspaceColor, onItemClick, onDeleteItem, onRenameItem, onMoveItem }: SidebarItemButtonProps) {
    const [isHovered, setIsHovered] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [showRenameDialog, setShowRenameDialog] = useState(false);
    const [showMoveDialog, setShowMoveDialog] = useState(false);
    const [renameValue, setRenameValue] = useState(item.name || "Untitled");
    const renameInputRef = useRef<HTMLInputElement>(null);

    // Sync rename value when item name changes
    useEffect(() => {
        setRenameValue(item.name || "Untitled");
    }, [item.name]);

    const handleDelete = useCallback(() => {
        if (onDeleteItem) {
            onDeleteItem(item.id);
        }
        setShowDeleteDialog(false);
    }, [item.id, onDeleteItem]);

    const handleRename = useCallback(() => {
        if (onRenameItem && renameValue.trim()) {
            onRenameItem(item.id, renameValue.trim());
            setShowRenameDialog(false);
        }
    }, [item.id, renameValue, onRenameItem]);

    const handleMove = useCallback((folderId: string | null) => {
        if (onMoveItem) {
            onMoveItem(item.id, folderId);
            toast.success('Item moved');
        }
    }, [item.id, onMoveItem]);

    return (
        <SidebarMenuSubItem>
            <div
                className="relative w-full"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                <SidebarMenuButton
                    size="sm"
                    className="w-full cursor-pointer p-0"
                    onClick={(e) => {
                        // Don't trigger item click if clicking the menu button
                        if ((e.target as HTMLElement).closest('[data-menu-button]')) {
                            e.stopPropagation();
                            return;
                        }
                        onItemClick(item);
                    }}
                >
                    <div className="flex items-center gap-2 px-2 py-2 w-full">
                        {getCardTypeIcon(item.type)}
                        <span className={cn("flex-1", (isHovered || isDropdownOpen) ? "truncate pr-6" : "truncate")}>
                            {item.name || "Untitled"}
                        </span>
                    </div>
                </SidebarMenuButton>
                {/* Three dots menu button - appears on hover or when dropdown is open */}
                {(isHovered || isDropdownOpen) && (onDeleteItem || onRenameItem) && (
                    <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
                        <DropdownMenuTrigger asChild>
                            <button
                                data-menu-button
                                className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded hover:bg-sidebar-accent flex-shrink-0 z-50 pointer-events-auto cursor-pointer"
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
                                <MoreVertical className="size-3 text-muted-foreground pointer-events-none" />
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
                                        setRenameValue(item.name || "Untitled");
                                        setIsDropdownOpen(false);
                                        setShowRenameDialog(true);
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
                                        setShowMoveDialog(true);
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
                                    setShowDeleteDialog(true);
                                }}
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>
            {/* Delete confirmation dialog */}
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete {item.type === 'pdf' ? 'PDF' : item.type === 'flashcard' ? 'Flashcard' : 'Note'}</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete &quot;{item.name || 'Untitled'}&quot;? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            {/* Rename Dialog */}
            <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
                <DialogContent onClick={(e) => e.stopPropagation()}>
                    <DialogHeader>
                        <DialogTitle>Rename {item.type === 'pdf' ? 'PDF' : item.type === 'flashcard' ? 'Flashcard' : 'Note'}</DialogTitle>
                        <DialogDescription>
                            Enter a new name for this item.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Input
                            ref={renameInputRef}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && renameValue.trim()) {
                                    handleRename();
                                } else if (e.key === 'Escape') {
                                    setShowRenameDialog(false);
                                }
                            }}
                            placeholder="Item name"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowRenameDialog(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleRename} disabled={!renameValue.trim()}>
                            Rename
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {/* Move to Dialog */}
            {onMoveItem && (
                <MoveToDialog
                    open={showMoveDialog}
                    onOpenChange={setShowMoveDialog}
                    item={item}
                    allItems={allItems}
                    workspaceName={workspaceName}
                    workspaceIcon={workspaceIcon}
                    workspaceColor={workspaceColor}
                    onMove={handleMove}
                />
            )}
        </SidebarMenuSubItem>
    );
}

/**
 * Root-level sidebar item component with hover menu (for items not in folders)
 */
interface SidebarRootItemProps {
    item: Item;
    allItems: Item[];
    workspaceName: string;
    workspaceIcon?: string | null;
    workspaceColor?: string | null;
    onItemClick: (item: Item) => void;
    onDeleteItem?: (itemId: string) => void;
    onRenameItem?: (itemId: string, newName: string) => void;
    onMoveItem?: (itemId: string, folderId: string | null) => void;
}

function SidebarRootItem({ item, allItems, workspaceName, workspaceIcon, workspaceColor, onItemClick, onDeleteItem, onRenameItem, onMoveItem }: SidebarRootItemProps) {
    const [isHovered, setIsHovered] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [showRenameDialog, setShowRenameDialog] = useState(false);
    const [showMoveDialog, setShowMoveDialog] = useState(false);
    const [renameValue, setRenameValue] = useState(item.name || "Untitled");
    const renameInputRef = useRef<HTMLInputElement>(null);

    // Sync rename value when item name changes
    useEffect(() => {
        setRenameValue(item.name || "Untitled");
    }, [item.name]);

    const handleDelete = useCallback(() => {
        if (onDeleteItem) {
            onDeleteItem(item.id);
        }
        setShowDeleteDialog(false);
    }, [item.id, onDeleteItem]);

    const handleRename = useCallback(() => {
        if (onRenameItem && renameValue.trim()) {
            onRenameItem(item.id, renameValue.trim());
            setShowRenameDialog(false);
        }
    }, [item.id, renameValue, onRenameItem]);

    const handleMove = useCallback((folderId: string | null) => {
        if (onMoveItem) {
            onMoveItem(item.id, folderId);
            toast.success('Item moved');
        }
    }, [item.id, onMoveItem]);

    // Auto-focus and select all text when dialog opens
    useEffect(() => {
        if (showRenameDialog && renameInputRef.current) {
            renameInputRef.current.focus();
            renameInputRef.current.select();
        }
    }, [showRenameDialog]);

    return (
        <SidebarMenuItem>
            <div
                className="relative w-full"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                <SidebarMenuButton
                    className="w-full cursor-pointer p-0"
                    onClick={(e) => {
                        // Don't trigger item click if clicking the menu button
                        if ((e.target as HTMLElement).closest('[data-menu-button]')) {
                            e.stopPropagation();
                            return;
                        }
                        onItemClick(item);
                    }}
                >
                    <div className="flex items-center w-full">
                        {/* Icon area - matches folder chevron area structure */}
                        <div className="px-1 py-2 flex items-center justify-center flex-shrink-0 w-6">
                            {getCardTypeIcon(item.type)}
                        </div>
                        {/* Item name area - matches folder name area structure */}
                        <div className={cn(
                            "flex-1 flex items-center px-2 py-2 rounded cursor-pointer min-w-0",
                            (isHovered || isDropdownOpen) && "pr-8"
                        )}>
                            <span className={cn("flex-1", (isHovered || isDropdownOpen) ? "truncate pr-6" : "truncate")}>
                                {item.name || "Untitled"}
                            </span>
                        </div>
                    </div>
                </SidebarMenuButton>
                {/* Three dots menu button - appears on hover or when dropdown is open */}
                {(isHovered || isDropdownOpen) && (onDeleteItem || onRenameItem) && (
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
                            {onRenameItem && (
                                <DropdownMenuItem
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setRenameValue(item.name || "Untitled");
                                        setIsDropdownOpen(false);
                                        setShowRenameDialog(true);
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
                                        setShowMoveDialog(true);
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
                                    setShowDeleteDialog(true);
                                }}
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>
            {/* Delete confirmation dialog */}
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete {item.type === 'pdf' ? 'PDF' : item.type === 'flashcard' ? 'Flashcard' : 'Note'}</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete &quot;{item.name || 'Untitled'}&quot;? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            {/* Rename Dialog */}
            <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
                <DialogContent onClick={(e) => e.stopPropagation()}>
                    <DialogHeader>
                        <DialogTitle>Rename {item.type === 'pdf' ? 'PDF' : item.type === 'flashcard' ? 'Flashcard' : 'Note'}</DialogTitle>
                        <DialogDescription>
                            Enter a new name for this item.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Input
                            ref={renameInputRef}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && renameValue.trim()) {
                                    handleRename();
                                } else if (e.key === 'Escape') {
                                    setShowRenameDialog(false);
                                }
                            }}
                            placeholder="Item name"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowRenameDialog(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleRename} disabled={!renameValue.trim()}>
                            Rename
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {/* Move to Dialog */}
            {onMoveItem && (
                <MoveToDialog
                    open={showMoveDialog}
                    onOpenChange={setShowMoveDialog}
                    item={item}
                    allItems={allItems}
                    workspaceName={workspaceName}
                    workspaceIcon={workspaceIcon}
                    workspaceColor={workspaceColor}
                    onMove={handleMove}
                />
            )}
        </SidebarMenuItem>
    );
}

interface SidebarFolderItemProps {
    folder: Item; // Folder is now an item with type: 'folder'
    isActive: boolean;
    isOpen: boolean;
    allItems: Item[]; // All items for finding children
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
    isNested?: boolean; // Whether this folder is nested inside another folder
    onDeleteItem?: (itemId: string) => void;
    onDeleteFolder?: (folderId: string) => void;
    onRenameFolder?: (folderId: string, newName: string) => void;
    onRenameItem?: (itemId: string, newName: string) => void;
    onMoveItem?: (itemId: string, folderId: string | null) => void;
}

/**
 * Sidebar item for a folder - recursively renders child folders and items
 */
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
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [showRenameDialog, setShowRenameDialog] = useState(false);
    const [showMoveDialog, setShowMoveDialog] = useState(false);
    const [renameValue, setRenameValue] = useState(folder.name);
    const renameInputRef = useRef<HTMLInputElement>(null);

    // Sync rename value when folder name changes
    useEffect(() => {
        setRenameValue(folder.name);
    }, [folder.name]);
    const handleChevronClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onToggle();
    }, [onToggle]);

    const handleFolderClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onFolderClick();
    }, [onFolderClick]);

    const handleDelete = useCallback(() => {
        if (onDeleteFolder) {
            onDeleteFolder(folder.id);
        }
        setShowDeleteDialog(false);
    }, [folder.id, onDeleteFolder]);

    const handleRename = useCallback(() => {
        if (onRenameFolder && renameValue.trim()) {
            onRenameFolder(folder.id, renameValue.trim());
            setShowRenameDialog(false);
        }
    }, [folder.id, renameValue, onRenameFolder]);

    const handleMove = useCallback((folderId: string | null) => {
        if (onMoveItem) {
            onMoveItem(folder.id, folderId);
            toast.success('Folder moved');
        }
    }, [folder.id, onMoveItem]);

    // Auto-focus and select all text when dialog opens
    useEffect(() => {
        if (showRenameDialog && renameInputRef.current) {
            renameInputRef.current.focus();
            renameInputRef.current.select();
        }
    }, [showRenameDialog]);

    // Get child folders (folders with folderId === this folder's id)
    const childFolders = useMemo(() => {
        return getChildFolders(folder.id, allItems);
    }, [folder.id, allItems]);

    // Get direct items (non-folders with folderId === this folder's id)
    const directItems = useMemo(() => {
        return allItems.filter(i =>
            i.type !== 'folder' && i.folderId === folder.id
        );
    }, [folder.id, allItems]);

    const totalItemCount = childFolders.length + directItems.length;

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
                        isActive && "bg-blue-600/30 hover:bg-blue-500/40"
                    )}
                    onClick={(e) => {
                        // Don't trigger folder click if clicking the menu button
                        if ((e.target as HTMLElement).closest('[data-menu-button]')) {
                            e.stopPropagation();
                            return;
                        }
                    }}
                >
                    <div className="flex items-center w-full">
                        {/* Icon/Chevron - shows icon by default, chevron on hover or when expanded */}
                        <div
                            onClick={handleChevronClick}
                            className={cn(
                                "px-1 py-2 rounded flex items-center justify-center flex-shrink-0 relative z-10 group/chevron cursor-pointer w-6",
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
                            {/* Show chevron when expanded or on hover, otherwise show icon */}
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
                        {/* Folder div - handles folder filter */}
                        <div
                            onClick={handleFolderClick}
                            className={cn(
                                "flex-1 flex items-center gap-2 px-2 py-2 rounded cursor-pointer min-w-0",
                                !isActive && "hover:bg-sidebar-accent hover:bg-opacity-50",
                                (isHovered || isDropdownOpen) && "pr-8"
                            )}
                        >
                            <span className={cn("flex-1", isHovered ? "truncate" : "truncate")}>{folder.name}</span>
                        </div>
                    </div>
                </SidebarMenuButton>
                {/* Three dots menu button - appears on hover or when dropdown is open */}
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
                                        setRenameValue(folder.name);
                                        setIsDropdownOpen(false);
                                        setShowRenameDialog(true);
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
                                        setShowMoveDialog(true);
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
                                    setShowDeleteDialog(true);
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
                    {/* Child folders (recursive) */}
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
                    {/* Direct items (non-folders) */}
                    {directItems.map((item) => (
                        <SidebarItemButton
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
            {/* Delete confirmation dialog */}
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Folder</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete &quot;{folder.name}&quot;? Items in this folder will be moved out, but not deleted.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            {/* Rename Dialog */}
            <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
                <DialogContent onClick={(e) => e.stopPropagation()}>
                    <DialogHeader>
                        <DialogTitle>Rename Folder</DialogTitle>
                        <DialogDescription>
                            Enter a new name for this folder.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Input
                            ref={renameInputRef}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && renameValue.trim()) {
                                    handleRename();
                                } else if (e.key === 'Escape') {
                                    setShowRenameDialog(false);
                                }
                            }}
                            placeholder="Folder name"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowRenameDialog(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleRename} disabled={!renameValue.trim()}>
                            Rename
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {/* Move to Dialog */}
            {onMoveItem && (
                <MoveToDialog
                    open={showMoveDialog}
                    onOpenChange={setShowMoveDialog}
                    item={folder}
                    allItems={allItems}
                    workspaceName={workspaceName}
                    workspaceIcon={workspaceIcon}
                    workspaceColor={workspaceColor}
                    onMove={handleMove}
                />
            )}
        </Collapsible>
    );

    // Wrap in appropriate container based on nesting level
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

/**
 * SidebarCardList - Shows all folders in collapsible sections
 */
function SidebarCardList() {
    const currentWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
    const { state, isLoading } = useWorkspaceState(currentWorkspaceId);
    const { workspaces } = useWorkspaceContext();
    const activeFolderId = useUIStore((state) => state.activeFolderId);
    const setActiveFolderId = useUIStore((state) => state.setActiveFolderId);
    const clearActiveFolder = useUIStore((state) => state.clearActiveFolder);

    // Get current workspace details
    const currentWorkspace = useMemo(() => {
        return workspaces.find(w => w.id === currentWorkspaceId) || null;
    }, [workspaces, currentWorkspaceId]);

    // Get workspace operations for delete functionality
    const operations = useWorkspaceOperations(currentWorkspaceId, state || { items: [], workspaceId: currentWorkspaceId || '', globalTitle: '', globalDescription: '', globalTags: [] });

    const handleDeleteItem = useCallback(
        async (itemId: string) => {
            if (operations) {
                await operations.deleteItem(itemId);
                toast.success('Item deleted');
            }
        },
        [operations]
    );

    const handleDeleteFolder = useCallback(
        async (folderId: string) => {
            if (operations) {
                operations.deleteFolder(folderId);
                toast.success('Folder deleted');
            }
        },
        [operations]
    );

    const handleRenameItem = useCallback(
        async (itemId: string, newName: string) => {
            if (operations) {
                operations.updateItem(itemId, { name: newName });
                toast.success('Item renamed');
            }
        },
        [operations]
    );

    const handleRenameFolder = useCallback(
        async (folderId: string, newName: string) => {
            if (operations) {
                operations.updateItem(folderId, { name: newName });
                toast.success('Folder renamed');
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

    // Track which folders are open (for collapsible UI, not for filtering)
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

    // Get all items
    const allItems = useMemo(() => {
        return state?.items || [];
    }, [state?.items]);

    // Get root-level folders (folders with no folderId)
    const rootFolders = useMemo(() => {
        return getChildFolders(null, allItems);
    }, [allItems]);

    // Get loose items (non-folders not in any folder)
    const looseItems = useMemo(() => {
        return allItems.filter(item =>
            item.type !== 'folder' && !item.folderId
        );
    }, [allItems]);

    // Handle clicking on a folder - toggle folder filter
    const handleFolderClick = useCallback(
        (folderId: string) => {
            if (activeFolderId === folderId) {
                // If clicking the active folder, clear the filter
                clearActiveFolder();
            } else {
                // Set this folder as active
                setActiveFolderId(folderId);
            }
        },
        [activeFolderId, setActiveFolderId, clearActiveFolder]
    );

    // Handle clicking on an item - open parent folders, set active folder, and scroll to card
    const handleItemClick = useCallback(
        (item: Item) => {
            // If item is in a folder, open all parent folders and set the folder as active
            if (item.folderId) {
                // Get the path of all parent folders from root to the item's folder
                const folderPath = getFolderPath(item.folderId, allItems);

                // Open all folders in the path in the sidebar
                setOpenFolders((prev) => {
                    const next = new Set(prev);
                    folderPath.forEach((folder) => {
                        next.add(`folder-${folder.id}`);
                    });
                    return next;
                });

                // Set the item's folder as active so it's visible in the main view
                setActiveFolderId(item.folderId);
            } else {
                // If item is in root, clear any active folder
                clearActiveFolder();
            }

            // Small delay to let the DOM update (folder filter and scroll)
            setTimeout(() => {
                const element = document.getElementById(`item-${item.id}`);
                if (element) {
                    // Find the scrollable container
                    let container = element.parentElement;
                    while (container && container !== document.body) {
                        const style = window.getComputedStyle(container);
                        if (style.overflowY === "auto" || style.overflowY === "scroll") {
                            break;
                        }
                        container = container.parentElement;
                    }

                    // Function to add temporary highlight after scroll ends
                    const addHighlight = () => {
                        // Store original border styles
                        const originalBorder = element.style.border;
                        const originalBorderColor = element.style.borderColor;
                        const originalBorderWidth = element.style.borderWidth;
                        const originalBorderRadius = element.style.borderRadius;

                        // Add highlight border with smooth animation (white, like selection)
                        element.style.transition = 'border-color 0.3s ease-out, border-width 0.2s ease-out';
                        element.style.borderColor = 'rgba(255, 255, 255, 0.8)';
                        element.style.borderWidth = '3px';
                        element.style.borderRadius = '0.375rem'; // rounded-md (6px)

                        // Remove highlight after 1 second with fade out
                        setTimeout(() => {
                            element.style.borderColor = 'rgba(255, 255, 255, 0)';
                            // Restore original styles after transition completes
                            setTimeout(() => {
                                element.style.border = originalBorder;
                                element.style.borderColor = originalBorderColor;
                                element.style.borderWidth = originalBorderWidth;
                                element.style.borderRadius = originalBorderRadius;
                                element.style.transition = '';
                            }, 300);
                        }, 1000);
                    };

                    let highlightTriggered = false;

                    const triggerHighlight = () => {
                        if (highlightTriggered) return;
                        highlightTriggered = true;
                        addHighlight();
                    };

                    // Use IntersectionObserver to detect when element is visible
                    const observer = new IntersectionObserver(
                        (entries) => {
                            entries.forEach((entry) => {
                                if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
                                    triggerHighlight();
                                    observer.disconnect();
                                }
                            });
                        },
                        {
                            root: container !== document.body ? container : null,
                            threshold: 0.5, // Trigger when 50% visible
                        }
                    );

                    // Start observing
                    observer.observe(element);

                    // Fallback timeout in case observer doesn't fire (edge cases)
                    setTimeout(() => {
                        if (!highlightTriggered) {
                            triggerHighlight();
                            observer.disconnect();
                        }
                    }, 1000);

                    if (container && container !== document.body) {
                        const elementRect = element.getBoundingClientRect();
                        const containerRect = container.getBoundingClientRect();
                        const relativeTop = elementRect.top - containerRect.top;

                        container.scrollTo({
                            top:
                                container.scrollTop +
                                relativeTop -
                                container.clientHeight / 2 +
                                element.clientHeight / 2,
                            behavior: "smooth",
                        });
                    } else {
                        element.scrollIntoView({ behavior: "smooth", block: "center" });
                    }
                }
            }, 150); // Slightly longer delay to ensure folder filter is applied
        },
        [allItems, setActiveFolderId, clearActiveFolder]
    );

    if (isLoading) {
        return (
            <div className="px-3 py-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                Loading cards...
            </div>
        );
    }

    const totalCards = (state?.items || []).filter(item => item.type !== 'folder').length;

    if (totalCards === 0) {
        return (
            <div className="px-3 py-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                No cards in this workspace
            </div>
        );
    }

    // Get workspace name, icon, and color
    const workspaceName = currentWorkspace?.name || "Workspace";
    const workspaceIcon = currentWorkspace?.icon;
    const workspaceColor = currentWorkspace?.color;

    return (
        <div className="group-data-[collapsible=icon]:hidden">
            <SidebarMenu>
                {/* Root-level folders (recursively render children) */}
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

                {/* Loose items (not in any folder) */}
                {looseItems.map((item) => (
                    <SidebarRootItem
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
                    />
                ))}
            </SidebarMenu>
        </div>
    );
}

export default memo(SidebarCardList);
