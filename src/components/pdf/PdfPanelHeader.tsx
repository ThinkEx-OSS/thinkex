'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from "react-dom";
import { X, RotateCcw, Search, Maximize, Minimize, ChevronUp, ChevronDown, MoreHorizontal, Expand, Shrink, Camera } from 'lucide-react';
import { LuLayoutList } from "react-icons/lu";
import { formatKeyboardShortcut } from '@/lib/utils/keyboard-shortcut';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import ChatFloatingButton from "@/components/chat/ChatFloatingButton";
import { useUIStore } from "@/lib/stores/ui-store";
import { useAui } from "@assistant-ui/react";
import { toast } from "sonner";

// PDF Plugin imports
import { useZoom, ZoomMode } from '@embedpdf/plugin-zoom/react';
import { useRotate } from '@embedpdf/plugin-rotate/react';
import { useFullscreen } from '@embedpdf/plugin-fullscreen/react';
import { useSearch } from '@embedpdf/plugin-search/react';
import { useScroll } from '@embedpdf/plugin-scroll/react';
import { useCapture } from '@embedpdf/plugin-capture/react';
// Separate SearchBar component - mounts fresh so autoFocus works
interface SearchBarProps {
    searchProvides: ReturnType<typeof useSearch>['provides'];
    searchState: ReturnType<typeof useSearch>['state'];
    onClose: () => void;
    searchInputRef: React.RefObject<HTMLInputElement | null>;
    documentId: string;
}

function SearchBar({ searchProvides, searchState, onClose, searchInputRef, documentId }: SearchBarProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const { provides: scroll } = useScroll(documentId);

    // Sync search with input
    useEffect(() => {
        if (searchQuery === '') {
            searchProvides?.stopSearch();
        } else if (searchQuery.length > 2) {
            searchProvides?.searchAllPages(searchQuery);
        }
    }, [searchQuery, searchProvides]);

    // Scroll to a specific result by index
    const scrollToResult = useCallback((index: number) => {
        if (!searchState?.results || !scroll) return;
        const result = searchState.results[index];
        if (!result) return;

        // Get minimum coordinates from the result rects
        const minCoords = result.rects.reduce(
            (min, rect) => ({
                x: Math.min(min.x, rect.origin.x),
                y: Math.min(min.y, rect.origin.y),
            }),
            { x: Infinity, y: Infinity }
        );

        scroll.scrollToPage({
            pageNumber: result.pageIndex + 1,
            pageCoordinates: minCoords,
            alignX: 50,
            alignY: 50,
        });
    }, [searchState?.results, scroll]);

    // Handle next result and scroll
    const handleNextResult = useCallback(() => {
        searchProvides?.nextResult();
        // Scroll to the next result (current + 1, wrapping around)
        if (searchState?.results && searchState.results.length > 0) {
            const nextIndex = ((searchState.activeResultIndex ?? 0) + 1) % searchState.results.length;
            scrollToResult(nextIndex);
        }
    }, [searchProvides, searchState, scrollToResult]);

    // Handle previous result and scroll
    const handlePreviousResult = useCallback(() => {
        searchProvides?.previousResult();
        // Scroll to the previous result (current - 1, wrapping around)
        if (searchState?.results && searchState.results.length > 0) {
            const prevIndex = ((searchState.activeResultIndex ?? 0) - 1 + searchState.results.length) % searchState.results.length;
            scrollToResult(prevIndex);
        }
    }, [searchProvides, searchState, scrollToResult]);

    // Handle Enter key to cycle through results
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && searchState?.results && searchState.results.length > 0) {
            e.preventDefault();
            if (e.shiftKey) {
                handlePreviousResult();
            } else {
                handleNextResult();
            }
        }
    }, [searchState, handleNextResult, handlePreviousResult]);

    const handleClear = useCallback(() => {
        setSearchQuery('');
        searchProvides?.stopSearch();
        onClose();
    }, [searchProvides, onClose]);

    // Determine if we should show "no results" message
    const showNoResults = searchQuery.length > 2 && searchState?.results && searchState.results.length === 0 && !searchState.loading;

    return (
        <div className="px-3 py-1.5 border-t border-sidebar-border/50 flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2">
                <input
                    type="text"
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Search in document..."
                    className="flex-1 px-2 py-1 rounded bg-sidebar-accent/50 border border-sidebar-border text-sidebar-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:border-sidebar-foreground/30"
                />
            </div>
            {/* No results message */}
            {showNoResults && (
                <span className="text-xs text-sidebar-foreground/50">No results</span>
            )}
            {/* Results navigation */}
            {searchState?.results && searchState.results.length > 0 && (
                <div className="flex items-center gap-1 text-xs text-sidebar-foreground/60">
                    <span>
                        {(searchState.activeResultIndex ?? 0) + 1}/{searchState.total ?? searchState.results.length}
                    </span>
                    <button
                        onClick={handlePreviousResult}
                        className="p-0.5 rounded hover:bg-sidebar-accent"
                    >
                        <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                        onClick={handleNextResult}
                        className="p-0.5 rounded hover:bg-sidebar-accent"
                    >
                        <ChevronDown className="h-3 w-3" />
                    </button>
                </div>
            )}
            <button
                onClick={handleClear}
                className="p-1 rounded hover:bg-sidebar-accent text-muted-foreground hover:text-sidebar-foreground transition-colors"
                title="Close Search"
            >
                <X className="h-3.5 w-3.5" />
            </button>
        </div>
    );
}

