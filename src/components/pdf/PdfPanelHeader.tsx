"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  memo,
  useLayoutEffect,
} from "react";
import { createPortal } from "react-dom";
import {
  X,
  RotateCcw,
  ChevronUp,
  ChevronDown,
  MoreHorizontal,
  Expand,
  Shrink,
  Camera,
  Download,
} from "lucide-react";
import { LuMaximize2 } from "react-icons/lu";
import { LuLayoutList } from "react-icons/lu";
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
import { useOptionalComposerActions } from "@/lib/stores/composer-actions-store";
import { toast } from "sonner";

// PDF Plugin imports
import { useZoom, ZoomMode } from "@embedpdf/plugin-zoom/react";
import { useRotate } from "@embedpdf/plugin-rotate/react";
import { useFullscreen } from "@embedpdf/plugin-fullscreen/react";

import { useScroll } from "@embedpdf/plugin-scroll/react";
import { useCapture } from "@embedpdf/plugin-capture/react";
import { useExportCapability } from "@embedpdf/plugin-export/react";
import { useDocumentState } from "@embedpdf/core/react";

interface PdfPanelHeaderProps {
  documentId: string;
  itemName: string;
  isMaximized: boolean;
  onClose: () => void;
  onMaximize: () => void;
  showThumbnails: boolean;
  onToggleThumbnails: () => void;
  renderInPortal?: boolean;
}

/**
 * Rotate a captured image blob to match the orientation the user sees in the viewer.
 *
 * The embedpdf capture plugin renders `renderPageRect` with rotation=0, so for any page
 * whose effective viewer rotation is non-zero (either page.rotation from the PDF itself —
 * common for landscape pages encoded as portrait + 90° — or a user-applied rotation via
 * the rotate plugin), the produced bitmap is in the unrotated PDF coordinate space and
 * looks sideways relative to what the user marqueed. This re-encodes it to match.
 */
async function rotateCaptureBlob(
  blob: Blob,
  rotation: number,
  type: string,
): Promise<Blob> {
  const r = ((rotation % 4) + 4) % 4;
  if (r === 0) return blob;

  const bitmap = await createImageBitmap(blob);
  try {
    const w = bitmap.width;
    const h = bitmap.height;
    const swap = r === 1 || r === 3;

    const canvas = document.createElement("canvas");
    canvas.width = swap ? h : w;
    canvas.height = swap ? w : h;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get 2D canvas context");

    // Match the CSS transform applied by @embedpdf/plugin-rotate: 1=90°CW, 2=180°, 3=270°CW.
    switch (r) {
      case 1:
        ctx.translate(h, 0);
        ctx.rotate(Math.PI / 2);
        break;
      case 2:
        ctx.translate(w, h);
        ctx.rotate(Math.PI);
        break;
      case 3:
        ctx.translate(0, w);
        ctx.rotate(-Math.PI / 2);
        break;
    }
    ctx.drawImage(bitmap, 0, 0);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) =>
          b
            ? resolve(b)
            : reject(new Error("Failed to encode rotated capture")),
        type || "image/png",
      );
    });
  } finally {
    bitmap.close();
  }
}

// Track mounted PdfPanelHeader instances so only the most recent one
// responds to the global Cmd+Shift+C shortcut (avoids firing on every
// panel when multiple PDFs are open).
const _mountedPanelStack: string[] = [];

