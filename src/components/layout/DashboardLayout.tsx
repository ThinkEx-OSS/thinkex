import { Sidebar, SidebarInset, useSidebar } from "@/components/ui/sidebar";
import { GridPattern } from "@/components/ui/shadcn-io/grid-pattern";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import WorkspaceSidebar from "@/components/workspace-canvas/WorkspaceSidebar";
import { AssistantPanel } from "@/components/assistant-ui/AssistantPanel";
import { WorkspaceRuntimeProvider } from "@/components/assistant-ui/WorkspaceRuntimeProvider";
import { WorkspaceCanvasDropzone } from "@/components/workspace-canvas/WorkspaceCanvasDropzone";
import { AssistantDropzone } from "@/components/assistant-ui/AssistantDropzone";
import { PANEL_DEFAULTS } from "@/lib/layout-constants";
import React, { useCallback, useEffect, useRef } from "react";
import { useUIStore } from "@/lib/stores/ui-store";

interface DashboardLayoutProps {
  // Workspace sidebar
  currentWorkspaceId: string | null;
  showJsonView: boolean;
  setShowJsonView: (show: boolean) => void;
  onWorkspaceSwitch: (slug: string) => void;
  showCreateModal: boolean;
  setShowCreateModal: (show: boolean) => void;

  // Workspace header (should span sidebar + workspace area)
  workspaceHeader?: React.ReactNode;

  // Chat state
  isDesktop: boolean;
  isChatExpanded: boolean;
  isChatMaximized: boolean;
  setIsChatExpanded: (expanded: boolean) => void;
  setIsChatMaximized: (maximized: boolean) => void;
  onWorkspaceSizeChange?: (size: number) => void;

  // Text selection handlers
  onSingleSelect?: (text: string) => void | Promise<void>;
  onMultiSelect?: (selections: Array<{ text: string; id: string }>) => void | Promise<void>;
  onAssistantThreadRunningChange?: (isRunning: boolean) => void;

  // Component slots
  workspaceSection: React.ReactNode;
  panels: React.ReactNode[];  // Array of panel elements to render (max 2)
  modalManager?: React.ReactNode; // Add modalManager as a separate prop
  maximizedItemId?: string | null; // Add maximized item ID
  workspaceSplitViewActive?: boolean; // Workspace split view mode (workspace + item)
}

/**
 * Main dashboard layout component.
 * Handles the overall structure including sidebars, grid pattern, and layout animations.
 */
