import { Sidebar, SidebarInset } from "@/components/ui/sidebar";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import WorkspaceSidebar from "@/components/workspace-canvas/WorkspaceSidebar";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ChatProvider } from "@/components/chat/ChatProvider";
import { ChatRuntimesProvider } from "@/components/chat/ChatRuntimes";
import { ComposerProvider } from "@/components/chat/composer-context";
import { WorkspaceCanvasDropzone } from "@/components/workspace-canvas/WorkspaceCanvasDropzone";
import { PANEL_DEFAULTS } from "@/lib/layout-constants";
import React from "react";

interface DashboardLayoutProps {
  // Workspace sidebar
  currentWorkspaceId: string | null;
  onWorkspaceSwitch: (slug: string) => void;
  showCreateModal: boolean;
  setShowCreateModal: (show: boolean) => void;

  // Chat state
  isDesktop: boolean;
  isChatExpanded: boolean;
  isChatMaximized: boolean;
  setIsChatExpanded: (expanded: boolean) => void;
  setIsChatMaximized: (maximized: boolean) => void;

  // Component slots
  workspaceSection: React.ReactNode;
  workspaceHeader?: React.ReactNode; // Header that spans above sidebar + workspace
}

/**
 * Main dashboard layout component.
 * Handles the overall structure including sidebars and layout animations.
 */
export function DashboardLayout({
  currentWorkspaceId,
  onWorkspaceSwitch,
  showCreateModal,
  setShowCreateModal,
  isChatExpanded,
  isChatMaximized,
  setIsChatExpanded,
  setIsChatMaximized,
  workspaceSection,
  workspaceHeader,
}: DashboardLayoutProps) {
  // Render logic
  // Ensure chat is only shown when a workspace is active
  const effectiveChatExpanded = isChatExpanded && !!currentWorkspaceId;
  const effectiveChatMaximized = isChatMaximized && !!currentWorkspaceId;

  const content = (
    <div className="h-screen flex w-full">
      {/* MAXIMIZED MODE: Show only chat (workspace completely hidden) */}
      {effectiveChatMaximized ? (
        <div className="relative flex-1 h-full z-10">
          <div className="flex-1 h-full">
            <ChatPanel
              key={`chat-panel-${currentWorkspaceId}`}
              workspaceId={currentWorkspaceId || ""}
              setIsChatExpanded={setIsChatExpanded}
              isChatMaximized={effectiveChatMaximized}
              setIsChatMaximized={setIsChatMaximized}
            />
          </div>
        </div>
      ) : (
        <ResizablePanelGroup
          key={`layout-${effectiveChatExpanded ? "chat" : "no-chat"}`}
          id={`layout-${effectiveChatExpanded ? "chat" : "no-chat"}`}
          orientation="horizontal"
          className="flex-1 z-10"
        >
          {/* Left Area: Workspace area (header + sidebar + workspace canvas) */}
          <ResizablePanel
            id="left-area-panel"
            defaultSize={(() => {
              if (!effectiveChatExpanded) return "100%";
              return `${100 - PANEL_DEFAULTS.CHAT}%`;
            })()}
            minSize={effectiveChatExpanded ? `${PANEL_DEFAULTS.WORKSPACE_MIN}%` : "100%"}
          >
            <div className="h-full flex flex-col relative overflow-hidden">
              {!!currentWorkspaceId && workspaceHeader}
              <div className="flex flex-1 overflow-hidden relative">
                <Sidebar
                  side="left"
                  variant="sidebar"
                  collapsible="offcanvas"
                  key={`sidebar-${currentWorkspaceId || "none"}`}
                  embedded
                >
                  <WorkspaceSidebar
                    onWorkspaceSwitch={onWorkspaceSwitch}
                    showCreateModal={showCreateModal}
                    setShowCreateModal={setShowCreateModal}
                    isChatExpanded={effectiveChatExpanded}
                    setIsChatExpanded={setIsChatExpanded}
                  />
                </Sidebar>
                <SidebarInset className="flex flex-col relative overflow-hidden">
                  <WorkspaceCanvasDropzone>{workspaceSection}</WorkspaceCanvasDropzone>
                </SidebarInset>
              </div>
            </div>
          </ResizablePanel>

          {/* Chat Section - Only when expanded and workspace exists */}
          {effectiveChatExpanded && (
            <>
              <ResizableHandle id="workspace-chat-handle" />
              <ResizablePanel
                id="chat-panel"
                defaultSize={`${PANEL_DEFAULTS.CHAT}%`}
                minSize={`${PANEL_DEFAULTS.CHAT_MIN}%`}
                maxSize={`${PANEL_DEFAULTS.CHAT_MAX}%`}
              >
                <ChatPanel
                  key={`chat-panel-${currentWorkspaceId}`}
                  workspaceId={currentWorkspaceId || ""}
                  setIsChatExpanded={setIsChatExpanded}
                  isChatMaximized={effectiveChatMaximized}
                  setIsChatMaximized={setIsChatMaximized}
                />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      )}
    </div>
  );

  if (currentWorkspaceId) {
    return (
      <ChatRuntimesProvider workspaceId={currentWorkspaceId}>
        <ChatProvider workspaceId={currentWorkspaceId}>
          <ComposerProvider>{content}</ComposerProvider>
        </ChatProvider>
      </ChatRuntimesProvider>
    );
  }

  return content;
}
