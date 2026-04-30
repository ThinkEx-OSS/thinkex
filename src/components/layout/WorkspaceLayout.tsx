"use client";

import React from "react";
import { Sidebar, SidebarInset } from "@/components/ui/sidebar";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import WorkspaceSidebar from "@/components/workspace-canvas/WorkspaceSidebar";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ChatProvider } from "@/components/chat/ChatProvider";
import { ComposerProvider } from "@/components/chat/composer-context";
import { WorkspaceCanvasDropzone } from "@/components/workspace-canvas/WorkspaceCanvasDropzone";
import { PANEL_DEFAULTS } from "@/lib/layout-constants";
import { useUIStore } from "@/lib/stores/ui-store";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { WorkspaceHeaderSkeleton } from "@/components/workspace/WorkspaceLoader";

interface WorkspaceLayoutProps {
  workspaceSection: React.ReactNode;
  /** Header rendered above sidebar + canvas. Pass `undefined` to hide. */
  workspaceHeader?: React.ReactNode;
}

/**
 * Main workspace layout. Reads chat/sidebar state from stores and the active
 * workspace from context; only takes the visual slot props.
 */
export function WorkspaceLayout({
  workspaceSection,
  workspaceHeader,
}: WorkspaceLayoutProps) {
  const { currentWorkspace, switchWorkspace } = useWorkspaceContext();
  const currentWorkspaceId = currentWorkspace?.id ?? null;

  const isChatExpanded = useUIStore((s) => s.isChatExpanded);
  const isChatMaximized = useUIStore((s) => s.isChatMaximized);
  const setIsChatExpanded = useUIStore((s) => s.setIsChatExpanded);
  const setIsChatMaximized = useUIStore((s) => s.setIsChatMaximized);
  const showCreateModal = useUIStore((s) => s.showCreateWorkspaceModal);
  const setShowCreateModal = useUIStore((s) => s.setShowCreateWorkspaceModal);

  // Reserve the chat slot as soon as the user wants chat open, even before
  // `currentWorkspaceId` lands. Otherwise the workspace canvas paints full-width
  // for the slug→id roundtrip and then suddenly shrinks ~25% when chat snaps in.
  const effectiveChatExpanded = isChatExpanded;
  const effectiveChatMaximized = isChatMaximized;

  const content = (
    <div className="h-screen flex w-full">
      {effectiveChatMaximized ? (
        <div className="relative flex-1 h-full z-10">
          <div className="flex-1 h-full">
            <ChatPanel
              workspaceId={currentWorkspaceId || ""}
              setIsChatExpanded={setIsChatExpanded}
              isChatMaximized={effectiveChatMaximized}
              setIsChatMaximized={setIsChatMaximized}
            />
          </div>
        </div>
      ) : (
        <ResizablePanelGroup orientation="horizontal" className="flex-1 z-10">
          <ResizablePanel
            id="left-area-panel"
            defaultSize={
              effectiveChatExpanded ? `${100 - PANEL_DEFAULTS.CHAT}%` : "100%"
            }
            minSize={
              effectiveChatExpanded
                ? `${PANEL_DEFAULTS.WORKSPACE_MIN}%`
                : "100%"
            }
          >
            <div className="h-full flex flex-col relative overflow-hidden">
              {currentWorkspaceId ? workspaceHeader : <WorkspaceHeaderSkeleton />}
              <div className="flex flex-1 overflow-hidden relative">
                <Sidebar
                  side="left"
                  variant="sidebar"
                  collapsible="offcanvas"
                  embedded
                >
                  <WorkspaceSidebar
                    onWorkspaceSwitch={switchWorkspace}
                    showCreateModal={showCreateModal}
                    setShowCreateModal={setShowCreateModal}
                    isChatExpanded={effectiveChatExpanded}
                    setIsChatExpanded={setIsChatExpanded}
                  />
                </Sidebar>
                <SidebarInset className="flex flex-col relative overflow-hidden">
                  <WorkspaceCanvasDropzone>
                    {workspaceSection}
                  </WorkspaceCanvasDropzone>
                </SidebarInset>
              </div>
            </div>
          </ResizablePanel>

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
      <ChatProvider workspaceId={currentWorkspaceId}>
        <ComposerProvider>{content}</ComposerProvider>
      </ChatProvider>
    );
  }

  return content;
}
