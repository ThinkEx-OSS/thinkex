"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { LuMinimize2 } from "react-icons/lu";
import ChatFloatingButton from "@/components/chat/ChatFloatingButton";
import ItemHeader from "@/components/workspace-canvas/ItemHeader";
import CardRenderer from "@/components/workspace-canvas/CardRenderer";
import LazyAppPdfViewer from "@/components/pdf/LazyAppPdfViewer";
import { YouTubePanelContent } from "@/components/workspace-canvas/YouTubePanelContent";
import { WebsitePanelContent } from "@/components/workspace-canvas/WebsitePanelContent";
import { PdfPanelHeader } from "@/components/pdf/PdfPanelHeader";
import { getCardColorCSS, getWhiteTintedColor } from "@/lib/workspace-state/colors";
import type { Item, ItemData, PdfData } from "@/lib/workspace-state/types";
import { useUIStore } from "@/lib/stores/ui-store";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ItemPanelContentProps {
    item: Item;
    onClose: () => void;
    /** Return to workspace grid (fullscreen viewer only). */
    onMaximize: () => void;
    onUpdateItem: (updates: Partial<Item>) => void;
    onUpdateItemData: (updater: (prev: ItemData) => ItemData) => void;
}

export function ItemPanelContent({
    item,
    onClose,
    onMaximize,
    onUpdateItem,
    onUpdateItemData,
}: ItemPanelContentProps) {
    const isChatExpanded = useUIStore((state) => state.isChatExpanded);
    const setIsChatExpanded = useUIStore((state) => state.setIsChatExpanded);
    const citationHighlightQuery = useUIStore((state) => state.citationHighlightQuery);

    const isDesktop = true;

    const isPdf = item.type === 'pdf';
    const isYouTube = item.type === 'youtube';
    const isWebsite = item.type === 'website';
    const pdfPreviewUrl = isPdf ? (item.data as PdfData).fileUrl : undefined;
    /** PDF cards still processing upload have no viewer yet — need a local title bar. */
    const showPdfAwaitingFileHeader = isPdf && !pdfPreviewUrl;

    const [showThumbnails, setShowThumbnails] = useState(false);

    const renderPdfAwaitingFileHeader = () => (
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
                                aria-label="Back to workspace"
                                title="Back to workspace"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-sidebar-border text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
                                onClick={onMaximize}
                            >
                                <LuMinimize2 className="h-4 w-4" />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent>Back to workspace</TooltipContent>
                    </Tooltip>

                    <button
                        type="button"
                        aria-label="Close"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-sidebar-border text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
                        onClick={onClose}
                    >
                        <X className="h-4 w-4" />
                    </button>

                    {!isChatExpanded && (
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
                    ? getCardColorCSS(item.color, 0.08)
                    : "rgba(0, 0, 0, 0.08)",
                ['--note-bg-dark' as string]: item.color
                    ? getCardColorCSS(item.color, 0.1)
                    : "rgba(0, 0, 0, 0.1)",
                backgroundColor: 'var(--note-bg-light)',
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                transformOrigin: 'center',
            }}
        >
            {showPdfAwaitingFileHeader && renderPdfAwaitingFileHeader()}

            <div
                className={`${(isPdf && pdfPreviewUrl) || isYouTube || isWebsite ? "flex-1 flex flex-col min-h-0" : "flex-1 overflow-y-auto modal-scrollable flex flex-col"}`}
                style={(!isPdf || !pdfPreviewUrl) && !isYouTube && !isWebsite ? {
                    ['--scrollbar-color' as string]: item.color
                        ? getWhiteTintedColor(item.color, 0.7, 0.2)
                        : "rgba(255, 255, 255, 0.2)",
                } : undefined}
            >
                {isPdf && pdfPreviewUrl ? (
                    <div className="w-full flex-1 min-h-0 flex flex-col">
                        <LazyAppPdfViewer
                            pdfSrc={pdfPreviewUrl}
                            showThumbnails={showThumbnails}
                            itemName={item.name}
                            itemId={item.id}
                            initialPage={
                                citationHighlightQuery?.itemId === item.id &&
                                citationHighlightQuery?.pageNumber != null &&
                                citationHighlightQuery.pageNumber >= 1 &&
                                !citationHighlightQuery?.query?.trim()
                                    ? citationHighlightQuery.pageNumber
                                    : undefined
                            }
                            isMaximized={true}
                            renderHeader={(documentId, annotationControls) => (
                                <div>
                                    <PdfPanelHeader
                                        documentId={documentId}
                                        itemName={item.name}
                                        isMaximized={true}
                                        onClose={onClose}
                                        onMaximize={onMaximize}
                                        showThumbnails={showThumbnails}
                                        onToggleThumbnails={() => setShowThumbnails(!showThumbnails)}
                                        renderInPortal={true}
                                    />
                                </div>
                            )}
                        />
                    </div>
                ) : isYouTube ? (
                    <YouTubePanelContent
                        item={item}
                        onUpdateItemData={onUpdateItemData}
                    />
                ) : isWebsite ? (
                    <WebsitePanelContent
                        item={item}
                    />
                ) : (
                    <CardRenderer
                        key={item.id}
                        item={item}
                        onUpdateData={onUpdateItemData}
                        quizClassName={item.type === 'quiz' ? 'p-4 md:p-5 lg:p-6' : undefined}
                    />
                )}
            </div>
        </div>
    );
}
