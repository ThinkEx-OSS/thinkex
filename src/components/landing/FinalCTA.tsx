"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FloatingWorkspaceCards } from "./FloatingWorkspaceCards";

export function FinalCTA() {
  return (
    <section
      id="final-cta"
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 pt-8 pb-16 md:pt-16 md:pb-24 sm:px-6 lg:px-8"
    >
      {/* Workspace Background Elements */}
      <div className="absolute inset-0 z-0">
        <FloatingWorkspaceCards bottomGradientHeight="20%" enableParallax={false} className="mt-[7%]" />
        {/* Extra Top Gradient for Final CTA blending */}
        <div
          className="absolute top-0 left-0 right-0 h-64 z-20 pointer-events-none"
          style={{
            background: `linear-gradient(to bottom, var(--background) 0%, transparent 100%)`,
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto w-full max-w-6xl text-center">
        <div className="space-y-6 md:space-y-8">
          <h2 className="text-4xl font-normal tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl">
            Start today for free
          </h2>

          <p className="mx-auto max-w-2xl text-xl text-muted-foreground sm:text-2xl">
            Join 100+ users who are already on ThinkEx.
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
