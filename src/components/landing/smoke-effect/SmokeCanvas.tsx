"use client";

import { useEffect, useRef, useState } from "react";
import { useSmokeSimulation } from "./useSmokeSimulation";
import { SMOKE_CONFIG } from "./smokeConfig";

interface SmokeCanvasProps {
  mousePosition: { x: number; y: number };
  heroCenter: { x: number; y: number };
  heroGlowIntensity: number;
  isActive: boolean;
  width: number;
  height: number;
  onMaskReady?: (maskUrl: string) => void;
}

export function SmokeCanvas({
  mousePosition,
  heroCenter,
  heroGlowIntensity,
  isActive,
  width,
  height,
  onMaskReady,
}: SmokeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 500 });

  // Calculate container aspect ratio
  const containerAspect = width / height || 1.6;

  const { canvasRef } = useSmokeSimulation({
    mousePosition,
    heroCenter,
    heroGlowIntensity,
    isActive,
    containerAspect,
  });

  // Update canvas size based on container
  useEffect(() => {
    const scale = SMOKE_CONFIG.CANVAS_SCALE;
    setCanvasSize({
      width: Math.round(width * scale) || 800,
      height: Math.round(height * scale) || 500,
    });
  }, [width, height]);

  // Set canvas dimensions when size changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = canvasSize.width;
      canvas.height = canvasSize.height;
    }
  }, [canvasSize, canvasRef]);

  // Export mask URL periodically
  useEffect(() => {
    if (!isActive || !onMaskReady) return;

    const interval = setInterval(() => {
      const canvas = canvasRef.current;
      if (canvas) {
        try {
          const maskUrl = canvas.toDataURL("image/png", 0.8);
          onMaskReady(maskUrl);
        } catch {
          // Canvas might not be ready yet
        }
      }
    }, 1000 / 30); // 30fps for mask updates

    return () => clearInterval(interval);
  }, [isActive, onMaskReady, canvasRef]);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none">
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        className="absolute inset-0 w-full h-full"
        style={{
          filter: `blur(${SMOKE_CONFIG.BLUR_AMOUNT}px)`,
          opacity: 0, // Hidden - we use it as a mask source
        }}
      />
    </div>
  );
}

// Hook to get mask URL directly from canvas
export function useSmokeCanvasMask({
  mousePosition,
  heroCenter,
  heroGlowIntensity,
  isActive,
  width,
  height,
}: Omit<SmokeCanvasProps, "onMaskReady">) {
  const [maskUrl, setMaskUrl] = useState<string | null>(null);
  const frameCountRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  const containerAspect = width / height || 1.6;

  const { canvasRef } = useSmokeSimulation({
    mousePosition,
    heroCenter,
    heroGlowIntensity,
    isActive,
    containerAspect,
  });

  // Set canvas dimensions
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const scale = SMOKE_CONFIG.CANVAS_SCALE;
      canvas.width = Math.round(width * scale) || 800;
      canvas.height = Math.round(height * scale) || 500;
    }
  }, [width, height, canvasRef]);

  // Track mounted state for cleanup
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Generate mask URL periodically
  useEffect(() => {
    if (!isActive) return;

    const updateMask = () => {
      // Stop if unmounted or inactive
      if (!isMountedRef.current) return;

      frameCountRef.current++;

      // Only update every N frames for performance
      if (frameCountRef.current % SMOKE_CONFIG.MASK_UPDATE_INTERVAL === 0) {
        const canvas = canvasRef.current;
        if (canvas && canvas.width > 0 && canvas.height > 0) {
          try {
            const url = canvas.toDataURL("image/png", 0.7);
            setMaskUrl(url);
          } catch {
            // Ignore errors
          }
        }
      }

      // Store the latest RAF id for proper cleanup
      rafIdRef.current = requestAnimationFrame(updateMask);
    };

    rafIdRef.current = requestAnimationFrame(updateMask);
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [isActive, canvasRef]);

  return { maskUrl, canvasRef };
}
