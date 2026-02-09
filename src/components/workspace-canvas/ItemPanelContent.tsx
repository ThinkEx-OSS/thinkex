"use client";

import { useState } from "react";
import { X, Maximize, Minimize } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import ChatFloatingButton from "@/components/chat/ChatFloatingButton";
import { formatKeyboardShortcut } from "@/lib/utils/keyboard-shortcut";
import ItemHeader from "@/components/workspace-canvas/ItemHeader";
import CardRenderer from "@/components/workspace-canvas/CardRenderer";
import LazyAppPdfViewer from "@/components/pdf/LazyAppPdfViewer";
import { PdfPanelHeader } from "@/components/pdf/PdfPanelHeader";
import { getCardColorCSS, getCardAccentColor, getWhiteTintedColor } from "@/lib/workspace-state/colors";
import type { Item, ItemData, PdfData } from "@/lib/workspace-state/types";
import { useUIStore } from "@/lib/stores/ui-store";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ItemPanelContentProps {
    item: Item;
    onClose: () => void;
    onMaximize: () => void;
    isMaximized?: boolean;
    onUpdateItem: (updates: Partial<Item>) => void;
    onUpdateItemData: (updater: (prev: ItemData) => ItemData) => void;
    isRightmostPanel?: boolean; // Whether this is the rightmost panel (for showing chat button)
    isLeftPanel?: boolean; // Whether this is the leftmost panel (for showing sidebar trigger)
}

