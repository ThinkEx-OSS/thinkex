"use client";

import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { ItemPanelContent } from "@/components/workspace-canvas/ItemPanelContent";
import { useUIStore, type ViewMode } from "@/lib/stores/ui-store";
import type { Item, ItemData } from "@/lib/workspace-state/types";
import React, { useMemo } from "react";

interface SplitViewLayoutProps {
    /** All items in the workspace (for looking up panel items) */
    items: Item[];
    /** Workspace section element — rendered on the left in workspace+panel mode */
    workspaceSection: React.ReactNode;
    /** Callbacks */
    onUpdateItem: (itemId: string, updates: Partial<Item>) => void;
    onUpdateItemData: (itemId: string, updater: (prev: ItemData) => ItemData) => void;
    onFlushPendingChanges: (itemId: string) => void;
}

/**
 * SplitViewLayout — orchestrates workspace+panel and panel+panel layouts.
 *
 * Reads viewMode and openPanelIds from the UI store and renders the appropriate
 * layout using resizable panels. Each item panel uses ItemPanelContent which
 * already provides its own header with close/maximize buttons.
 */
export function SplitViewLayout({
    items,
    workspaceSection,
    onUpdateItem,
    onUpdateItemData,
    onFlushPendingChanges,
}: SplitViewLayoutProps) {
    const viewMode = useUIStore((state) => state.viewMode);
    const openPanelIds = useUIStore((state) => state.openPanelIds);
    const closePanel = useUIStore((state) => state.closePanel);
    const setMaximizedItemId = useUIStore((state) => state.setMaximizedItemId);

    // Look up the actual items for each panel
    const panelItems = useMemo(() => {
        return openPanelIds
            .map(id => items.find(i => i.id === id))
            .filter((i): i is Item => !!i);
    }, [openPanelIds, items]);

    if (viewMode === 'workspace+panel') {
        // Workspace (left) + Item Panel (right)
        const panelItem = panelItems[0];
        if (!panelItem) return <>{workspaceSection}</>;

        return (
            <ResizablePanelGroup
                id="split-view-workspace-panel"
                orientation="horizontal"
                className="flex-1"
            >
                {/* Left: Workspace (single column) */}
                <ResizablePanel
                    id="split-workspace"
                    defaultSize="50%"
                    minSize="25%"
                    maxSize="70%"
                >
                    <div className="h-full overflow-hidden">
                        {workspaceSection}
                    </div>
                </ResizablePanel>

                <ResizableHandle id="split-handle" className="border-r border-sidebar-border" />

                {/* Right: Item Panel */}
                <ResizablePanel
                    id="split-item-panel"
                    defaultSize="50%"
                    minSize="30%"
                >
                    <ItemPanelContent
                        key={panelItem.id}
                        item={panelItem}
                        onClose={() => {
                            onFlushPendingChanges(panelItem.id);
                            closePanel(panelItem.id);
                        }}
                        onMaximize={() => setMaximizedItemId(panelItem.id)}
                        isMaximized={false}
                        onUpdateItem={(updates) => onUpdateItem(panelItem.id, updates)}
                        onUpdateItemData={(updater) => onUpdateItemData(panelItem.id, updater)}
                        isRightmostPanel={true}
                        isLeftPanel={false}
                    />
                </ResizablePanel>
            </ResizablePanelGroup>
        );
    }

    if (viewMode === 'panel+panel') {
        // Two item panels side by side, no workspace
        const leftItem = panelItems[0];
        const rightItem = panelItems[1];
        if (!leftItem || !rightItem) return <>{workspaceSection}</>;

        return (
            <ResizablePanelGroup
                id="split-view-panel-panel"
                orientation="horizontal"
                className="flex-1"
            >
                {/* Left Panel */}
                <ResizablePanel
                    id="split-left-panel"
                    defaultSize="50%"
                    minSize="25%"
                >
                    <ItemPanelContent
                        key={leftItem.id}
                        item={leftItem}
                        onClose={() => {
                            onFlushPendingChanges(leftItem.id);
                            closePanel(leftItem.id);
                        }}
                        onMaximize={() => setMaximizedItemId(leftItem.id)}
                        isMaximized={false}
                        onUpdateItem={(updates) => onUpdateItem(leftItem.id, updates)}
                        onUpdateItemData={(updater) => onUpdateItemData(leftItem.id, updater)}
                        isRightmostPanel={false}
                        isLeftPanel={true}
                    />
                </ResizablePanel>

                <ResizableHandle id="split-panel-handle" className="border-r border-sidebar-border" />

                {/* Right Panel */}
                <ResizablePanel
                    id="split-right-panel"
                    defaultSize="50%"
                    minSize="25%"
                >
                    <ItemPanelContent
                        key={rightItem.id}
                        item={rightItem}
                        onClose={() => {
                            onFlushPendingChanges(rightItem.id);
                            closePanel(rightItem.id);
                        }}
                        onMaximize={() => setMaximizedItemId(rightItem.id)}
                        isMaximized={false}
                        onUpdateItem={(updates) => onUpdateItem(rightItem.id, updates)}
                        onUpdateItemData={(updater) => onUpdateItemData(rightItem.id, updater)}
                        isRightmostPanel={true}
                        isLeftPanel={false}
                    />
                </ResizablePanel>
            </ResizablePanelGroup>
        );
    }

    // Default: just the workspace
    return <>{workspaceSection}</>;
}