export const PdfPanelHeader = memo(function PdfPanelHeader({
  documentId,
  itemName,
  isMaximized,
  onClose,
  onMaximize,
  showThumbnails,
  onToggleThumbnails,
  renderInPortal = false,
}: PdfPanelHeaderProps) {
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
  const { provides: zoomProvides, state: zoomState } = useZoom(documentId);
  const { provides: rotateProvider } = useRotate(documentId);
  const { provides: fullscreenProvider, state: fullscreenState } =
    useFullscreen();

  const { provides: capture, state: captureState } = useCapture(documentId);
  const { provides: exportCapability } = useExportCapability();
  const exportProvider = exportCapability?.forDocument(documentId);

  // Stabilize capture ref — useCapture returns a new scope object every render
  // which would cause useEffect to re-subscribe on every render
  const captureRef = useRef(capture);
  captureRef.current = capture;

  // Stabilize documentState ref — used inside onCaptureArea to read the page's
  // natural rotation and the user's applied rotation without re-subscribing.
  const documentState = useDocumentState(documentId);
  const documentStateRef = useRef(documentState);
  documentStateRef.current = documentState;

  const promptInput = useOptionalComposerActions();
  const promptInputRef = useRef(promptInput);
  promptInputRef.current = promptInput;

  const isChatExpanded = useUIStore((state) => state.isChatExpanded);
  const setIsChatExpanded = useUIStore((state) => state.setIsChatExpanded);

  // Handle Capture — use refs for unstable values to prevent effect re-firing
  useEffect(() => {
    const cap = captureRef.current;
    if (!cap) return;

    const unsubscribe = cap.onCaptureArea(async (result) => {
      try {
        // The capture plugin always renders at rotation=0, so for landscape PDFs
        // (page.rotation != 0) or a user-applied rotation the bitmap comes back
        // sideways relative to what the user marqueed. Re-orient client-side to
        // match the visible viewer orientation: (page.rotation + doc.rotation) % 4.
        const ds = documentStateRef.current;
        const page = ds?.document?.pages?.[result.pageIndex];
        const pageRotation = page?.rotation ?? 0;
        const docRotation = ds?.rotation ?? 0;
        const effectiveRotation = (pageRotation + docRotation) % 4;

        const orientedBlob = await rotateCaptureBlob(
          result.blob,
          effectiveRotation,
          result.imageType,
        );

        // Convert blob to File
        const filename = `capture-page-${result.pageIndex + 1}-${Date.now()}.png`;
        const file = new File([orientedBlob], filename, {
          type: result.imageType,
        });

        // Add attachment to composer
        const promptInput = promptInputRef.current;
        if (!promptInput) {
          throw new Error("Chat composer not ready");
        }
        await promptInput.addAttachments([file]);
        toast.success("Screenshot added to chat");

        // Turn off capture mode
        captureRef.current?.toggleMarqueeCapture();

        promptInput.focusInput({ cursorAtEnd: true });
      } catch (error) {
        console.error("Failed to add capture attachment:", error);
        toast.error("Failed to add screenshot");
      }
    });

    return () => {
      unsubscribe();
    };
    // Only re-subscribe when documentId changes (capture scope depends on it)
  }, [documentId]);

  useEffect(() => {
    if (!captureState.isMarqueeCaptureActive) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      captureRef.current?.toggleMarqueeCapture();
    };
    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [captureState.isMarqueeCaptureActive]);

  // Register / unregister this panel on the module-level stack so only
  // the topmost (most-recently-mounted) panel owns the global shortcut.
  useEffect(() => {
    _mountedPanelStack.push(documentId);
    return () => {
      const idx = _mountedPanelStack.lastIndexOf(documentId);
      if (idx >= 0) _mountedPanelStack.splice(idx, 1);
    };
  }, [documentId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Only the topmost panel responds to the shortcut.
      if (_mountedPanelStack[_mountedPanelStack.length - 1] !== documentId) return;
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        captureRef.current?.toggleMarqueeCapture();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [documentId]);

  const zoomPercent = zoomState?.currentZoomLevel
    ? Math.round(zoomState.currentZoomLevel * 100)
    : 100;

  const buttonClass =
    "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer border border-sidebar-border";
  const activeButtonClass =
    "inline-flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-accent text-sidebar-foreground transition-colors cursor-pointer border border-sidebar-border";
  const iconClass = "h-4 w-4"; // Consistent with other headers

  const captureButtonContent = (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => capture?.toggleMarqueeCapture()}
          className={
            captureState.isMarqueeCaptureActive
              ? "inline-flex h-8 w-8 items-center justify-center rounded-md bg-blue-600 text-white transition-colors cursor-pointer border border-blue-600"
              : buttonClass
          }
        >
          <Camera className={iconClass} />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {captureState.isMarqueeCaptureActive
          ? <>Cancel capture <Kbd className="ml-1">Esc</Kbd></>
          : <>Capture Area <Kbd className="ml-1">{formatKeyboardShortcut("C", true)}</Kbd></>}
      </TooltipContent>
    </Tooltip>
  );

  const pdfOptionsDropdownContent = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer border border-sidebar-border">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={onToggleThumbnails}>
          <LuLayoutList className="mr-2 h-4 w-4" />
          Thumbnail
        </DropdownMenuItem>
        {exportProvider && (
          <DropdownMenuItem onClick={() => exportProvider.download()}>
            <Download className="mr-2 h-4 w-4" />
            Download PDF
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => zoomProvides?.requestZoom(ZoomMode.FitWidth)}
        >
          <Expand className="mr-2 h-4 w-4" />
          Fit to Width
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => rotateProvider?.rotateBackward()}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Rotate Left
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const controlsContent = (
    <>
      {captureButtonContent}
      {pdfOptionsDropdownContent}
    </>
  );

  if (renderInPortal && (portalTarget || portalRightTarget)) {
    return (
      <>
        {portalTarget && createPortal(captureButtonContent, portalTarget)}
        {portalRightTarget &&
          createPortal(pdfOptionsDropdownContent, portalRightTarget)}
      </>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Main Header Row */}
      <div className="flex items-center justify-between py-2 px-3 gap-2 h-12">
        {/* Left: Title */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <div
            className="text-sm font-medium text-sidebar-foreground truncate"
            title={itemName}
          >
            {itemName}
          </div>
        </div>

        {/* Right: Controls (Hover Only) */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {controlsContent}

          <div className="w-px h-4 bg-sidebar-border mx-1" />

          {/* Focus / Replace Button */}
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

          {/* Close Button */}
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
