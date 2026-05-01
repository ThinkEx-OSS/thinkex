"use client";

import { useState } from "react";
import type { InitialAuth } from "./HomeShell";
import { HomeTopBar } from "./HomeTopBar";
import { WorkspaceGrid } from "./WorkspaceGrid";

interface HomeContentProps {
  initialAuth: InitialAuth;
}

export function HomeContent({ initialAuth }: HomeContentProps) {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="h-full flex flex-col">
      <HomeTopBar
        showBackground={true}
        showSearch={true}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        initialAuth={initialAuth}
      />
      <main className="flex-1 overflow-y-auto pt-12 px-4 md:px-8">
        <WorkspaceGrid searchQuery={searchQuery} />
      </main>
    </div>
  );
}
