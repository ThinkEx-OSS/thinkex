"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";
import { getCardColorCSS, getCardAccentColor, type CardColor } from "@/lib/workspace-state/colors";
import { Play, FileText, Layers, FolderOpen, MoreVertical, ChevronLeft, ChevronRight, CheckSquare } from "lucide-react";

type CardType = "note" | "flashcard" | "quiz" | "youtube" | "pdf" | "folder";
type DepthLayer = "far" | "mid" | "near";

interface BentoCard {
  id: string;
  type: CardType;
  color: CardColor;
  x: number;
  y: number;
  w: number;
  h: number;
  layer: DepthLayer;
}

interface LayerConfig {
  scale: number;
  opacity: number;
  blur: number;
  parallaxIntensity: number;
  breatheDuration: number;
}

// MUCH BRIGHTER layer opacities for vibrant, eye-catching look
const LAYER_CONFIG: Record<DepthLayer, LayerConfig> = {
  far: {
    scale: 0.75,
    opacity: 0.25,        // Was 0.10 - now 2.5x brighter!
    blur: 2,
    parallaxIntensity: 8,
    breatheDuration: 10,
  },
  mid: {
    scale: 0.88,
    opacity: 0.40,        // Was 0.15 - now 2.6x brighter!
    blur: 0.5,
    parallaxIntensity: 16,
    breatheDuration: 7,
  },
  near: {
    scale: 1.0,
    opacity: 0.55,        // Was 0.22 - now 2.5x brighter!
    blur: 0,
    parallaxIntensity: 28,
    breatheDuration: 5,
  },
};

// Realistic card sizes based on actual workspace dimensions (grid-layout-helpers.ts)
// Note: w=1 h=4, Flashcard: w=2 h=5, Quiz: w=2 h=13, YouTube: w=2-4 h=10, PDF: w=1 h=4, Folder: w=1 h=4
// CENTER AREA AVOIDED: cols 1-2, rows 5-25 (where hero sits)
const BENTO_CARDS: BentoCard[] = [
  // === TOP ROW (rows 0-5) - full width allowed ===
  { id: "1", type: "folder", x: 0, y: 0, w: 1, h: 4, layer: "far", color: "#93C5FD" },      // Light blue
  { id: "2", type: "flashcard", x: 1, y: 0, w: 2, h: 5, layer: "mid", color: "#86EFAC" },   // Light green
  { id: "3", type: "note", x: 3, y: 0, w: 1, h: 4, layer: "near", color: "#FCD34D" },       // Bright amber

  // === LEFT SIDE (col 0 only, avoiding center) ===
  { id: "4", type: "pdf", x: 0, y: 4, w: 1, h: 4, layer: "mid", color: "#C4B5FD" },         // Light violet
  { id: "5", type: "note", x: 0, y: 8, w: 1, h: 4, layer: "near", color: "#FCA5A5" },       // Light red
  { id: "6", type: "folder", x: 0, y: 12, w: 1, h: 4, layer: "far", color: "#F9A8D4" },     // Light pink
  { id: "7", type: "flashcard", x: 0, y: 16, w: 1, h: 5, layer: "mid", color: "#67E8F9" },  // Bright cyan (narrow variant)
  { id: "8", type: "pdf", x: 0, y: 21, w: 1, h: 4, layer: "near", color: "#F0ABFC" },       // Bright fuchsia

  // === RIGHT SIDE (col 3 only, avoiding center) ===
  { id: "9", type: "note", x: 3, y: 4, w: 1, h: 4, layer: "mid", color: "#BEF264" },        // Bright lime
  { id: "10", type: "folder", x: 3, y: 8, w: 1, h: 4, layer: "far", color: "#FDA4AF" },     // Light rose
  { id: "11", type: "pdf", x: 3, y: 12, w: 1, h: 4, layer: "near", color: "#7DD3FC" },      // Sky blue
  { id: "12", type: "note", x: 3, y: 16, w: 1, h: 4, layer: "mid", color: "#D8B4FE" },      // Light purple
  { id: "13", type: "flashcard", x: 3, y: 20, w: 1, h: 5, layer: "far", color: "#FDB972" }, // Light orange (narrow variant)

  // === BOTTOM SECTION (rows 26+, below hero) - full width allowed ===
  { id: "14", type: "quiz", x: 0, y: 26, w: 2, h: 13, layer: "mid", color: "#FBBF24" },     // Amber - tall quiz!
  { id: "15", type: "youtube", x: 2, y: 26, w: 2, h: 10, layer: "near", color: "#FCA5A5" }, // Light red - video

  { id: "16", type: "note", x: 0, y: 39, w: 2, h: 9, layer: "far", color: "#6EE7B7" },      // Light emerald - expanded note
  { id: "17", type: "flashcard", x: 2, y: 36, w: 2, h: 5, layer: "mid", color: "#A5B4FC" }, // Light indigo
  { id: "18", type: "folder", x: 2, y: 41, w: 1, h: 4, layer: "near", color: "#FDE047" },   // Bright yellow
  { id: "19", type: "pdf", x: 3, y: 41, w: 1, h: 4, layer: "far", color: "#5EEAD4" },       // Bright teal
];

