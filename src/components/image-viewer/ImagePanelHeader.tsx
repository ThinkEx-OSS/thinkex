"use client";

import { useState, useEffect, memo } from "react";
import { createPortal } from "react-dom";
import {
  X,
  RotateCcw,
  MoreHorizontal,
  Camera,
  Download,
  Expand,
} from "lucide-react";
import { LuMaximize2 } from "react-icons/lu";
import { formatKeyboardShortcut } from "@/lib/utils/keyboard-shortcut";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

import ChatFloatingButton from "@/components/chat/ChatFloatingButton";
import { useUIStore } from "@/lib/stores/ui-store";
import type { ImageViewerControls } from "./ImageViewer";

interface ImagePanelHeaderProps {
  itemName: string;
  isMaximized: boolean;
  onClose: () => void;
  onMaximize: () => void;
  controls: ImageViewerControls;
  renderInPortal?: boolean;
  imageSrc?: string;
}

export const ImagePanelHeader = memo(function ImagePanelHeader({
  itemName,
  isMaximized,
  onClose,
  onMaximize,
  controls,
  renderInPortal = false,
  imageSrc,
}: ImagePanelHeaderProps) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [portalRightTarget, setPortalRightTarget] =
    useState<HTMLElement | null>(null);

  useEffect(() => {
    if (renderInPortal) {
      setPortalTarget(document.getElementById("workspace-header-portal"));
      setPortalRightTarget(
        document.getElementById("workspace-header-portal-right"),
      );
    } else {
      setPortalTarget(null);
      setPortalRightTarget(null);
    }
  }, [renderInPortal]);

  const isChatExpanded = useUIStore((state) => state.isChatExpanded);
  const setIsChatExpanded = useUIStore((state) => state.setIsChatExpanded);

  const buttonClass =
    "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer border border-sidebar-border";
  const iconClass = "h-4 w-4";

  const captureButtonContent = (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={controls.toggleCapture}
          className={
            controls.isCapturing
              ? "inline-flex h-8 w-8 items-center justify-center rounded-md bg-blue-600 text-white transition-colors cursor-pointer border border-blue-600"
              : buttonClass
          }
        >
          <Camera className={iconClass} />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {controls.isCapturing ? (
          <>
            Cancel capture <Kbd className="ml-1">Esc</Kbd>{" "}
            <Kbd>{formatKeyboardShortcut("X", true)}</Kbd>
          </>
        ) : (
          <>
            Capture Area{" "}
            <Kbd className="ml-1">{formatKeyboardShortcut("X", true)}</Kbd>
          </>
        )}
      </TooltipContent>
    </Tooltip>
  );

  const imageOptionsDropdownContent = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={buttonClass}>
          <MoreHorizontal className={iconClass} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {imageSrc && (
          <DropdownMenuItem asChild>
            <a href={imageSrc} download target="_blank" rel="noopener noreferrer">
              <Download className="mr-2 h-4 w-4" />
              Download Image
            </a>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={controls.rotateLeft}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Rotate Left
        </DropdownMenuItem>
        <DropdownMenuItem onClick={controls.resetTransform}>
          <Expand className="mr-2 h-4 w-4" />
          Fit to View
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const controlsContent = (
    <>
      {captureButtonContent}
      {imageOptionsDropdownContent}
    </>
  );

  if (renderInPortal && (portalTarget || portalRightTarget)) {
    return (
      <>
        {portalTarget && createPortal(captureButtonContent, portalTarget)}
        {portalRightTarget &&
          createPortal(imageOptionsDropdownContent, portalRightTarget)}
      </>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between py-2 px-3 gap-2 h-12">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <div
            className="text-sm font-medium text-sidebar-foreground truncate"
            title={itemName}
          >
            {itemName}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {controlsContent}

          <div className="w-px h-4 bg-sidebar-border mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onMaximize}
                className={buttonClass}
                aria-label="Focus"
              >
                <LuMaximize2 className={iconClass} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Maximize</TooltipContent>
          </Tooltip>

          <button
            type="button"
            aria-label="Close"
            className={buttonClass}
            onClick={onClose}
          >
            <X className={iconClass} />
          </button>

          {!isChatExpanded && (
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
});
