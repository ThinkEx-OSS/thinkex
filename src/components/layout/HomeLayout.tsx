"use client";

import { Sidebar, SidebarInset } from "@/components/ui/sidebar";
import { GridPattern } from "@/components/ui/shadcn-io/grid-pattern";
import WorkspaceSidebar from "@/components/workspace-canvas/WorkspaceSidebar";
import { useUIStore } from "@/lib/stores/ui-store";

interface HomeLayoutProps {
  onWorkspaceSwitch: (slug: string) => void;
  showCreateModal: boolean;
  setShowCreateModal: (show: boolean) => void;
  children: React.ReactNode;
}

/**
 * Simplified layout for home page.
 * Only includes sidebar and content - no panels, no chat, no resizable panels.
 */
export function HomeLayout({
  onWorkspaceSwitch,
  showCreateModal,
  setShowCreateModal,
  children,
}: HomeLayoutProps) {
  const showJsonView = useUIStore((state) => state.showJsonView);
  const setShowJsonView = useUIStore((state) => state.setShowJsonView);

  return (
    <div className="h-screen flex w-full">
      {/* Left Sidebar */}
      <Sidebar side="left" variant="sidebar" collapsible="offcanvas">
        <WorkspaceSidebar
          showJsonView={showJsonView}
          setShowJsonView={setShowJsonView}
          onWorkspaceSwitch={onWorkspaceSwitch}
          showCreateModal={showCreateModal}
          setShowCreateModal={setShowCreateModal}
          isChatExpanded={false}
          setIsChatExpanded={() => {}}
        />
      </Sidebar>

      {/* Main Content */}
      <SidebarInset className="flex flex-col relative overflow-hidden">
        <GridPattern
          width={30}
          height={30}
          className="opacity-10"
          id="home-grid-pattern"
        />
        <div className="flex-1 overflow-hidden relative z-10">
          {children}
        </div>
      </SidebarInset>
    </div>
  );
}
