import dynamic from "next/dynamic";
import type { Metadata } from "next";

// Static imports for above-the-fold components
import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";

// Dynamic imports for below-the-fold components
const FourWays = dynamic(
  () => import("@/components/landing/FourWays").then((mod) => mod.FourWays),
  { ssr: true }
);

const ThreeSteps = dynamic(
  () => import("@/components/landing/ThreeSteps").then((mod) => mod.ThreeSteps),
  { ssr: true }
);

const Comparison = dynamic(
  () => import("@/components/landing/Comparison").then((mod) => mod.Comparison),
  { ssr: true }
);

const Pricing = dynamic(
  () => import("@/components/landing/Pricing").then((mod) => mod.Pricing),
  { ssr: true }
);

const FinalCTA = dynamic(
  () => import("@/components/landing/FinalCTA").then((mod) => mod.FinalCTA),
  { ssr: true }
);

const Footer = dynamic(
  () => import("@/components/landing/Footer").then((mod) => mod.Footer),
  { ssr: true }
);

// Next.js Metadata API for SEO (replaces client-side SEO component)
export const metadata: Metadata = {
  title: "ThinkEx",
  description: "Study and work with information effortlessly.",
  keywords: "AI workspace, productivity, collaboration, artificial intelligence, workspace tools, ThinkEx, AI assistant, creative workspace",
  authors: [{ name: "ThinkEx" }],
  openGraph: {
    title: "ThinkEx",
    description: "Study and work with information effortlessly.",
    url: "https://thinkex.app",
    siteName: "ThinkEx",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ThinkEx",
    description: "Study and work with information effortlessly.",
  },
  alternates: {
    canonical: "https://thinkex.app",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function LandingPage() {
  return (
    <div
      className="relative min-h-screen bg-background"
      style={{ fontFamily: 'var(--font-outfit)' }}
    >
      {/* Grid Background (static) */}
      <div
        className="fixed top-0 left-0 right-0 bottom-0 z-0 opacity-55 pointer-events-none"
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
      </div>

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
  );
}
