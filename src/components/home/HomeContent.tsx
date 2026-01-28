"use client";

import { HomePromptInput } from "./HomePromptInput";
// import { FeaturedWorkspaces } from "./FeaturedWorkspaces";
import { WorkspaceGrid } from "./WorkspaceGrid";

export function HomeContent() {
  return (
    <div className="flex flex-col h-full w-full">
      {/* Main content area */}
      <div className="flex-1 flex flex-col items-center px-6 overflow-y-auto">
        {/* Spacer to push hero down */}
        <div className="flex-1"></div>
        
        {/* Hero Section - Centered */}
        <div className="text-center w-full flex-shrink-0 pt-8 md:pt-12 pb-8 md:pb-12">
          <h1 className="text-2xl md:text-3xl font-normal text-foreground mb-6">
            What's on your mind?
          </h1>
          <div className="flex justify-center">
            <HomePromptInput />
          </div>
        </div>

        {/* Spacer below hero */}
        <div className="flex-1"></div>

        {/* Content Sections */}
        <div className="w-full max-w-6xl pb-8 space-y-12 flex-shrink-0">
          {/* Featured Workspaces */}
          {/* <FeaturedWorkspaces /> */}

          {/* Your Workspaces */}
          <WorkspaceGrid />
        </div>
      </div>
    </div>
  );
}
