"use client";

import { HomeContent } from "@/components/home/HomeContent";
import { HomeLayout } from "@/components/layout/HomeLayout";
import { AnonymousSessionHandler } from "@/components/layout/SessionHandler";
import { MobileWarning } from "@/components/ui/MobileWarning";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import type { WorkspaceListItem } from "@/lib/workspace/list-workspaces";

export interface InitialAuth {
  isAnonymous: boolean;
  userName: string | null;
  userImage: string | null;
}

interface HomeShellProps {
  initialAuth: InitialAuth;
  initialWorkspaces: WorkspaceListItem[] | null;
}

export function HomeShell({
  initialAuth,
  initialWorkspaces,
}: HomeShellProps) {
  return (
    <>
      <MobileWarning />
      <AnonymousSessionHandler>
        <WorkspaceProvider initialWorkspaces={initialWorkspaces}>
          <HomeLayout>
            <HomeContent initialAuth={initialAuth} />
          </HomeLayout>
        </WorkspaceProvider>
      </AnonymousSessionHandler>
    </>
  );
}
