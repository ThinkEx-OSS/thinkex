"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import { SMOKE_CONFIG } from "./smokeConfig";

interface SmokeCell {
  density: number;      // Current smoke density (0 = clear, 1 = full smoke)
  targetDensity: number; // What density this cell should return to
  lastCleared: number;  // Timestamp of last clear (for refill delay)
}

interface UseSmokeSimulationProps {
  mousePosition: { x: number; y: number };
  heroCenter: { x: number; y: number };
  heroGlowIntensity: number;
  isActive: boolean;
  containerAspect: number; // width/height ratio for coordinate mapping
}

interface UseSmokeSimulationReturn {
  grid: SmokeCell[][];
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export function useSmokeSimulation({
  mousePosition,
  heroCenter,
  heroGlowIntensity,
  isActive,
  containerAspect,
}: UseSmokeSimulationProps): UseSmokeSimulationReturn {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gridRef = useRef<SmokeCell[][]>([]);
  const rafRef = useRef<number | null>(null);
  const frameCountRef = useRef(0);
  const [grid, setGrid] = useState<SmokeCell[][]>([]);

  // Store frequently-changing values in refs to avoid restarting RAF loop
  const mousePositionRef = useRef(mousePosition);
  const heroCenterRef = useRef(heroCenter);
  const heroGlowIntensityRef = useRef(heroGlowIntensity);

  // Keep refs in sync with props
  useEffect(() => {
    mousePositionRef.current = mousePosition;
  }, [mousePosition]);

  useEffect(() => {
    heroCenterRef.current = heroCenter;
  }, [heroCenter]);

  useEffect(() => {
    heroGlowIntensityRef.current = heroGlowIntensity;
  }, [heroGlowIntensity]);

  // Initialize grid
  useEffect(() => {
    const newGrid: SmokeCell[][] = [];
    for (let y = 0; y < SMOKE_CONFIG.GRID_HEIGHT; y++) {
      const row: SmokeCell[] = [];
      for (let x = 0; x < SMOKE_CONFIG.GRID_WIDTH; x++) {
        row.push({
          density: SMOKE_CONFIG.BASE_OPACITY,
          targetDensity: SMOKE_CONFIG.BASE_OPACITY,
          lastCleared: 0,
        });
      }
      newGrid.push(row);
    }
    gridRef.current = newGrid;
    setGrid(newGrid);
  }, []);

  // Clear smoke around a point
  const clearSmokeAroundPoint = useCallback((
    pointX: number,
    pointY: number,
    radius: number,
    strength: number,
    permanent: boolean = false
  ) => {
    const grid = gridRef.current;
    if (!grid.length) return;

    const now = Date.now();
    const gridWidth = SMOKE_CONFIG.GRID_WIDTH;
    const gridHeight = SMOKE_CONFIG.GRID_HEIGHT;

    // Convert normalized coordinates to grid coordinates
    const centerGridX = pointX * gridWidth;
    const centerGridY = pointY * gridHeight;
    const radiusGridX = radius * gridWidth;
    const radiusGridY = radius * gridHeight * containerAspect;

    // Calculate bounds
    const minX = Math.max(0, Math.floor(centerGridX - radiusGridX));
    const maxX = Math.min(gridWidth - 1, Math.ceil(centerGridX + radiusGridX));
    const minY = Math.max(0, Math.floor(centerGridY - radiusGridY));
    const maxY = Math.min(gridHeight - 1, Math.ceil(centerGridY + radiusGridY));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        // Calculate distance (normalized for ellipse)
        const dx = (x - centerGridX) / radiusGridX;
        const dy = (y - centerGridY) / radiusGridY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 1) {
          const cell = grid[y][x];
          // Smooth falloff from center
          const falloff = 1 - distance;
          const clearAmount = strength * falloff;

          cell.density = Math.max(0, cell.density - clearAmount);
          cell.lastCleared = now;

          if (permanent) {
            // For hero zone, reduce target density
            cell.targetDensity = Math.min(
              cell.targetDensity,
              1 - (SMOKE_CONFIG.HERO_CLEAR_INTENSITY * falloff)
            );
          }
        }
      }
    }
  }, [containerAspect]);

  // Refill smoke that was cleared
  const refillSmoke = useCallback(() => {
    const grid = gridRef.current;
    if (!grid.length) return;

    const now = Date.now();

    for (let y = 0; y < SMOKE_CONFIG.GRID_HEIGHT; y++) {
      for (let x = 0; x < SMOKE_CONFIG.GRID_WIDTH; x++) {
        const cell = grid[y][x];

        // Only refill if enough time has passed since last clear
        if (now - cell.lastCleared > SMOKE_CONFIG.REFILL_DELAY) {
          if (cell.density < cell.targetDensity) {
            cell.density = Math.min(
              cell.targetDensity,
              cell.density + SMOKE_CONFIG.REFILL_SPEED
            );
          }
        }
      }
    }
  }, []);

  // Apply diffusion for organic feel
  const applyDiffusion = useCallback(() => {
    const grid = gridRef.current;
    if (!grid.length) return;

    const rate = SMOKE_CONFIG.DIFFUSION_RATE;
    const height = SMOKE_CONFIG.GRID_HEIGHT;
    const width = SMOKE_CONFIG.GRID_WIDTH;

    // Create a copy for reading while writing
    const densityCopy: number[][] = grid.map(row => row.map(cell => cell.density));

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const neighbors =
          densityCopy[y - 1][x] +
          densityCopy[y + 1][x] +
          densityCopy[y][x - 1] +
          densityCopy[y][x + 1];
        const avgNeighbor = neighbors / 4;
        const current = densityCopy[y][x];

        // Blend toward neighbor average
        grid[y][x].density = current + (avgNeighbor - current) * rate;
      }
    }
  }, []);

  // Render grid to canvas
  const renderToCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const grid = gridRef.current;
    if (!canvas || !grid.length) return;

    const ctx = canvas.getContext("2d", { willReadFrequently: false });
    if (!ctx) return;

    const cellWidth = canvas.width / SMOKE_CONFIG.GRID_WIDTH;
    const cellHeight = canvas.height / SMOKE_CONFIG.GRID_HEIGHT;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw each cell
    for (let y = 0; y < SMOKE_CONFIG.GRID_HEIGHT; y++) {
      for (let x = 0; x < SMOKE_CONFIG.GRID_WIDTH; x++) {
        const cell = grid[y][x];
        // White = revealed (low density), Black = hidden (high density)
        // For mask: black hides content, white reveals
        const brightness = Math.round((1 - cell.density) * 255);
        ctx.fillStyle = `rgb(${brightness}, ${brightness}, ${brightness})`;
        ctx.fillRect(
          x * cellWidth,
          y * cellHeight,
          cellWidth + 1, // +1 to avoid gaps
          cellHeight + 1
        );
      }
    }
  }, []);

  // Main animation loop
  useEffect(() => {
    if (!isActive) return;

    const animate = () => {
      frameCountRef.current++;

      // Read from refs for latest values without restarting the loop
      const currentMousePos = mousePositionRef.current;
      const currentHeroCenter = heroCenterRef.current;
      const currentHeroGlow = heroGlowIntensityRef.current;

      // Clear smoke around mouse cursor
      clearSmokeAroundPoint(
        currentMousePos.x,
        currentMousePos.y,
        SMOKE_CONFIG.CLEAR_RADIUS,
        SMOKE_CONFIG.CLEAR_STRENGTH
      );

      // Clear smoke around hero (permanent clear zone)
      clearSmokeAroundPoint(
        currentHeroCenter.x,
        currentHeroCenter.y,
        SMOKE_CONFIG.HERO_CLEAR_RADIUS * (0.5 + currentHeroGlow * 0.5),
        SMOKE_CONFIG.CLEAR_STRENGTH * 0.5,
        true // permanent
      );

      // Apply physics
      applyDiffusion();
      refillSmoke();

      // Render to canvas
      renderToCanvas();

      // Update state periodically for React re-renders if needed
      if (frameCountRef.current % 10 === 0) {
        setGrid([...gridRef.current]);
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [
    isActive,
    clearSmokeAroundPoint,
    applyDiffusion,
    refillSmoke,
    renderToCanvas,
  ]);

  return {
    grid,
    canvasRef,
  };
}
