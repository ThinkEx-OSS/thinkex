"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

// Featured workspace templates with current topics
const FEATURED_WORKSPACES = [
  {
    id: "featured-1",
    name: "AI & Machine Learning",
    description: "Explore GPT, LLMs, and AI trends",
    color: "hsl(217, 91%, 60%)",
  },
  {
    id: "featured-2",
    name: "Climate Science",
    description: "Study climate change and solutions",
    color: "hsl(142, 76%, 36%)",
  },
  {
    id: "featured-3",
    name: "Web3 & Blockchain",
    description: "Learn crypto, DeFi, and NFTs",
    color: "hsl(280, 100%, 70%)",
  },
  {
    id: "featured-4",
    name: "Quantum Computing",
    description: "Understand quantum mechanics",
    color: "hsl(24, 95%, 53%)",
  },
  {
    id: "featured-5",
    name: "Space Exploration",
    description: "Mars missions and astronomy",
    color: "hsl(200, 100%, 50%)",
  },
  {
    id: "featured-6",
    name: "Neuroscience",
    description: "Brain science and cognition",
    color: "hsl(320, 70%, 60%)",
  },
  {
    id: "featured-7",
    name: "Sustainable Energy",
    description: "Solar, wind, and green tech",
    color: "hsl(120, 60%, 45%)",
  },
  {
    id: "featured-8",
    name: "Biotechnology",
    description: "CRISPR, gene therapy, and more",
    color: "hsl(15, 85%, 55%)",
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
        {FEATURED_WORKSPACES.map((workspace) => (
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
              "flex-shrink-0 w-64 px-6 py-8 rounded-md border border-sidebar-border/50 backdrop-blur-sm",
              "hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5",
              "transition-all duration-300 cursor-pointer",
              "flex flex-col items-start justify-between",
              "aspect-[3.5/1]"
            )}
            style={{
              backgroundColor: `${workspace.color}08`,
            }}
          >
            <div className="flex flex-col gap-4 w-full">
              <div
                className="flex-shrink-0 w-12 h-12 rounded-md flex items-center justify-center"
                style={{
                  backgroundColor: `${workspace.color}20`,
                }}
              >
                <div
                  className="w-6 h-6 rounded"
                  style={{
                    backgroundColor: workspace.color,
                  }}
                />
              </div>
              <div className="min-w-0 w-full">
                <h3 className="font-medium text-lg text-foreground truncate w-full mb-1">
                  {workspace.name}
                </h3>
                <p className="text-sm text-muted-foreground">{workspace.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
