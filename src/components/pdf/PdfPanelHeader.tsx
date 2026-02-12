'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from "react-dom";
import { X, RotateCcw, Maximize, Minimize, ChevronUp, ChevronDown, MoreHorizontal, Expand, Shrink, Camera } from 'lucide-react';
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

import { useScroll } from '@embedpdf/plugin-scroll/react';
import { useCapture } from '@embedpdf/plugin-capture/react';
// Separate SearchBar component - mounts fresh so autoFocus works


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

    const { provides: capture, state: captureState } = useCapture(documentId);

    const aui = useAui();

    const isChatExpanded = useUIStore((state) => state.isChatExpanded);
    const setIsChatExpanded = useUIStore((state) => state.setIsChatExpanded);





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

            {/* PDF Options Dropdown */}
            <DropdownMenu>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                            <button className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer border border-sidebar-border">
                                <MoreHorizontal className="h-4 w-4" />
                            </button>
                        </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>PDF Options</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={() => zoomProvides?.requestZoom(ZoomMode.FitWidth)}>
                        <Expand className="mr-2 h-4 w-4" />
                        Fit to Width
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => rotateProvider?.rotateBackward()}>
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Rotate Left
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>





        </>
    );



    if (renderInPortal && portalTarget) {
        return (
            <>
                {createPortal(<ControlsGroup />, portalTarget)}

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



        </div>
    );
}
