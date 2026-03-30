"use client";

import { FloatingCard, type FloatingCardData } from "./FloatingCard";
import { cn } from "@/lib/utils";
import { useRef, useState, useEffect } from "react";

// Base cards for landing page
const BASE_CARDS: FloatingCardData[] = [
  // Column 1ish - The Origins of Light at top for visibility
  { type: "youtube", thumbnailUrl: "/youtube-thumbnail-2.jpg" },
  { type: "note", title: "Product Vision 2025", color: "#3B82F6" },
  { type: "note", title: "Tech Stack Decision Log", color: "#E11D48" },
  {
    type: "flashcard",
    content: "What is the primary function of the hippocampus?",
    color: "#EF4444",
  },

  // Column 2ish
  { type: "folder", title: "Research Papers", itemCount: 12, color: "#10B981" },
  {
    type: "pdf",
    title: "Q4 Financial Report.pdf",
    color: "#F59E0B",
    aspectRatio: "1/1.1",
  },
  { type: "note", title: "Meeting Notes: Design Sync", color: "#8B5CF6" },
  { type: "flashcard", content: 'Define "Neuroplasticity"', color: "#EC4899" },

  // Column 3ish
  {
    type: "folder",
    title: "Biology Lecture Slides",
    itemCount: 48,
    color: "#06B6D4",
  },
  { type: "note", title: "Ideas for Marketing", color: "#F97316" },
  {
    type: "quiz",
    title: "Neuroscience Quiz",
    content: "Which brain region processes memory?",
    color: "#8B5CF6",
  },
  {
    type: "folder",
    title: "Cognitive Science",
    itemCount: 24,
    color: "#14B8A6",
  },

  // Column 4ish
  { type: "youtube", thumbnailUrl: "/youtube-thumbnail-1.jpg" },
  { type: "folder", title: "Archive 2024", itemCount: 156, color: "#6366F1" },
  { type: "pdf", title: "User_Interview_Script_v2.pdf", color: "#6366F1" },
  {
    type: "folder",
    title: "Neurology Resources",
    itemCount: 18,
    color: "#8B5CF6",
  },
];

interface FloatingWorkspaceCardsProps {
  bottomGradientHeight?: string;
  className?: string;
  /** When true, cards are more visible (e.g. behind generate modal) */
  clearerBackground?: boolean;
}

export function FloatingWorkspaceCards({
  bottomGradientHeight = "60%",
  className,
  clearerBackground = false,
}: FloatingWorkspaceCardsProps) {
  const cards = BASE_CARDS;
  const [transform, setTransform] = useState({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);

  // Use window-level mouse tracking to avoid pointer-events issues
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        // Calculate mouse position relative to viewport center
        const relX = e.clientX / window.innerWidth;
        const relY = e.clientY / window.innerHeight;
        // Push cards away from cursor - negate to move opposite direction
        const pushIntensity = 20;
        const offsetX = -(relX - 0.5) * pushIntensity;
        const offsetY = -(relY - 0.5) * pushIntensity;
        setTransform({ x: offsetX, y: offsetY });
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className="absolute inset-0 w-full h-full pointer-events-none select-none z-0">
      {/* Cards layer - darkened */}
      <div
        className={cn(
          "absolute inset-0 w-[120%] -ml-[10%] -mt-[5%] columns-2 md:columns-3 lg:columns-6 gap-4 md:gap-6 lg:gap-8 transition-transform duration-800 ease-out pointer-events-none",
          clearerBackground
            ? "opacity-70 dark:opacity-50"
            : "opacity-50 dark:opacity-30",
          className,
        )}
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px)`,
        }}
      >
        {cards.map((card, index) => (
          <FloatingCard
            key={`${card.type}-${card.title ?? card.content ?? card.thumbnailUrl ?? "card"}-${index}`}
            data={card}
            className="w-full mb-6 md:mb-8"
          />
        ))}
      </div>

      {/* Gradient Overlay for Fade Out */}
      <div
        className="absolute bottom-0 left-0 right-0 z-10"
        style={{
          height: bottomGradientHeight,
          background:
            "linear-gradient(to bottom, transparent 0%, var(--background) 90%)",
        }}
      />

      {/* Top fade/vignette to blend with nav if needed */}
      <div
        className="absolute top-0 left-0 right-0 h-32 z-10"
        style={{
          background:
            "linear-gradient(to bottom, var(--background) 0%, transparent 100%)",
        }}
      />
    </div>
  );
}
