"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useRef, useState, useEffect } from "react";
import { getCardColorCSS } from "@/lib/workspace-state/colors";
import type { CardColor } from "@/lib/workspace-state/colors";

// Random card colors for background
const cardColors: CardColor[] = [
  "#8B5CF6", "#3B82F6", "#10B981", "#F59E0B", "#EF4444",
  "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1",
];

// Random card positions and sizes with parallax speeds
const backgroundCards = [
  { top: "10%", left: "5%", width: "180px", height: "140px", color: cardColors[0], rotation: -3, speed: 0.03 },
  { top: "25%", left: "75%", width: "200px", height: "160px", color: cardColors[1], rotation: 2, speed: 0.8 },
  { top: "50%", left: "10%", width: "160px", height: "120px", color: cardColors[2], rotation: -2, speed: 0.4 },
  { top: "65%", left: "80%", width: "190px", height: "150px", color: cardColors[3], rotation: 3, speed: 0.7 },
  { top: "8%", left: "85%", width: "150px", height: "110px", color: cardColors[5], rotation: -1, speed: 0.15 },
  { top: "75%", left: "25%", width: "180px", height: "140px", color: cardColors[6], rotation: 2, speed: 0.6 },
  { top: "30%", left: "20%", width: "160px", height: "120px", color: cardColors[7], rotation: -2, speed: 0.9 },
];

interface ParallaxCardProps {
  card: typeof backgroundCards[0];
  index: number;
  scrollYProgress: any;
  isMobileOnly?: boolean;
}

function ParallaxCard({ card, index, scrollYProgress, isMobileOnly = false }: ParallaxCardProps) {
  const y = useTransform(
    scrollYProgress,
    [0, 1],
    [0, card.speed * 500]
  );

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Green card (index 2) - adjust position on mobile
  const isGreenCard = index === 2;
  const top = isGreenCard && isMobile ? "40%" : card.top;
  const left = isGreenCard && isMobile ? "5%" : card.left;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 0.5, scale: 1 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      style={{
        y,
        top,
        left,
        width: card.width,
        height: card.height,
        backgroundColor: getCardColorCSS(card.color as CardColor, 0.5),
        transform: `rotate(${card.rotation}deg)`,
        willChange: "transform",
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
      }}
      className={`absolute rounded-md border border-foreground/20 shadow-xl ${isMobileOnly ? 'hidden md:block' : ''}`}
    >
      {/* Card content placeholder */}
      <div className="p-3 h-full flex flex-col gap-2">
        <div className="h-2 w-3/4 rounded bg-foreground/20" />
        <div className="h-1.5 w-full rounded bg-foreground/15" />
        <div className="h-1.5 w-5/6 rounded bg-foreground/15" />
        <div className="flex-1" />
        <div className="h-1 w-1/2 rounded bg-foreground/10" />
      </div>
    </motion.div>
  );
}

export function AuthPageBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-0"
      style={{
        isolation: "isolate",
        contain: "layout style paint",
      }}
    >
      {/* Grid Pattern */}
      <div 
        className="absolute inset-0 opacity-55"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255, 255, 255, 0.08) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.08) 1px, transparent 1px)
          `,
          backgroundSize: "50px 50px",
        }}
      />

      {/* Workspace Background Elements */}
      <div
        className="absolute inset-0 z-0 opacity-40"
        style={{
          willChange: "transform",
          transform: "translateZ(0)",
          isolation: "isolate",
        }}
      >
        {/* Random Cards with Parallax */}
        {backgroundCards.map((card, index) => {
          // Show only first 3 cards on mobile, all 7 on desktop
          const isMobileOnly = index >= 3;
          return (
            <ParallaxCard
              key={index}
              card={card}
              index={index}
              scrollYProgress={scrollYProgress}
              isMobileOnly={isMobileOnly}
            />
          );
        })}

        {/* Gradient fade-out at bottom */}
        <div
          className="absolute bottom-0 left-0 right-0 h-64 pointer-events-none"
          style={{
            background: `linear-gradient(to bottom, transparent 0%, var(--background) 100%)`,
          }}
        />
      </div>
    </div>
  );
}

