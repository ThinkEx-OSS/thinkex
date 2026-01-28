"use client";

import { SEO } from "@/components/seo/SEO";
import { MobileWarning } from "@/components/ui/MobileWarning";
import { WorkspaceProvider, useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { HomeLayout } from "@/components/layout/HomeLayout";
import { HomeContent } from "@/components/home/HomeContent";
import { AnonymousSessionHandler, SidebarCoordinator } from "@/components/layout/SessionHandler";
import { useUIStore } from "@/lib/stores/ui-store";

// Home page content component
function HomePageContent() {
  const { switchWorkspace } = useWorkspaceContext();
  const showCreateModal = useUIStore((state) => state.showCreateWorkspaceModal);
  const setShowCreateModal = useUIStore((state) => state.setShowCreateWorkspaceModal);

  return (
    <HomeLayout
      onWorkspaceSwitch={switchWorkspace}
      showCreateModal={showCreateModal}
      setShowCreateModal={setShowCreateModal}
    >
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
          <SidebarCoordinator defaultOpen={true}>
            <HomePageContent />
          </SidebarCoordinator>
        </WorkspaceProvider>
      </AnonymousSessionHandler>
    </>
  );
}

export default function HomePage() {
  return (
    <>
      <SEO
        title="Home"
        description="Choose a workspace or create a new one to start organizing your knowledge in ThinkEx."
        keywords="home, workspaces, dashboard, productivity tools"
        url="https://thinkex.app/home"
        canonical="https://thinkex.app/home"
      />
      <HomeShell />
    </>
  );
}
