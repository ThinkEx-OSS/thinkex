"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
    ChevronRight,
    Folder as FolderIcon,
    FolderOpen,
    FileText,
    File,
    Play,
    Search,
    LayoutGrid,
} from "lucide-react";
import { PiCardsThreeFill } from "react-icons/pi";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Item, CardType } from "@/lib/workspace-state/types";
import { getChildFolders, searchItemsByName } from "@/lib/workspace-state/search";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";

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
            return <FolderIcon className="size-3.5 text-amber-500" />;
        default:
            return <FileText className="size-3.5 text-muted-foreground" />;
    }
}

interface MentionMenuProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    query: string;
    items: Item[];
    onSelect: (item: Item) => void;
    selectedCardIds: Set<string>;
}

interface FolderTreeItemProps {
    folder: Item;
    allItems: Item[];
    query: string;
    onSelect: (item: Item) => void;
    selectedCardIds: Set<string>;
    expandedFolders: Set<string>;
    onToggleExpand: (folderId: string) => void;
    level: number;
    highlightedIndex: number;
    currentIndex: { value: number };
    onItemIndex: (idx: number, item: Item) => void;
}

/**
 * Recursive folder tree item for the mention menu
 */
function FolderTreeItem({
    folder,
    allItems,
    query,
    onSelect,
    selectedCardIds,
    expandedFolders,
    onToggleExpand,
    level,
    highlightedIndex,
    currentIndex,
    onItemIndex,
}: FolderTreeItemProps) {
    const [isHovered, setIsHovered] = useState(false);
    const isExpanded = expandedFolders.has(folder.id);

    // Get child folders
    const childFolders = useMemo(() => {
        return getChildFolders(folder.id, allItems);
    }, [folder.id, allItems]);

    // Get direct items (non-folders) in this folder
    const directItems = useMemo(() => {
        const items = allItems.filter(
            (i) => i.type !== "folder" && i.folderId === folder.id
        );
        // Filter by query if provided
        if (query.trim()) {
            return searchItemsByName(items, query);
        }
        return items;
    }, [folder.id, allItems, query]);

    const hasChildren = childFolders.length > 0 || directItems.length > 0;

    const handleToggleClick = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            onToggleExpand(folder.id);
        },
        [folder.id, onToggleExpand]
    );

    // Indentation: start at 8px, increase by 16px per level
    const baseIndent = 8 + level * 16;
    const itemIndent = baseIndent + 20; // Items are indented further inside folders

    const isSelected = selectedCardIds.has(folder.id);

    return (
        <Collapsible open={isExpanded} onOpenChange={() => onToggleExpand(folder.id)}>
            <div
                className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors group",
                    "hover:bg-accent"
                )}
                style={{ paddingLeft: `${baseIndent}px` }}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                {/* Chevron button - for expand/collapse */}
                <button
                    type="button"
                    onClick={handleToggleClick}
                    className="w-4 h-4 flex items-center justify-center flex-shrink-0 hover:bg-accent/50 rounded cursor-pointer"
                >
                    {isExpanded || isHovered ? (
                        <ChevronRight
                            className={cn(
                                "size-3.5 text-muted-foreground transition-transform",
                                isExpanded && "rotate-90"
                            )}
                        />
                    ) : (
                        <FolderIcon
                            className="size-3.5 flex-shrink-0"
                            style={{ color: folder.color || "#F59E0B" }}
                        />
                    )}
                </button>

                {/* Selectable area - clicking here selects the folder */}
                <div
                    className="flex-1 flex items-center gap-2 cursor-pointer min-w-0"
                    onClick={() => onSelect(folder)}
                >
                    {/* Selection indicator - only show white dot when selected */}
                    {isSelected && (
                        <div className="w-4 h-4 rounded-full bg-white border-2 border-white flex-shrink-0" />
                    )}
                    <span className="flex-1 text-sm truncate">
                        {folder.name}
                    </span>
                </div>
            </div>

            {/* Child folders and items */}
            {hasChildren && (
                <CollapsibleContent>
                    {/* Child folders */}
                    {childFolders.map((childFolder) => (
                        <FolderTreeItem
                            key={childFolder.id}
                            folder={childFolder}
                            allItems={allItems}
                            query={query}
                            onSelect={onSelect}
                            selectedCardIds={selectedCardIds}
                            expandedFolders={expandedFolders}
                            onToggleExpand={onToggleExpand}
                            level={level + 1}
                            highlightedIndex={highlightedIndex}
                            currentIndex={currentIndex}
                            onItemIndex={onItemIndex}
                        />
                    ))}
                    {/* Direct items (selectable) */}
                    {directItems.map((item) => {
                        const itemIndex = currentIndex.value++;
                        onItemIndex(itemIndex, item);
                        const isHighlighted = itemIndex === highlightedIndex;
                        const isSelected = selectedCardIds.has(item.id);
                        return (
                            <div
                                key={item.id}
                                className={cn(
                                    "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors",
                                    isHighlighted && "bg-accent",
                                    !isHighlighted && "hover:bg-accent/50"
                                )}
                                style={{ paddingLeft: `${itemIndent}px` }}
                                onClick={() => onSelect(item)}
                            >
                                {/* Icon or selection indicator */}
                                {isSelected ? (
                                    <div className="w-4 h-4 rounded-full bg-white border-2 border-white flex-shrink-0" />
                                ) : (
                                    getCardTypeIcon(item.type)
                                )}
                                <span className="flex-1 text-sm truncate">
                                    {item.name || "Untitled"}
                                </span>
                            </div>
                        );
                    })}
                </CollapsibleContent>
            )}
        </Collapsible>
    );
}

