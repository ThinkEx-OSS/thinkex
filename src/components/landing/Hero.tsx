"use client";

import Link from "next/link";
import Image from "next/image";
import { motion, useScroll, useTransform } from "motion/react";
import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { getCardColorCSS } from "@/lib/workspace-state/colors";
import type { CardColor } from "@/lib/workspace-state/colors";
import { HeroAnimation } from "./HeroAnimation";

// Random card colors for background
const cardColors: CardColor[] = [
  "#8B5CF6", "#3B82F6", "#10B981", "#F59E0B", "#EF4444",
  "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1",
];

// Random card positions and sizes with parallax speeds
const backgroundCards = [
  { top: "10%", left: "5%", width: "180px", height: "140px", color: cardColors[0], rotation: -3, speed: 0.35 },
  { top: "25%", left: "75%", width: "200px", height: "160px", color: cardColors[1], rotation: 2, speed: 0.8 },
  { top: "50%", left: "5%", width: "160px", height: "120px", color: cardColors[2], rotation: -2, speed: 0.8 },
  { top: "65%", left: "80%", width: "190px", height: "150px", color: cardColors[3], rotation: 3, speed: 0.7 },
  { top: "8%", left: "85%", width: "150px", height: "110px", color: cardColors[5], rotation: -1, speed: 0.45 },
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
    [0, card.speed * 1200] // More dramatic parallax movement
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

export function Hero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });

  return (
    <section
      ref={containerRef}
      id="hero"
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8 md:py-24 sm:px-6 lg:px-8"
      style={{
        isolation: "isolate",
        contain: "layout style paint",
      }}
    >
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
          // Show only first 3 cards on mobile, all 8 on desktop
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
      {/* Content */}
      <div className="relative z-10 mx-auto w-full max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="space-y-8 md:space-y-12 text-center"
        >
          {/* Backed by Section */}
          <motion.a
            href="https://www.hatchery.umd.edu/about-mokhtarzadas"
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="flex items-center justify-center gap-2 text-base md:text-lg text-muted-foreground mb-2 md:mb-4 hover:text-foreground transition-colors cursor-pointer"
          >
            <Image
              src="/hatchery.png"
              alt="Mokhtarzada Hatchery"
              width={140}
              height={28}
              className="h-6 md:h-7 w-auto"
              unoptimized
            />
            <span>Mokhtarzada Hatchery 2025 Cohort</span>
          </motion.a>

          {/* Header - Above Video */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mt-4 md:mt-12 text-4xl font-normal tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl"
          >
            Turn{" "}
            <span className="relative inline-block">
              <span className="relative px-3 py-0.5 rounded-sm inline-block">
                <motion.span
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: "100%", opacity: 1 }}
                  transition={{ duration: 0.8, delay: 0.7, ease: "easeOut" }}
                  className="absolute inset-0 rounded-sm border-4"
                  style={{
                    background: "rgba(252, 211, 77, 0.15)",
                    borderColor: "#EAB308",
                    boxShadow: "0 0 0 1px rgba(234, 179, 8, 0.3)",
                    originX: 0,
                    left: "2px",
                  }}
                />
                <span className="relative z-10">value from AI</span>
              </span>
            </span>{" "}
            into
            <br />
            organized knowledge
          </motion.h1>

          {/* Get Started Button - Above Video */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex justify-center"
          >
            <Link href="/guest-setup">
              <Button
                size="lg"
                className="h-12 rounded-md bg-foreground px-8 text-base font-medium text-background transition-all hover:bg-foreground/90"
              >
                Get Started
              </Button>
            </Link>
          </motion.div>

          {/* Mobile Video Placeholder - Only visible on mobile */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="relative w-full md:hidden"
          >
            <div className="relative w-full max-w-md mx-auto px-4">
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md border border-foreground/20 shadow-2xl bg-gradient-to-br from-background via-muted/30 to-background">
                {/* Video placeholder content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                  {/* Play button icon */}
                  <div className="mb-4 p-4 rounded-full bg-primary/10 border-2 border-primary/20">
                    <svg
                      className="h-8 w-8 text-primary ml-1"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold mb-2 text-foreground">
                    Demo
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
                    Experience our AI-powered workspace on desktop for the full interactive demonstration
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Desktop Animation - Hidden on mobile */}
          <div className="relative w-full hidden md:block">
            <div className="relative w-full max-w-5xl mx-auto px-4">
              <HeroAnimation />
            </div>
          </div>

          {/* Subheader - Below Video */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mx-auto max-w-3xl text-xl text-muted-foreground sm:text-2xl"
          >
            Study and work with information effortlessly.
          </motion.p>
        </motion.div>
      </div>
    </section>
  );
}

