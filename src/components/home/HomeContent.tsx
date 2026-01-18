"use client";

import { HomePromptInput } from "./HomePromptInput";
import { FeaturedWorkspaces } from "./FeaturedWorkspaces";
import { WorkspaceGrid } from "./WorkspaceGrid";

export function HomeContent() {
  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Main content area */}
      <div className="flex-1 flex flex-col items-center justify-start px-6 pt-[10vh] pb-8 overflow-y-auto">
        {/* Hero Section */}
        <div className="text-center mb-12 w-full">
          <h1 className="text-3xl md:text-4xl font-medium text-foreground mb-6">
            What's on your mind?
          </h1>
          <div className="flex justify-center">
            <HomePromptInput />
          </div>
        </div>

        {/* Content Sections */}
        <div className="w-full max-w-6xl space-y-12">
          {/* Featured Workspaces */}
          <FeaturedWorkspaces />

          {/* Your Workspaces */}
          <WorkspaceGrid />
        </div>
      </div>
    </div>
  );
}