interface PdfPanelHeaderProps {
    documentId: string;
    itemName: string;
    isMaximized: boolean;
    onClose: () => void;
    onMaximize: () => void;
    showThumbnails: boolean;
    onToggleThumbnails: () => void;

    isRightmostPanel?: boolean; // Whether this is the rightmost panel (for showing chat button)

    isLeftPanel?: boolean; // Whether this is the leftmost panel (for showing sidebar trigger)
    renderInPortal?: boolean;
}


export function PdfPanelHeader({
    documentId,
    itemName,
    isMaximized,
    onClose,
    onMaximize,
    showThumbnails,
    onToggleThumbnails,

    isRightmostPanel = true, // Default to true for backwards compat
    isLeftPanel = false, // Default to false for backwards compat
    renderInPortal = false,
}: PdfPanelHeaderProps) {
    const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

    useEffect(() => {
        if (renderInPortal) {
            setPortalTarget(document.getElementById("workspace-header-portal"));
        } else {
            setPortalTarget(null);
        }
    }, [renderInPortal]);
    const { provides: zoomProvides, state: zoomState } = useZoom(documentId);
    const { provides: rotateProvider } = useRotate(documentId);
    const { provides: fullscreenProvider, state: fullscreenState } = useFullscreen();
    const { provides: searchProvides, state: searchState } = useSearch(documentId);
    const { provides: capture, state: captureState } = useCapture(documentId);

    const aui = useAui();

    const isChatExpanded = useUIStore((state) => state.isChatExpanded);
    const setIsChatExpanded = useUIStore((state) => state.setIsChatExpanded);

    const [showSearch, setShowSearch] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Auto-focus search input when expanded (like workspace header)
    useEffect(() => {
        if (showSearch && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [showSearch]);

    // Intercept Ctrl+F / Cmd+F to open search bar
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
                e.preventDefault();
                setShowSearch(true);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Handle Capture
    useEffect(() => {
        if (!capture) return;

        const unsubscribe = capture.onCaptureArea(async (result) => {
            try {
                // Convert blob to File
                const filename = `capture-page-${result.pageIndex + 1}-${Date.now()}.png`;
                const file = new File([result.blob], filename, { type: result.imageType });

                // Add attachment to composer
                await aui.composer().addAttachment(file);
                toast.success("Screenshot added to chat");

                // Turn off capture mode
                if (captureState.isMarqueeCaptureActive) {
                    capture.toggleMarqueeCapture();
                }

            } catch (error) {
                console.error("Failed to add capture attachment:", error);
                toast.error("Failed to add screenshot");
            }
        });

        return () => {
            unsubscribe();
        };
    }, [capture, aui, captureState.isMarqueeCaptureActive]);


    const zoomPercent = zoomState?.currentZoomLevel
        ? Math.round(zoomState.currentZoomLevel * 100)
        : 100;

    const buttonClass = "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer border border-sidebar-border";
    const activeButtonClass = "inline-flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-accent text-sidebar-foreground transition-colors cursor-pointer border border-sidebar-border";
    const iconClass = "h-4 w-4"; // Consistent with other headers



    const ControlsGroup = () => (
        <>
            {/* Thumbnail Toggle */}
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        onClick={onToggleThumbnails}
                        className={showThumbnails ? activeButtonClass : buttonClass}
                    >
                        <LuLayoutList className={iconClass} />
                    </button>
                </TooltipTrigger>
                <TooltipContent>{showThumbnails ? 'Hide Thumbnails' : 'Show Thumbnails'}</TooltipContent>
            </Tooltip>

            {/* Zoom Dropdown */}
            <DropdownMenu>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                            <button className="inline-flex h-8 items-center justify-center rounded-md px-2 text-sm text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer min-w-[50px] border border-sidebar-border">
                                {zoomPercent}%
                                <ChevronDown className="ml-1 h-3 w-3 opacity-50" />
                            </button>
                        </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Zoom Options</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end" className="w-32">
                    <DropdownMenuItem onClick={() => zoomProvides?.requestZoom(ZoomMode.FitPage)}>
                        Fit to Page
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => zoomProvides?.requestZoom(ZoomMode.FitWidth)}>
                        Fit to Width
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {[50, 75, 100, 125, 150, 200].map((percent) => (
                        <DropdownMenuItem
                            key={percent}
                            onClick={() => zoomProvides?.requestZoom(percent / 100)}
                        >
                            {percent}%
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>



            {/* Capture Button */}
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        onClick={() => capture?.toggleMarqueeCapture()}
                        className={captureState.isMarqueeCaptureActive ? "inline-flex h-8 w-8 items-center justify-center rounded-md bg-blue-600 text-white transition-colors cursor-pointer border border-blue-600" : buttonClass}
                    >
                        <Camera className={iconClass} />
                    </button>
                </TooltipTrigger>
                <TooltipContent>{captureState.isMarqueeCaptureActive ? "Cancel Capture" : "Capture Area"}</TooltipContent>
            </Tooltip>



            {/* Rotate Button */}
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        onClick={() => rotateProvider?.rotateBackward()}
                        className={buttonClass}
                    >
                        <RotateCcw className={iconClass} />
                    </button>
                </TooltipTrigger>
                <TooltipContent>Rotate Left</TooltipContent>
            </Tooltip>


        </>
    );

    const SearchBarComponent = () => (
        showSearch ? (
            <SearchBar
                searchProvides={searchProvides}
                searchState={searchState}
                onClose={() => setShowSearch(false)}
                searchInputRef={searchInputRef}
                documentId={documentId}
            />
        ) : null
    );

    if (renderInPortal && portalTarget) {
        return (
            <>
                {createPortal(<ControlsGroup />, portalTarget)}
                <SearchBarComponent />
            </>
        );
    }

    return (
        <div className="flex flex-col">
            {/* Main Header Row */}
            <div className="flex items-center justify-between py-2 px-3 gap-2">
                {/* Left: Thumbnails + Title */}
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <ControlsGroup />



                    {isMaximized && (
                        <span className="text-sm font-medium text-sidebar-foreground truncate ml-1">
                            {itemName}
                        </span>
                    )}
                </div>



                {/* Right: Fullscreen, More, Close (Standard Controls) */}
                <div className="flex items-center gap-2 flex-shrink-0">

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                onClick={onMaximize}
                                className={buttonClass}
                            >
                                {isMaximized ? (
                                    <Minimize className={iconClass} />
                                ) : (
                                    <Maximize className={iconClass} />
                                )}
                            </button>
                        </TooltipTrigger>
                        <TooltipContent>{isMaximized ? 'Restore to Panel' : 'Maximize to Modal'}</TooltipContent>
                    </Tooltip>





                    {/* Close Button */}
                    <button
                        type="button"
                        aria-label="Close"
                        className={buttonClass}
                        onClick={onClose}
                    >
                        <X className={iconClass} />
                    </button>

                    {!isChatExpanded && isRightmostPanel && (
                        <div className="ml-1">
                            <ChatFloatingButton
                                isDesktop={true}
                                isChatExpanded={isChatExpanded}
                                setIsChatExpanded={setIsChatExpanded}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Search Bar (collapsible) - separate component for proper autoFocus */}
            <SearchBarComponent />

        </div>
    );
}