export function DashboardLayout({
  currentWorkspaceId,
  showJsonView,
  setShowJsonView,
  onWorkspaceSwitch,
  showCreateModal,
  setShowCreateModal,
  workspaceHeader,
  isDesktop,
  isChatExpanded,
  isChatMaximized,
  setIsChatExpanded,
  setIsChatMaximized,
  onWorkspaceSizeChange,
  onSingleSelect,
  onMultiSelect,
  onAssistantThreadRunningChange,
  workspaceSection,
  panels,
  modalManager,
  maximizedItemId,
  workspaceSplitViewActive = false,
}: DashboardLayoutProps) {
  // Subscribe to openPanelIds for dual-panel mode detection
  const openPanelIds = useUIStore((state) => state.openPanelIds);
  const isDualPanel = workspaceSplitViewActive && openPanelIds.length === 2;

  // Get sidebar control to auto-close when panels open
  const { setOpen } = useSidebar();

  // OPTIMIZED: Memoize onLayoutChange callback to prevent ResizablePanelGroup re-renders
  // This prevents cascading re-renders of all ResizablePanel children
  const handlePanelLayout = useCallback((layout: { [panelId: string]: number }) => {
    // Track workspace size for column calculations
    const workspaceSize = layout["left-area-panel"] ?? 100;
    onWorkspaceSizeChange?.(workspaceSize);

    // Auto-maximize behavior removed - let users manually control chat size
  }, [onWorkspaceSizeChange]);



  // Render logic
  // Ensure chat is only shown when a workspace is active
  const effectiveChatExpanded = isChatExpanded && !!currentWorkspaceId;
  const effectiveChatMaximized = isChatMaximized && !!currentWorkspaceId;

  const content = (
    <div className="h-screen flex w-full">
      <GridPattern
        width={30}
        height={30}
        className="opacity-10"
        id="dashboard-grid-pattern"
      />

      {/* MAXIMIZED MODE: Show only chat (workspace completely hidden) */}
      {effectiveChatMaximized ? (
        <div className="relative flex-1 h-full z-10">
          <AssistantDropzone>
            <div className="flex-1 h-full">
              <AssistantPanel
                key={`assistant-panel-${currentWorkspaceId}`}
                workspaceId={currentWorkspaceId || ""}
                setIsChatExpanded={setIsChatExpanded}
                isChatMaximized={effectiveChatMaximized}
                setIsChatMaximized={setIsChatMaximized}
                onSingleSelect={onSingleSelect}
                onMultiSelect={onMultiSelect}
                onThreadRunningChange={onAssistantThreadRunningChange}
              />
            </div>
          </AssistantDropzone>
        </div>
      ) : (
        <ResizablePanelGroup
          key={`layout-${effectiveChatExpanded ? "chat" : "no-chat"}`}
          id={`layout-${effectiveChatExpanded ? "chat" : "no-chat"}`}
          orientation="horizontal"
          className="flex-1 z-10"
          onLayoutChange={handlePanelLayout}
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
              {/* Header spans sidebar + workspace canvas (only render when a workspace exists) */}
              {!!currentWorkspaceId && workspaceHeader}

              {/* Below header: sidebar + workspace content */}
              <div className="flex flex-1 overflow-hidden relative">
                <Sidebar
                  side="left"
                  variant="sidebar"
                  collapsible="offcanvas"
                  key={`sidebar-${currentWorkspaceId || "none"}`}
                  embedded
                >
                  <WorkspaceSidebar
                    showJsonView={showJsonView}
                    setShowJsonView={setShowJsonView}
                    onWorkspaceSwitch={onWorkspaceSwitch}
                    showCreateModal={showCreateModal}
                    setShowCreateModal={setShowCreateModal}
                    isChatExpanded={effectiveChatExpanded}
                    setIsChatExpanded={setIsChatExpanded}
                  />
                </Sidebar>

                <SidebarInset className="flex flex-col relative overflow-hidden">
                  {/* DUAL-PANEL MODE: Show two item panels side-by-side */}
                  {isDualPanel ? (
                    /* ModalManager handles the ResizablePanelGroup internally for dual mode */
                    <div className="flex-1 flex flex-col overflow-hidden">
                      {modalManager}
                    </div>
                  ) : workspaceSplitViewActive && maximizedItemId ? (
                    /* WORKSPACE SPLIT VIEW MODE: Show workspace + item side-by-side */
                    <ResizablePanelGroup orientation="horizontal" className="flex-1">
                      {/* Workspace Panel - Single Column Mode */}
                      <ResizablePanel
                        id="split-workspace-panel"
                        defaultSize="50%"
                        minSize="25%"
                        maxSize="60%"
                      >
                        <WorkspaceCanvasDropzone>{workspaceSection}</WorkspaceCanvasDropzone>
                      </ResizablePanel>

                      <ResizableHandle className="border-r border-sidebar-border" />

                      {/* Item Panel */}
                      <ResizablePanel
                        id="split-item-panel"
                        defaultSize="50%"
                        minSize="40%"
                      >
                        {modalManager}
                      </ResizablePanel>
                    </ResizablePanelGroup>
                  ) : (
                    <>
                      <WorkspaceCanvasDropzone>{workspaceSection}</WorkspaceCanvasDropzone>

                      {/* Hide workspace content when item is maximized for better performance */}
                      {maximizedItemId && (
                        <div className="absolute inset-0 bg-background pointer-events-none" />
                      )}

                      {/* Modal Manager - positioned here to cover strictly the workspace content area (below header) */}
                      {modalManager}
                    </>
                  )}
                </SidebarInset>
              </div>
            </div>
          </ResizablePanel>

          {/* Chat Section - Only when expanded and workspace exists */}
          {effectiveChatExpanded && (
            <>
              <ResizableHandle id="workspace-chat-handle" className="border-r border-sidebar-border" />
              <ResizablePanel
                id="chat-panel"
                defaultSize={panels.length > 0 ? `${PANEL_DEFAULTS.CHAT_MIN}%` : `${PANEL_DEFAULTS.CHAT}%`}
                minSize={`${PANEL_DEFAULTS.CHAT_MIN}%`}
                maxSize={`${PANEL_DEFAULTS.CHAT_MAX}%`}
              >
                <AssistantDropzone>
                  <AssistantPanel
                    key={`assistant-panel-${currentWorkspaceId}`}
                    workspaceId={currentWorkspaceId || ""}
                    setIsChatExpanded={setIsChatExpanded}
                    isChatMaximized={effectiveChatMaximized}
                    setIsChatMaximized={setIsChatMaximized}
                    onSingleSelect={onSingleSelect}
                    onMultiSelect={onMultiSelect}
                    onThreadRunningChange={onAssistantThreadRunningChange}
                  />
                </AssistantDropzone>
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      )}
    </div>
  );

  if (currentWorkspaceId) {
    return (
      <WorkspaceRuntimeProvider workspaceId={currentWorkspaceId}>
        {content}
      </WorkspaceRuntimeProvider>
    );
  }

  return content;
}
