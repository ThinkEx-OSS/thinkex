"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import {
  TransformWrapper,
  TransformComponent,
  useControls,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import { ImageIcon, ImageOffIcon, Loader2 } from "lucide-react";
import { useOptionalComposerActions } from "@/lib/stores/composer-actions-store";
import { extractImageRegion, addCaptureToChat } from "@/lib/capture/capture-utils";
import { toast } from "sonner";

export interface ImageViewerControls {
  zoomIn: () => void;
  zoomOut: () => void;
  resetTransform: () => void;
  zoomLevel: number;
  rotation: number;
  rotateLeft: () => void;
  isCapturing: boolean;
  toggleCapture: () => void;
}

interface ImageViewerProps {
  src: string;
  alt?: string;
  itemName: string;
  itemId?: string;
  isMaximized?: boolean;
  renderHeader?: (controls: ImageViewerControls) => ReactNode;
}

const _mountedImagePanelStack: string[] = [];

function ImageViewerInner({
  src,
  alt,
  itemName,
  rotation,
  isCapturing,
  setIsCapturing,
  onZoomChange,
  registerControls,
}: {
  src: string;
  alt?: string;
  itemName: string;
  rotation: number;
  isCapturing: boolean;
  setIsCapturing: (v: boolean) => void;
  onZoomChange: (scale: number) => void;
  registerControls: (c: {
    zoomIn: () => void;
    zoomOut: () => void;
    resetTransform: () => void;
  }) => void;
}) {
  const { zoomIn, zoomOut, resetTransform, centerView } = useControls();
  const composerActions = useOptionalComposerActions();
  const composerRef = useRef(composerActions);
  composerRef.current = composerActions;

  const [loaded, setLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [marqueeStart, setMarqueeStart] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [marqueeEnd, setMarqueeEnd] = useState<{ x: number; y: number } | null>(
    null,
  );

  useEffect(() => {
    registerControls({ zoomIn, zoomOut, resetTransform });
  }, [zoomIn, zoomOut, resetTransform, registerControls]);

  useEffect(() => {
    if (loaded) {
      centerView(undefined, 0);
    }
  }, [loaded, centerView]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isCapturing) return;
      const rect = overlayRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMarqueeStart({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
      setMarqueeEnd(null);
    },
    [isCapturing],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isCapturing || !marqueeStart) return;
      const rect = overlayRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMarqueeEnd({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    },
    [isCapturing, marqueeStart],
  );

  const handleMouseUp = useCallback(
    async (e: React.MouseEvent) => {
      if (!isCapturing || !marqueeStart) return;
      const overlay = overlayRef.current;
      const img = imgRef.current;
      if (!overlay || !img) return;

      const endPt = {
        x: e.clientX - overlay.getBoundingClientRect().left,
        y: e.clientY - overlay.getBoundingClientRect().top,
      };

      const selX = Math.min(marqueeStart.x, endPt.x);
      const selY = Math.min(marqueeStart.y, endPt.y);
      const selW = Math.abs(endPt.x - marqueeStart.x);
      const selH = Math.abs(endPt.y - marqueeStart.y);

      setMarqueeStart(null);
      setMarqueeEnd(null);

      if (selW < 5 || selH < 5) return;

      try {
        const imgRect = img.getBoundingClientRect();
        const overlayRect = overlay.getBoundingClientRect();

        const imgLeft = imgRect.left - overlayRect.left;
        const imgTop = imgRect.top - overlayRect.top;
        const imgDisplayW = imgRect.width;
        const imgDisplayH = imgRect.height;

        const nw = img.naturalWidth;
        const nh = img.naturalHeight;
        const r = ((rotation % 4) + 4) % 4;
        const swap = r === 1 || r === 3;
        const visibleW = swap ? nh : nw;
        const visibleH = swap ? nw : nh;

        const scaleX = visibleW / imgDisplayW;
        const scaleY = visibleH / imgDisplayH;

        const clipX = Math.max(0, selX - imgLeft);
        const clipY = Math.max(0, selY - imgTop);
        const clipRight = Math.min(imgDisplayW, selX + selW - imgLeft);
        const clipBottom = Math.min(imgDisplayH, selY + selH - imgTop);
        const clipW = clipRight - clipX;
        const clipH = clipBottom - clipY;

        if (clipW < 2 || clipH < 2) return;

        const regionX = Math.round(clipX * scaleX);
        const regionY = Math.round(clipY * scaleY);
        const regionW = Math.round(clipW * scaleX);
        const regionH = Math.round(clipH * scaleY);

        const blob = await extractImageRegion(
          src,
          { x: regionX, y: regionY, width: regionW, height: regionH },
          rotation,
          "image/png",
        );

        const filename = `capture-${itemName.replace(/[^a-zA-Z0-9]/g, "_")}-${Date.now()}.png`;
        await addCaptureToChat(blob, filename, "image/png", composerRef.current);
        setIsCapturing(false);
      } catch (error) {
        console.error("Failed to capture image region:", error);
        toast.error("Failed to capture screenshot");
      }
    },
    [isCapturing, marqueeStart, rotation, src, itemName, setIsCapturing],
  );

  const marqueeRect =
    marqueeStart && marqueeEnd
      ? {
          x: Math.min(marqueeStart.x, marqueeEnd.x),
          y: Math.min(marqueeStart.y, marqueeEnd.y),
          width: Math.abs(marqueeEnd.x - marqueeStart.x),
          height: Math.abs(marqueeEnd.y - marqueeStart.y),
        }
      : null;

  const swap = rotation === 1 || rotation === 3;

  if (hasError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 p-4 text-center">
        <ImageOffIcon className="size-12 text-muted-foreground shrink-0" />
        <p className="text-sm text-muted-foreground">
          Image couldn&apos;t be displayed
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      )}
      <TransformComponent
        wrapperStyle={{
          width: "100%",
          height: "100%",
          cursor: isCapturing ? "crosshair" : "grab",
        }}
        contentStyle={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <img
          ref={imgRef}
          src={src}
          alt={alt || itemName}
          className={`max-w-full max-h-full object-contain select-none ${!loaded ? "invisible" : ""}`}
          style={{
            transform: `rotate(${rotation * 90}deg)`,
            ...(swap
              ? { maxWidth: "100vh", maxHeight: "100vw" }
              : {}),
          }}
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setHasError(true)}
        />
      </TransformComponent>

      {isCapturing && (
        <div
          ref={overlayRef}
          className="absolute inset-0 z-20"
          style={{ cursor: "crosshair" }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          {marqueeRect && marqueeRect.width > 0 && marqueeRect.height > 0 && (
            <div
              className="absolute border-2 border-dashed border-blue-500 bg-blue-500/10 pointer-events-none"
              style={{
                left: marqueeRect.x,
                top: marqueeRect.y,
                width: marqueeRect.width,
                height: marqueeRect.height,
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default function ImageViewer({
  src,
  alt,
  itemName,
  itemId,
  isMaximized,
  renderHeader,
}: ImageViewerProps) {
  const [rotation, setRotation] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100);
  const controlsRef = useRef<{
    zoomIn: () => void;
    zoomOut: () => void;
    resetTransform: () => void;
  } | null>(null);

  const panelId = itemId || src;

  const rotateLeft = useCallback(() => {
    setRotation((prev) => (prev + 3) % 4);
  }, []);

  const toggleCapture = useCallback(() => {
    setIsCapturing((prev) => !prev);
  }, []);

  const controls: ImageViewerControls = {
    zoomIn: () => controlsRef.current?.zoomIn(),
    zoomOut: () => controlsRef.current?.zoomOut(),
    resetTransform: () => controlsRef.current?.resetTransform(),
    zoomLevel,
    rotation,
    rotateLeft,
    isCapturing,
    toggleCapture,
  };

  useEffect(() => {
    _mountedImagePanelStack.push(panelId);
    return () => {
      const idx = _mountedImagePanelStack.lastIndexOf(panelId);
      if (idx >= 0) _mountedImagePanelStack.splice(idx, 1);
    };
  }, [panelId]);

  useEffect(() => {
    if (!isCapturing) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setIsCapturing(false);
    };
    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [isCapturing]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        _mountedImagePanelStack[_mountedImagePanelStack.length - 1] !== panelId
      )
        return;
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, select, [contenteditable='true']")
      )
        return;
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "x"
      ) {
        e.preventDefault();
        setIsCapturing((prev) => !prev);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [panelId]);

  const registerControls = useCallback(
    (c: {
      zoomIn: () => void;
      zoomOut: () => void;
      resetTransform: () => void;
    }) => {
      controlsRef.current = c;
    },
    [],
  );

  return (
    <div className="flex flex-col w-full h-full min-h-0">
      {renderHeader?.(controls)}

      <div
        className="flex-1 min-h-0 relative"
        style={{
          background:
            "repeating-conic-gradient(rgba(128,128,128,0.08) 0% 25%, transparent 0% 50%) 0 0 / 16px 16px",
        }}
      >
        <TransformWrapper
          initialScale={1}
          minScale={0.1}
          maxScale={10}
          centerOnInit={true}
          smooth={true}
          wheel={{ step: 0.008 }}
          doubleClick={{ mode: "reset" }}
          panning={{ disabled: isCapturing }}
          onTransform={(_ref: ReactZoomPanPinchRef, state: { scale: number }) => {
            setZoomLevel(Math.round(state.scale * 100));
          }}
        >
          <ImageViewerInner
            src={src}
            alt={alt}
            itemName={itemName}
            rotation={rotation}
            isCapturing={isCapturing}
            setIsCapturing={setIsCapturing}
            onZoomChange={setZoomLevel}
            registerControls={registerControls}
          />
        </TransformWrapper>
      </div>
    </div>
  );
}
