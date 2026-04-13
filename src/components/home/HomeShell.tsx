"use client";

import { MobileWarning } from "@/components/ui/MobileWarning";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { HomeLayout } from "@/components/layout/HomeLayout";
import { HomeContent } from "@/components/home/HomeContent";
import { AnonymousSessionHandler } from "@/components/layout/SessionHandler";

interface HomeShellProps {
  showDemoVideo: boolean;
}

export function HomeShell({ showDemoVideo }: HomeShellProps) {
  return (
    <>
      <MobileWarning />
      <AnonymousSessionHandler>
        <WorkspaceProvider>
          <HomeLayout>
            <HomeContent showDemoVideo={showDemoVideo} />
          </HomeLayout>
        </WorkspaceProvider>
      </AnonymousSessionHandler>
    </>
  );
}
