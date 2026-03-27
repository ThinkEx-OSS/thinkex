"use client";

import { MobileWarning } from "@/components/ui/MobileWarning";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { HomeLayout } from "@/components/layout/HomeLayout";
import { HomeContent } from "@/components/home/HomeContent";
import { AnonymousSessionHandler } from "@/components/layout/SessionHandler";

// Home page content component
function HomePageContent() {
  return (
    <HomeLayout>
      <HomeContent />
    </HomeLayout>
  );
}

// Main shell component for home page
export function HomeShell() {
  return (
    <>
      <MobileWarning />
      <AnonymousSessionHandler>
        <WorkspaceProvider>
          <HomePageContent />
        </WorkspaceProvider>
      </AnonymousSessionHandler>
    </>
  );
}

export default function HomePage() {
  return <HomeShell />;
}
