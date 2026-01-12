"use client";

import { useRef } from "react";
import { useScroll, useTransform, motion } from "motion/react";
import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { FourWays } from "@/components/landing/FourWays";
import { ThreeSteps } from "@/components/landing/ThreeSteps";
import { Comparison } from "@/components/landing/Comparison";
import { Pricing } from "@/components/landing/Pricing";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { Footer } from "@/components/landing/Footer";
import { SEO } from "@/components/seo/SEO";

export default function LandingPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  // Parallax effect: grid moves slower than content (more dramatic)
  const gridY = useTransform(scrollYProgress, [0, 1], [0, -1200]);

  return (
    <>
      <SEO
        title="ThinkEx"
        description="Study and work with information effortlessly."
        keywords="AI workspace, productivity, collaboration, artificial intelligence, workspace tools, ThinkEx, AI assistant, creative workspace"
        url="https://thinkex.app"
        canonical="https://thinkex.app"
      />
      <div
        ref={containerRef}
        className="relative min-h-screen bg-background"
        style={{ fontFamily: 'var(--font-outfit)' }}
      >
        {/* Workspace Grid Background with Parallax */}
        <motion.div
          className="fixed top-0 left-0 right-0 z-0 opacity-55 pointer-events-none"
          style={{
            height: "calc(100vh + 1200px)",
            y: gridY,
            willChange: "transform",
            transform: "translateZ(0)",
            isolation: "isolate",
          }}
        >
          {/* Grid Pattern */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `
              linear-gradient(to right, rgba(255, 255, 255, 0.08) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(255, 255, 255, 0.08) 1px, transparent 1px)
            `,
              backgroundSize: "50px 50px",
            }}
          />
        </motion.div>

        {/* Content */}
        <div className="relative z-10">
          <Navbar />
          <Hero />
          <FourWays />
          <ThreeSteps />
          <Comparison />
          <Pricing />
          <FinalCTA />
          <Footer />
        </div>
      </div>
    </>
  );
}