/**
 * Mention menu popover that appears when typing "@" in the composer
 */
export function MentionMenu({
    open,
    onOpenChange,
    query,
    items,
    onSelect,
    selectedCardIds,
}: MentionMenuProps) {
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const itemIndexMapRef = useRef<Map<number, Item>>(new Map());

    // Get root-level folders
    const rootFolders = useMemo(() => {
        return getChildFolders(null, items);
    }, [items]);

    // Get root-level items (non-folders not in any folder)
    const rootItems = useMemo(() => {
        const rootLevelItems = items.filter(
            (item) => item.type !== "folder" && !item.folderId
        );
        // Filter by query if provided
        if (query.trim()) {
            return searchItemsByName(rootLevelItems, query);
        }
        return rootLevelItems;
    }, [items, query]);

    // When searching, auto-expand all folders
    useEffect(() => {
        if (query.trim()) {
            // Auto-expand all folders when searching
            const allFolderIds = items
                .filter((item) => item.type === "folder")
                .map((f) => f.id);
            setExpandedFolders(new Set(allFolderIds));
        } else {
            // Collapse all when not searching
            setExpandedFolders(new Set());
        }
    }, [query, items]);

    // Reset highlight when menu opens or query changes
    useEffect(() => {
        setHighlightedIndex(0);
    }, [open, query]);

    const handleToggleExpand = useCallback((folderId: string) => {
        setExpandedFolders((prev) => {
            const next = new Set(prev);
            if (next.has(folderId)) {
                next.delete(folderId);
            } else {
                next.add(folderId);
            }
            return next;
        });
    }, []);

    // Build item index map for keyboard navigation
    const buildItemIndexMap = useCallback(() => {
        itemIndexMapRef.current.clear();
    }, []);

    const onItemIndex = useCallback((idx: number, item: Item) => {
        itemIndexMapRef.current.set(idx, item);
    }, []);

    // Handle keyboard navigation
    useEffect(() => {
        if (!open) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            const totalItems = itemIndexMapRef.current.size;
            if (totalItems === 0) return;

            switch (e.key) {
                case "ArrowDown":
                    e.preventDefault();
                    setHighlightedIndex((prev) => (prev + 1) % totalItems);
                    break;
                case "ArrowUp":
                    e.preventDefault();
                    setHighlightedIndex((prev) => (prev - 1 + totalItems) % totalItems);
                    break;
                case "Enter":
                    e.preventDefault();
                    const selectedItem = itemIndexMapRef.current.get(highlightedIndex);
                    if (selectedItem) {
                        onSelect(selectedItem);
                    }
                    break;
                case "Escape":
                    e.preventDefault();
                    onOpenChange(false);
                    break;
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [open, highlightedIndex, onSelect, onOpenChange]);

    // Reset index map before render
    buildItemIndexMap();

    // Track current index during render
    const currentIndexObj = { value: 0 };

    // Calculate total visible items to determine if we should show empty state
    const hasVisibleItems =
        rootItems.length > 0 ||
        rootFolders.some((folder) => {
            const childItems = items.filter(
                (i) => i.type !== "folder" && i.folderId === folder.id
            );
            if (query.trim()) {
                return searchItemsByName(childItems, query).length > 0;
            }
            return childItems.length > 0;
        });

    if (!open) return null;

    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverAnchor asChild>
                <span className="absolute left-3 bottom-full" />
            </PopoverAnchor>
            <PopoverContent
                side="top"
                align="start"
                sideOffset={8}
                alignOffset={0}
                className="w-72 p-0 bg-sidebar border-sidebar-border overflow-hidden"
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                {/* Scrollable content area */}
                <div className="max-h-[250px] overflow-y-auto overflow-x-hidden">
                    <div>
                        {/* Root level items */}
                        {rootItems.map((item) => {
                            const itemIndex = currentIndexObj.value++;
                            onItemIndex(itemIndex, item);
                            const isHighlighted = itemIndex === highlightedIndex;
                            const isSelected = selectedCardIds.has(item.id);
                            return (
                                <div
                                    key={item.id}
                                    className={cn(
                                        "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors",
                                        isHighlighted && "bg-accent",
                                        !isHighlighted && "hover:bg-accent/50"
                                    )}
                                    style={{ paddingLeft: "8px" }}
                                    onClick={() => onSelect(item)}
                                >
                                    {/* Icon or selection indicator */}
                                    {isSelected ? (
                                        <div className="w-4 h-4 rounded-full bg-white border-2 border-white flex-shrink-0" />
                                    ) : (
                                        getCardTypeIcon(item.type)
                                    )}
                                    <span className="flex-1 text-sm truncate">
                                        {item.name || "Untitled"}
                                    </span>
                                </div>
                            );
                        })}

                        {/* Folder tree */}
                        {rootFolders.map((folder) => (
                            <FolderTreeItem
                                key={folder.id}
                                folder={folder}
                                allItems={items}
                                query={query}
                                onSelect={onSelect}
                                selectedCardIds={selectedCardIds}
                                expandedFolders={expandedFolders}
                                onToggleExpand={handleToggleExpand}
                                level={0}
                                highlightedIndex={highlightedIndex}
                                currentIndex={currentIndexObj}
                                onItemIndex={onItemIndex}
                            />
                        ))}

                        {/* Empty state */}
                        {!hasVisibleItems && (
                            <div className="py-4 text-center text-xs text-muted-foreground">
                                No cards found
                            </div>
                        )}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
