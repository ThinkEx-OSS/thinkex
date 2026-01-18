"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getCardColorCSS, getCardAccentColor, type CardColor } from "@/lib/workspace-state/colors";

// Featured workspace templates with current topics (using hex colors from palette)
const FEATURED_WORKSPACES: Array<{
  id: string;
  name: string;
  description: string;
  color: CardColor;
}> = [
  {
    id: "featured-1",
    name: "AI & Machine Learning",
    description: "Explore GPT, LLMs, and AI trends",
    color: "#3B82F6", // Blue
  },
  {
    id: "featured-2",
    name: "Climate Science",
    description: "Study climate change and solutions",
    color: "#22C55E", // Green
  },
  {
    id: "featured-3",
    name: "Web3 & Blockchain",
    description: "Learn crypto, DeFi, and NFTs",
    color: "#A855F7", // Purple
  },
  {
    id: "featured-4",
    name: "Quantum Computing",
    description: "Understand quantum mechanics",
    color: "#F97316", // Orange
  },
  {
    id: "featured-5",
    name: "Space Exploration",
    description: "Mars missions and astronomy",
    color: "#0EA5E9", // Sky Blue
  },
  {
    id: "featured-6",
    name: "Neuroscience",
    description: "Brain science and cognition",
    color: "#EC4899", // Pink
  },
  {
    id: "featured-7",
    name: "Sustainable Energy",
    description: "Solar, wind, and green tech",
    color: "#84CC16", // Lime
  },
  {
    id: "featured-8",
    name: "Biotechnology",
    description: "CRISPR, gene therapy, and more",
    color: "#EF4444", // Red
  },
];

export function FeaturedWorkspaces() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScrollability = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
  };

  useEffect(() => {
    checkScrollability();
    // Check on window resize
    window.addEventListener("resize", checkScrollability);
    return () => window.removeEventListener("resize", checkScrollability);
  }, []);

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const scrollAmount = scrollRef.current.clientWidth * 0.8;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  const handleWorkspaceClick = useCallback((workspaceName: string) => {
    toast.info("Coming soon", {
      description: `Template workspace "${workspaceName}" will be available soon!`,
    });
  }, []);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-normal text-muted-foreground">Featured workspaces</h2>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => scroll("left")}
            disabled={!canScrollLeft}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => scroll("right")}
            disabled={!canScrollRight}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={checkScrollability}
        className="flex gap-4 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent pb-2"
        style={{ 
          scrollbarWidth: "thin",
          overscrollBehaviorX: "contain",
          overscrollBehaviorY: "auto"
        }}
      >
        {FEATURED_WORKSPACES.map((workspace) => {
          const bgColor = getCardColorCSS(workspace.color, 0.25);
          const borderColor = getCardAccentColor(workspace.color, 0.5);
          return (
            <div
              key={workspace.id}
              role="button"
              tabIndex={0}
              onClick={() => handleWorkspaceClick(workspace.name)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleWorkspaceClick(workspace.name);
                }
              }}
              className={cn(
                "relative flex-shrink-0 w-64 p-4 rounded-md shadow-sm min-h-[180px]",
                "hover:shadow-lg",
                "transition-all duration-200 cursor-pointer",
                "flex flex-col items-start",
                "focus:outline-none focus:ring-2 focus:ring-primary/50"
              )}
              style={{
                backgroundColor: bgColor,
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: borderColor,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'white';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = borderColor;
              }}
            >
              {/* Title */}
              <h3 className="font-medium text-base text-foreground truncate w-full relative z-10">
                {workspace.name}
              </h3>
              <p className="text-xs text-muted-foreground line-clamp-2 relative z-10 mt-1">{workspace.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
