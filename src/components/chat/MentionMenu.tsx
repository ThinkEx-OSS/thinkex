"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Item } from "@/lib/workspace-state/types";
import { WorkspaceItemPicker } from "./WorkspaceItemPicker";

interface MentionMenuProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    query: string;
    items: Item[];
    onSelect: (item: Item) => void;
    selectedCardIds: Set<string>;
    /** Optional anchor element. When provided, popover positions relative to it. Omit for composer (uses invisible span). */
    anchor?: React.ReactNode;
    /** Popover side. Default "top" for composer. Use "bottom" when anchor is an input below. */
    side?: "top" | "right" | "bottom" | "left";
    /** Additional class for the popover content (e.g. width) */
    contentClassName?: string;
    /** Custom selected indicator for WorkspaceItemPicker */
    selectedIndicator?: (isSelected: boolean) => React.ReactNode;
    /** When true (default), popover is modal. Set false when inside Dialog to fix scroll. */
    modal?: boolean;
}

export function MentionMenu({
    open,
    onOpenChange,
    query,
    items,
    onSelect,
    selectedCardIds,
    anchor,
    side = "top",
    contentClassName,
    selectedIndicator,
    modal = true,
}: MentionMenuProps) {
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const itemIndexMapRef = useRef<Map<number, Item>>(new Map());

    // When searching, auto-expand all folders
    useEffect(() => {
        if (query.trim()) {
            const allFolderIds = items
                .filter((item) => item.type === "folder")
                .map((f) => f.id);
            setExpandedFolders(new Set(allFolderIds));
        } else {
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
            if (next.has(folderId)) next.delete(folderId);
            else next.add(folderId);
            return next;
        });
    }, []);

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

    // When no custom anchor (composer), don't render anything when closed - the invisible span would be pointless
    if (!open && !anchor) return null;

    return (
        <Popover open={open} onOpenChange={onOpenChange} modal={modal}>
            <PopoverAnchor asChild>
                {anchor ?? <span className="absolute left-3 bottom-full" />}
            </PopoverAnchor>
            <PopoverContent
                side={side}
                align="start"
                sideOffset={8}
                alignOffset={0}
                className={cn("w-72 p-0 bg-sidebar border-sidebar-border overflow-hidden pointer-events-auto", contentClassName)}
                onOpenAutoFocus={(e) => e.preventDefault()}
                onFocusOutside={anchor ? (e) => e.preventDefault() : undefined}
            >
                <div className="max-h-[250px] overflow-y-auto overflow-x-hidden min-w-0 overscroll-contain">
                    <WorkspaceItemPicker
                        items={items}
                                query={query}
                        selectedIds={selectedCardIds}
                                onSelect={onSelect}
                                expandedFolders={expandedFolders}
                                onToggleExpand={handleToggleExpand}
                                highlightedIndex={highlightedIndex}
                                currentIndex={currentIndexObj}
                                onItemIndex={onItemIndex}
                        selectedIndicator={selectedIndicator}
                    />
                </div>
            </PopoverContent>
        </Popover>
    );
}
