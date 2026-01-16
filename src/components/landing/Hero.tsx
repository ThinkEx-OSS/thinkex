"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { BackgroundCard, cardColors, type BackgroundCardData } from "./BackgroundCard";

// Random card positions and sizes (static - no parallax)
const backgroundCards: BackgroundCardData[] = [
  { top: "10%", left: "5%", width: "180px", height: "140px", color: cardColors[0], rotation: -3 },
  { top: "25%", left: "75%", width: "200px", height: "160px", color: cardColors[1], rotation: 2 },
  { top: "50%", left: "5%", width: "160px", height: "120px", color: cardColors[2], rotation: -2 },
  { top: "65%", left: "80%", width: "190px", height: "150px", color: cardColors[3], rotation: 3 },
  { top: "8%", left: "85%", width: "150px", height: "110px", color: cardColors[5], rotation: -1 },
  { top: "75%", left: "25%", width: "180px", height: "140px", color: cardColors[6], rotation: 2 },
  { top: "30%", left: "20%", width: "160px", height: "120px", color: cardColors[7], rotation: -2 },
];

export function Hero() {
  return (
    <section
      id="hero"
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8 md:py-24 sm:px-6 lg:px-8"
    >
      {/* Workspace Background Elements */}
      <div className="absolute inset-0 z-0 opacity-40">
        {/* Static Background Cards */}
        {backgroundCards.map((card, index) => {
          const isDesktopOnly = index >= 3;
          return (
            <BackgroundCard
              key={index}
              card={card}
              isDesktopOnly={isDesktopOnly}
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
        <div className="space-y-8 md:space-y-12 text-center">
          {/* Backed by Section */}
          <a
            href="https://www.hatchery.umd.edu/about-mokhtarzadas"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 text-base md:text-lg text-muted-foreground mb-2 md:mb-4 hover:text-foreground transition-colors cursor-pointer"
          >
            <Image
              src="/hatchery.png"
              alt="Mokhtarzada Hatchery"
              width={140}
              height={28}
              className="h-6 md:h-7 w-auto"
              priority
            />
            <span>Mokhtarzada Hatchery 2025 Cohort</span>
          </a>

          {/* Header - Above Video */}
          <h1 className="mt-4 md:mt-12 text-4xl font-normal tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl">
            Turn{" "}
            <span className="relative inline-block">
              <span className="relative px-3 py-0.5 rounded-sm inline-block">
                <span
                  className="absolute inset-0 rounded-sm border-4"
                  style={{
                    background: "rgba(252, 211, 77, 0.15)",
                    borderColor: "#EAB308",
                    boxShadow: "0 0 0 1px rgba(234, 179, 8, 0.3)",
                    left: "2px",
                  }}
                />
                <span className="relative z-10">value from AI</span>
              </span>
            </span>{" "}
            into
            <br />
            organized knowledge
          </h1>

          {/* Get Started Button - Above Video */}
          <div className="flex justify-center">
            <Button
              asChild
              size="lg"
              className="h-12 rounded-md bg-foreground px-8 text-base font-medium text-background transition-all hover:bg-foreground/90"
            >
              <Link href="/guest-setup" prefetch>
                Get Started
              </Link>
            </Button>
          </div>

          {/* Mobile Demo Image - Only visible on mobile */}
          <div className="relative w-full md:hidden">
            <div className="relative w-full max-w-md mx-auto px-4">
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md border border-foreground/20 shadow-2xl">
                <Image
                  src="/demo.png"
                  alt="ThinkEx Demo"
                  fill
                  priority
                  sizes="100vw"
                  className="object-cover"
                />
              </div>
            </div>
          </div>

          {/* Desktop Demo Image - Hidden on mobile */}
          <div className="relative w-full hidden md:block">
            <div className="relative w-full max-w-6xl mx-auto px-4">
              <div className="relative aspect-[16/9] w-full overflow-hidden rounded-md border border-foreground/20 shadow-2xl">
                <Image
                  src="/demo.png"
                  alt="ThinkEx Demo"
                  fill
                  priority
                  sizes="80vw"
                  className="object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
