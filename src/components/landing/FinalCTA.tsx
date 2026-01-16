"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BackgroundCard, cardColors, type BackgroundCardData } from "./BackgroundCard";

// Random card positions and sizes (static - no parallax)
const backgroundCards: BackgroundCardData[] = [
  { top: "15%", left: "10%", width: "180px", height: "140px", color: cardColors[0], rotation: -3 },
  { top: "30%", left: "75%", width: "200px", height: "160px", color: cardColors[1], rotation: 2 },
  { top: "60%", left: "15%", width: "160px", height: "120px", color: cardColors[2], rotation: -2 },
  { top: "70%", left: "80%", width: "190px", height: "150px", color: cardColors[3], rotation: 3 },
  { top: "20%", left: "50%", width: "170px", height: "130px", color: cardColors[4], rotation: 1 },
];

export function FinalCTA() {
  return (
    <section
      id="final-cta"
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 pt-8 pb-16 md:pt-16 md:pb-24 sm:px-6 lg:px-8"
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

        {/* Gradient fade-in at top */}
        <div
          className="absolute top-0 left-0 right-0 h-64 pointer-events-none"
          style={{
            background: `linear-gradient(to bottom, var(--background) 0%, transparent 100%)`,
          }}
        />

        {/* Gradient fade-out at bottom */}
        <div
          className="absolute bottom-0 left-0 right-0 h-64 pointer-events-none"
          style={{
            background: `linear-gradient(to bottom, transparent 0%, var(--background) 100%)`,
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto w-full max-w-6xl text-center">
        <div className="space-y-6 md:space-y-8">
          <h2 className="text-4xl font-medium tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl">
            Start today for free
          </h2>

          <p className="mx-auto max-w-2xl text-xl text-muted-foreground sm:text-2xl">
            Join 50+ users who are already on ThinkEx.
          </p>

          <div className="flex justify-center pt-4">
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
        </div>
      </div>
    </section>
  );
}
