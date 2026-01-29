"use client";

import Link from "next/link";
import { HomePromptInput } from "./HomePromptInput";
// import { FeaturedWorkspaces } from "./FeaturedWorkspaces";
import { WorkspaceGrid } from "./WorkspaceGrid";
import { FloatingWorkspaceCards } from "@/components/landing/FloatingWorkspaceCards";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";

export function HomeContent() {
  const { data: session } = useSession();

  return (
    <div className="relative h-full w-full overflow-y-auto">
      {/* Floating Card Background */}
      <div className="absolute inset-0 z-0 select-none pointer-events-none overflow-hidden">
        <FloatingWorkspaceCards 
          bottomGradientHeight="40%" 
          opacity="opacity-10 md:opacity-15"
          includeExtraCards={true}
        />
      </div>

      {/* Hero Section - Vertically centered in viewport */}
      <div className="relative z-10 min-h-[90vh] flex flex-col items-center justify-center text-center px-6 py-0">
        <div className="w-full max-w-2xl -mt-16 relative">
          {/* Border blur overlay around prompt */}
          <div 
            className="absolute -inset-6 rounded-full pointer-events-none"
            style={{
              background: 'radial-gradient(circle, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.2) 40%, transparent 60%)',
              filter: 'blur(12px)',
              zIndex: 0,
              width: 'calc(100% + 3rem)',
              height: '200px',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          />
          
          <h1 className="text-2xl md:text-3xl font-light text-foreground mb-10 relative z-10">
            What's on your mind?
          </h1>
          <div className="flex justify-center w-full relative z-10">
            <HomePromptInput />
          </div>
        </div>
      </div>

      {/* Content Sections - Below hero */}
      <div className="relative z-10 px-6 pb-8">
        <div className="w-full max-w-6xl mx-auto space-y-12">
          {/* Featured Workspaces */}
          {/* <FeaturedWorkspaces /> */}

          {/* Your Workspaces */}
          <div className="bg-sidebar rounded-md p-6">
            <h2 className="text-lg font-normal text-muted-foreground mb-4">Recent workspaces</h2>
            <WorkspaceGrid />
          </div>
        </div>
      </div>
    </div>
  );
}