export function ItemPanelContent({
    item,
    onClose,
    onMaximize,
    isMaximized = false,
    onUpdateItem,
    onUpdateItemData,
    isRightmostPanel = true, // Default to true for backwards compat
    isLeftPanel = false, // Default to false for backwards compat
}: ItemPanelContentProps) {
    const isChatExpanded = useUIStore((state) => state.isChatExpanded);
    const setIsChatExpanded = useUIStore((state) => state.setIsChatExpanded);
    const workspaceSplitViewActive = useUIStore((state) => state.workspaceSplitViewActive);
    const isDesktop = true;

    const isPdf = item.type === 'pdf';
    const pdfData = item.data as PdfData;

    // PDF-specific state
    const [showThumbnails, setShowThumbnails] = useState(false);

    const accentColor = item.color
        ? getCardAccentColor(item.color, 0.2)
        : "rgba(255, 255, 255, 0.15)";

    const backgroundColor = item.color
        ? getCardColorCSS(item.color, 0.05) // Lighter opacity for better light mode appearance
        : "rgba(0, 0, 0, 0.05)"; // Lighter default background

    // Standard header for non-PDF items
    const renderStandardHeader = () => (
        <div>
            <div className="flex items-center justify-between py-2 px-3">
                <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden mr-2">
                    <ItemHeader
                        id={item.id}
                        name={item.name}
                        subtitle={item.subtitle}
                        description=""
                        onNameChange={(v) => onUpdateItem({ name: v })}
                        onNameCommit={(v) => onUpdateItem({ name: v })}
                        onSubtitleChange={(v) => onUpdateItem({ subtitle: v })}
                        noMargin={true}
                        textSize="lg"
                        fullWidth
                    />
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                type="button"
                                aria-label={isMaximized ? "Restore to Panel" : "Maximize to Modal"}
                                title={isMaximized ? "Restore to Panel" : "Maximize to Modal"}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-sidebar-border text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
                                onClick={onMaximize}
                            >
                                {isMaximized ? (
                                    <Minimize className="h-4 w-4" />
                                ) : (
                                    <Maximize className="h-4 w-4" />
                                )}
                            </button>
                        </TooltipTrigger>
                        <TooltipContent>
                            {isMaximized ? "Restore to Panel" : "Maximize to Modal"}
                        </TooltipContent>
                    </Tooltip>

                    {/* Split View / Focus Button */}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                type="button"
                                aria-label={workspaceSplitViewActive ? "Focus" : "Split View"}
                                title={workspaceSplitViewActive ? "Focus" : "Split View"}
                                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-sidebar-border text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer px-3"
                                onClick={() => {
                                    const { toggleWorkspaceSplitView } = useUIStore.getState();
                                    toggleWorkspaceSplitView();
                                }}
                            >
                                {workspaceSplitViewActive ? (
                                    // Focus icon - eye
                                    <svg
                                        viewBox="0 0 24 24"
                                        className="w-4 h-4"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                        <circle cx="12" cy="12" r="3" />
                                    </svg>
                                ) : (
                                    // Split View icon
                                    <svg
                                        viewBox="0 0 24 24"
                                        className="w-4 h-4"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <rect x="3" y="3" width="18" height="18" rx="2" />
                                        <line x1="12" y1="3" x2="12" y2="21" />
                                    </svg>
                                )}
                                <span className="text-xs font-medium">
                                    {workspaceSplitViewActive ? "Focus" : "Split View"}
                                </span>
                            </button>
                        </TooltipTrigger>
                        <TooltipContent>
                            {workspaceSplitViewActive ? "Focus on this item" : "Split View"}
                        </TooltipContent>
                    </Tooltip>

                    <button
                        type="button"
                        aria-label="Close"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-sidebar-border text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
                        onClick={onClose}
                    >
                        <X className="h-4 w-4" />
                    </button>

                    {!isChatExpanded && isRightmostPanel && (
                        <ChatFloatingButton
                            isDesktop={isDesktop}
                            isChatExpanded={isChatExpanded}
                            setIsChatExpanded={setIsChatExpanded}
                        />
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <div
            className="w-full h-full flex flex-col overflow-hidden relative note-panel-background"
            style={{
                ['--note-bg-light' as string]: item.color
                    ? getCardColorCSS(item.color, 0.08) // More visible but still light for light mode
                    : "rgba(0, 0, 0, 0.08)",
                ['--note-bg-dark' as string]: item.color
                    ? getCardColorCSS(item.color, 0.1) // Darker opacity for dark mode
                    : "rgba(0, 0, 0, 0.1)",
                backgroundColor: 'var(--note-bg-light)',
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                transformOrigin: 'center',
            }}
        >
            {/* Header - PDF has integrated controls, others use standard header.
                When maximized, the header is integrated into the WorkspaceHeader, so we hide it here. */}
            {!isPdf && !isMaximized && renderStandardHeader()}

            {/* Content */}
            <div
                className={`${isPdf ? "flex-1 flex flex-col min-h-0" : "flex-1 overflow-y-auto modal-scrollable flex flex-col"}`}
                style={!isPdf ? {
                    ['--scrollbar-color' as string]: item.color
                        ? getWhiteTintedColor(item.color, 0.7, 0.2)
                        : "rgba(255, 255, 255, 0.2)",
                } : undefined}
            >
                {isPdf && pdfData?.fileUrl ? (
                    <div className="w-full flex-1 min-h-0 flex flex-col">
                        <LazyAppPdfViewer
                            pdfSrc={pdfData.fileUrl}
                            showThumbnails={showThumbnails}
                            itemName={item.name}
                            isMaximized={isMaximized}
                            renderHeader={(documentId, annotationControls) => (
                                <div>
                                    <PdfPanelHeader
                                        documentId={documentId}
                                        itemName={item.name}
                                        isMaximized={isMaximized}
                                        onClose={onClose}
                                        onMaximize={onMaximize}
                                        showThumbnails={showThumbnails}
                                        onToggleThumbnails={() => setShowThumbnails(!showThumbnails)}

                                        isRightmostPanel={isRightmostPanel}
                                        isLeftPanel={isLeftPanel}
                                        renderInPortal={isMaximized}
                                    />
                                </div>
                            )}
                        />
                    </div>
                ) : (
                    <CardRenderer
                        key={item.id}
                        item={item}
                        onUpdateData={onUpdateItemData}
                    />
                )}
            </div>
        </div>
    );
}
