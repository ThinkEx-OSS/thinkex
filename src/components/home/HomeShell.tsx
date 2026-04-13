"use client";

import { MobileWarning } from "@/components/ui/MobileWarning";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { HomeLayout } from "@/components/layout/HomeLayout";
import { HomeContent } from "@/components/home/HomeContent";
import { AnonymousSessionHandler } from "@/components/layout/SessionHandler";

export interface InitialAuth {
  isAnonymous: boolean;
  userName: string | null;
  userImage: string | null;
}

interface HomeShellProps {
  showDemoVideo: boolean;
  initialAuth: InitialAuth;
  initialWorkspaces: any[] | null;
}

export function HomeShell({ showDemoVideo, initialAuth, initialWorkspaces }: HomeShellProps) {
  return (
    <>
      <MobileWarning />
      <AnonymousSessionHandler>
        <WorkspaceProvider initialWorkspaces={initialWorkspaces}>
          <HomeLayout>
            <HomeContent showDemoVideo={showDemoVideo} initialAuth={initialAuth} />
          </HomeLayout>
        </WorkspaceProvider>
      </AnonymousSessionHandler>
    </>
  );
}