interface StaticPreviewCardProps {
  type: CardType;
  color: CardColor;
  breatheDuration: number;
  breatheDelay: number;
}

// Sample content for realistic placeholders
const NOTE_TITLES = ["Research Notes", "Study Guide", "Meeting Notes", "Project Ideas"];
const FLASHCARD_QUESTIONS = ["What is photosynthesis?", "Define mitochondria", "Explain osmosis"];
const QUIZ_QUESTIONS = ["What converts sunlight to energy?", "Which organelle produces ATP?"];
const QUIZ_OPTIONS = [
  ["Respiration", "Photosynthesis", "Digestion", "Circulation"],
  ["Nucleus", "Mitochondria", "Ribosome", "Vacuole"],
];
const FOLDER_NAMES = ["Study Materials", "Chapter Notes", "Exam Prep", "Resources"];

function StaticPreviewCard({ type, color, breatheDuration, breatheDelay }: StaticPreviewCardProps) {
  // EXACT styling from WorkspaceCard.tsx (lines 567-571)
  const bgColor = getCardColorCSS(color, 0.25);  // Same as WorkspaceCard
  const borderColor = getCardAccentColor(color, 0.5);  // Same as WorkspaceCard

  const baseStyle: React.CSSProperties = {
    animation: `breathe ${breatheDuration}s ease-in-out infinite`,
    animationDelay: `${breatheDelay}s`,
  };

  // Get random but consistent content based on color (deterministic)
  const colorIndex = parseInt(color.slice(1, 3), 16) % 4;

  switch (type) {
    case "note":
      return (
        <div
          className="h-full w-full rounded-md border p-4 shadow-sm flex flex-col"
          style={{
            ...baseStyle,
            backgroundColor: bgColor,
            borderColor,
          }}
        >
          {/* Title bar with icon - matches WorkspaceCard */}
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-4 w-4 text-foreground/70" />
            <span className="text-sm font-medium text-foreground/80 truncate">
              {NOTE_TITLES[colorIndex]}
            </span>
          </div>
          {/* Realistic lorem ipsum content */}
          <div className="text-xs text-foreground/60 space-y-2 leading-relaxed overflow-hidden">
            <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
            <p>Sed do eiusmod tempor incididunt ut labore et dolore.</p>
            <p>Ut enim ad minim veniam, quis nostrud exercitation...</p>
          </div>
        </div>
      );

    case "flashcard":
      return (
        <div className="h-full w-full relative" style={baseStyle}>
          {/* Stacked cards behind - same as FlashcardWorkspaceCard */}
          <div
            className="absolute left-[3%] right-[3%] bottom-[-4px] h-[10px] rounded-b-md"
            style={{ backgroundColor: getCardColorCSS(color, 0.15) }}
          />
          <div
            className="absolute left-[6%] right-[6%] bottom-[-8px] h-[10px] rounded-b-md"
            style={{ backgroundColor: getCardColorCSS(color, 0.10) }}
          />

          {/* Main card */}
          <div
            className="relative h-full rounded-md border p-4 shadow-sm flex flex-col"
            style={{
              backgroundColor: bgColor,
              borderColor,
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Layers className="h-4 w-4 text-foreground/70" />
              <span className="text-xs text-foreground/60">Vocabulary</span>
            </div>

            {/* Centered question content */}
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-foreground/80 text-center px-2">
                {FLASHCARD_QUESTIONS[colorIndex % FLASHCARD_QUESTIONS.length]}
              </p>
            </div>

            {/* Bottom controls */}
            <div className="flex items-center justify-center gap-3 pt-2 text-foreground/50">
              <ChevronLeft className="h-4 w-4" />
              <span className="text-xs">1 / 12</span>
              <ChevronRight className="h-4 w-4" />
            </div>
          </div>
        </div>
      );

    case "quiz":
      return (
        <div
          className="h-full w-full rounded-md border p-4 shadow-sm flex flex-col"
          style={{
            ...baseStyle,
            backgroundColor: bgColor,
            borderColor,
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-2 mb-3">
            <CheckSquare className="h-4 w-4 text-foreground/70" />
            <span className="text-sm font-medium text-foreground/80">Biology Quiz</span>
          </div>

          {/* Question */}
          <p className="text-xs text-foreground/60 mb-3">
            {QUIZ_QUESTIONS[colorIndex % QUIZ_QUESTIONS.length]}
          </p>

          {/* Answer options A-D with realistic text */}
          <div className="space-y-2 flex-1">
            {['A', 'B', 'C', 'D'].map((letter, i) => (
              <div
                key={letter}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded border text-xs",
                  i === 1 ? "bg-green-500/20 border-green-500/40" : "bg-foreground/5 border-foreground/10"
                )}
              >
                <span className={cn(
                  "w-5 h-5 rounded flex items-center justify-center text-[10px] font-medium",
                  i === 1 ? "bg-green-500/30 text-green-400" : "bg-foreground/10 text-foreground/50"
                )}>
                  {letter}
                </span>
                <span className={i === 1 ? "text-green-400/80" : "text-foreground/40"}>
                  {QUIZ_OPTIONS[colorIndex % QUIZ_OPTIONS.length][i]}
                </span>
              </div>
            ))}
          </div>
        </div>
      );

    case "youtube":
      return (
        <div
          className="h-full w-full rounded-md overflow-hidden relative bg-black"
          style={baseStyle}
        >
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 to-transparent" />

          {/* Play button - matches YouTubeCardContent exactly */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center shadow-lg">
              <Play className="h-5 w-5 text-foreground fill-foreground ml-0.5 dark:text-white dark:fill-white" />
            </div>
          </div>

          {/* Progress bar */}
          <div className="absolute bottom-2 left-2 right-2 h-1 bg-white/20 rounded-full">
            <div className="h-full w-1/3 bg-red-500 rounded-full" />
          </div>
        </div>
      );

    case "pdf":
      return (
        <div
          className="h-full w-full rounded-md overflow-hidden flex flex-col border"
          style={{
            ...baseStyle,
            borderColor,
          }}
        >
          {/* Header like LightweightPdfPreview */}
          <div className="h-8 bg-[#525659] flex items-center px-3 gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500/60" />
            <span className="text-xs text-foreground/50 truncate dark:text-white/50">Document.pdf</span>
          </div>

          {/* PDF preview area */}
          <div className="flex-1 bg-[#525659] p-3">
            <div className="bg-white/10 rounded h-full p-3 flex flex-col gap-2">
              <div className="h-2 w-3/4 bg-white/30 rounded" />
              <div className="h-2 w-full bg-white/20 rounded" />
              <div className="h-2 w-full bg-white/20 rounded" />
              <div className="h-2 w-5/6 bg-white/20 rounded" />
              <div className="h-2 w-full bg-white/20 rounded" />
              <div className="h-2 w-4/5 bg-white/15 rounded" />
            </div>
          </div>
        </div>
      );

    case "folder":
      return (
        <div className="h-full w-full relative" style={baseStyle}>
          {/* Folder tab - matches FolderCard exactly (0.35 opacity) */}
          <div
            className="absolute top-0 left-0 h-[10%] w-[35%] rounded-t-md border border-b-0"
            style={{
              backgroundColor: getCardColorCSS(color, 0.35),
              borderColor,
            }}
          />

          {/* Folder body - matches FolderCard exactly (0.25 opacity) */}
          <div
            className="absolute top-[10%] left-0 right-0 bottom-0 rounded-md rounded-tl-none border p-4 flex flex-col"
            style={{
              backgroundColor: bgColor,
              borderColor,
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <FolderOpen className="h-4 w-4 text-foreground/70" />
              <span className="text-sm font-medium text-foreground/80 truncate">
                {FOLDER_NAMES[colorIndex]}
              </span>
            </div>
            <div className="flex-1 flex items-end">
              <span className="text-xs text-foreground/50">8 items</span>
            </div>
          </div>
        </div>
      );
  }
}

interface BentoLayerProps {
  depth: DepthLayer;
  mousePosition: { x: number; y: number };
  isMobile: boolean;
}

function BentoLayer({ depth, mousePosition, isMobile }: BentoLayerProps) {
  const config = LAYER_CONFIG[depth];
  const cards = BENTO_CARDS.filter((c) => c.layer === depth);

  const offsetX = isMobile ? 0 : (mousePosition.x - 0.5) * config.parallaxIntensity;
  const offsetY = isMobile ? 0 : (mousePosition.y - 0.5) * config.parallaxIntensity;

  return (
    <div
      className="absolute inset-0 transition-transform duration-100 ease-out"
      style={{
        transform: `translate(${offsetX}px, ${offsetY}px) scale(${config.scale})`,
        filter: config.blur > 0 ? `blur(${config.blur}px)` : undefined,
        opacity: config.opacity,
        willChange: "transform",
      }}
    >
      <div className="grid grid-cols-4 auto-rows-[25px] gap-4 p-4 w-full h-full">
        {cards.map((card, index) => (
          <div
            key={card.id}
            style={{
              gridColumn: `${card.x + 1} / span ${card.w}`,
              gridRow: `${card.y + 1} / span ${card.h}`,
            }}
          >
            <StaticPreviewCard
              type={card.type}
              color={card.color}
              breatheDuration={config.breatheDuration}
              breatheDelay={index * 0.5}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

interface ParallaxBentoBackgroundProps {
  className?: string;
}

export function ParallaxBentoBackground({ className }: ParallaxBentoBackgroundProps) {
  const [mousePosition, setMousePosition] = useState({ x: 0.5, y: 0.5 });
  const [isMobile, setIsMobile] = useState(false);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (isMobile) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(() => {
        setMousePosition({
          x: e.clientX / window.innerWidth,
          y: e.clientY / window.innerHeight,
        });
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isMobile]);

  const layers = useMemo<DepthLayer[]>(() => ["far", "mid", "near"], []);

  return (
    <div className={cn("absolute inset-0 overflow-hidden", className)}>
      {/* CSS for breathing animation */}
      <style jsx>{`
        @keyframes breathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
      `}</style>

      {/* Extended container for parallax movement */}
      <div className="absolute -inset-12">
        {layers.map((depth) => (
          isMobile && depth === "far" ? null : (
            <BentoLayer
              key={depth}
              depth={depth}
              mousePosition={mousePosition}
              isMobile={isMobile}
            />
          )
        ))}
      </div>
    </div>
  );
}
