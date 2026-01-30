"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Users, Github, Sparkles } from "lucide-react";
// import { BackgroundCard, cardColors, type BackgroundCardData } from "./BackgroundCard";
import { FloatingWorkspaceCards } from "./FloatingWorkspaceCards";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

// Background cards logic moved to FloatingWorkspaceCards

export function Hero() {
  return (
    <section
      id="hero"
      className="relative flex md:min-h-screen items-center justify-center px-4 pt-16 pb-10 md:py-12 sm:px-4 lg:px-6"
    >
      {/* Workspace Background Elements */}
      <div className="absolute inset-0 z-0 select-none pointer-events-none overflow-hidden">
        <FloatingWorkspaceCards />
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto w-full max-w-6xl">


        <div className="space-y-8 md:space-y-12 text-center">
          {/* Backed by Section */}
          <div className="flex flex-wrap items-center justify-center gap-3 text-sm md:text-base mb-0 md:mb-1">
            <a
              href="https://www.hatchery.umd.edu/about-mokhtarzadas"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition-colors cursor-pointer"
            >
              <Image
                src="/hatchery.png"
                alt="Mokhtarzada Hatchery"
                width={140}
                height={28}
                className="h-4 md:h-5 w-auto"
                priority
              />
              <span>Mokhtarzada Hatchery 2025 Cohort</span>
            </a>

            <a
              href="https://github.com/thinkex-oss/thinkex"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-violet-500/10 text-violet-600 hover:bg-violet-500/20 transition-colors cursor-pointer"
            >
              <Github className="h-4 w-4 md:h-5 md:w-5" />
              <span>Open Source</span>
            </a>
          </div>

          {/* Header - Above Video */}
          <div className="space-y-6">
            <h1 className="mt-4 md:mt-12 text-3xl font-normal tracking-tight text-foreground sm:text-6xl md:text-7xl lg:text-7xl">
              The Workspace That <br className="hidden md:block" />
              <span className="relative inline-block md:mt-2">
                <span className="relative px-3 py-0.5 rounded-sm inline-block">
                  <span
                    className="absolute inset-0 rounded-sm"
                    style={{
                      background: "rgba(252, 211, 77, 0.15)",
                      border: "1px solid rgba(252, 211, 77, 0.4)",
                      left: "2px",
                    }}
                  />
                  <span className="relative z-10">Thinks With You</span>
                </span>
              </span>
            </h1>

            <div className="w-full max-w-2xl mx-auto h-[1.5px] bg-gradient-to-r from-transparent via-muted-foreground/20 to-transparent" />

            <p className="text-lg md:text-2xl text-muted-foreground max-w-3xl mx-auto">
              ThinkEx is a visual thinking environment where notes, media, and AI conversations compound into lasting knowledge.
            </p>
          </div>

          {/* CTA + Social Proof */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 mb-12 md:mb-24">
            <Button
              asChild
              size="lg"
              className="h-12 rounded-md bg-foreground px-8 text-base font-medium text-background transition-all hover:bg-foreground/90"
            >
              <Link id="hero-cta" href="/home" prefetch>
                Try for Free
              </Link>
            </Button>

            {/* Social Proof - User Avatars + Count */}
            <HoverCard openDelay={200}>
              <HoverCardTrigger asChild>
                <div className="flex items-center gap-3 cursor-pointer group">
                  {/* Stacked Avatars */}
                  <div className="flex -space-x-2">
                    {[
                      "bg-gradient-to-br from-blue-400 to-blue-600",
                      "bg-gradient-to-br from-emerald-400 to-emerald-600",
                      "bg-gradient-to-br from-amber-400 to-amber-600",
                      "bg-gradient-to-br from-rose-400 to-rose-600",
                    ].map((gradient, i) => (
                      <div
                        key={i}
                        className={`w-8 h-8 rounded-full ${gradient} ring-2 ring-background flex items-center justify-center text-white text-xs font-medium shadow-sm`}
                      >
                        {["U", "J", "A", "M"][i]}
                      </div>
                    ))}
                  </div>
                  {/* Text */}
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-medium text-foreground group-hover:text-foreground/80 transition-colors">
                      100+ weekly active users
                    </span>
                  </div>
                </div>
              </HoverCardTrigger>
              <HoverCardContent className="w-[350px] sm:w-[450px] p-0 overflow-hidden border-none shadow-xl" sideOffset={10}>
                <iframe
                  width="100%"
                  height="400"
                  frameBorder="0"
                  allowFullScreen
                  src="https://us.posthog.com/embedded/wNOXac2TxOxawVOVKHkUGxe1BA1sJQ"
                  key="4"
                  sandbox="allow-scripts allow-same-origin allow-popups"
                  className="bg-background"
                />
              </HoverCardContent>
            </HoverCard>
          </div>

          {/* Mobile Demo Image - Only visible on mobile */}
          <div className="relative w-full md:hidden">
            <div className="relative w-full max-w-md mx-auto">
              <div className="rounded-md p-[1px] gradient-border-animated shadow-2xl">
                <div className="relative aspect-[4/3] w-full rounded-[calc(0.625rem-1px)] bg-background">
                  <Image
                    src="/demo.png"
                    alt="ThinkEx Demo"
                    fill
                    priority
                    sizes="100vw"
                    className="object-cover"
                    draggable="false"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Desktop Demo Image - Hidden on mobile */}
          <div className="relative w-full hidden md:block">
            <div className="relative w-full">
              <div className="rounded-md p-[1px] gradient-border-animated shadow-2xl">
                <div className="relative aspect-[16/9] w-full rounded-[calc(0.625rem-1px)] bg-background">
                  <Image
                    src="/demo.png"
                    alt="ThinkEx Demo"
                    fill
                    priority
                    sizes="80vw"
                    className="object-fill"
                    draggable="false"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
