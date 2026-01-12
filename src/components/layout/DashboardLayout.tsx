import { Sidebar, SidebarInset, useSidebar } from "@/components/ui/sidebar";
import { GridPattern } from "@/components/ui/shadcn-io/grid-pattern";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import WorkspaceSidebar from "@/components/workspace-canvas/WorkspaceSidebar";
import { AssistantPanel } from "@/components/assistant-ui/AssistantPanel";
import { WorkspaceRuntimeProvider } from "@/components/assistant-ui/WorkspaceRuntimeProvider";
import { WorkspaceCanvasDropzone } from "@/components/workspace-canvas/WorkspaceCanvasDropzone";
import { AssistantDropzone } from "@/components/assistant-ui/AssistantDropzone";
import { PANEL_DEFAULTS } from "@/lib/layout-constants";
import React, { useCallback, useRef } from "react";

interface DashboardLayoutProps {
  // Workspace sidebar
  currentWorkspaceId: string | null;
  showJsonView: boolean;
  setShowJsonView: (show: boolean) => void;
  onWorkspaceSwitch: (slug: string) => void;
  showCreateModal: boolean;
  setShowCreateModal: (show: boolean) => void;

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

  // Component slots
  workspaceSection: React.ReactNode;
  panels: React.ReactNode[];  // Array of panel elements to render (max 2)
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
  isDesktop,
  isChatExpanded,
  isChatMaximized,
  setIsChatExpanded,
  setIsChatMaximized,
  onWorkspaceSizeChange,
  onSingleSelect,
  onMultiSelect,
  workspaceSection,
  panels,
}: DashboardLayoutProps) {
  // OPTIMIZED: Memoize onLayout callback to prevent ResizablePanelGroup re-renders
  // This prevents cascading re-renders of all ResizablePanel children
  const handlePanelLayout = useCallback((sizes: number[]) => {
    // Track workspace size for column calculations
    const workspaceSize = sizes[0];
    onWorkspaceSizeChange?.(workspaceSize);

    // Auto-maximize behavior removed - let users manually control chat size
  }, [onWorkspaceSizeChange]);

  // Render logic
  // Ensure chat is only shown when a workspace is active
  const effectiveChatExpanded = isChatExpanded && !!currentWorkspaceId;
  const effectiveChatMaximized = isChatMaximized && !!currentWorkspaceId;

  const content = (
    <div className="h-screen flex w-full">
      {/* Left Sidebar - Key forces remount on workspace change */}
      <Sidebar side="left" variant="sidebar" collapsible="offcanvas" key={`sidebar-${currentWorkspaceId || 'none'}`}>
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

      {/* Main Layout */}
      <SidebarInset className="flex flex-col relative overflow-hidden">
        <GridPattern
          width={30}
          height={30}
          className="opacity-10"
          id="dashboard-grid-pattern"
        />
        <div className="flex flex-1 overflow-hidden relative z-10">
          {/* MAXIMIZED MODE: Show only chat (workspace completely hidden) */}
          {effectiveChatMaximized ? (
            <div className="relative flex-1 h-full">
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
                  />
                </div>
              </AssistantDropzone>
            </div>
          ) : (
            /* NORMAL MODE: Resizable workspace + chat */
            <ResizablePanelGroup
              key={`layout-${effectiveChatExpanded ? 'chat' : 'no-chat'}`}
              id={`layout-${effectiveChatExpanded ? 'chat' : 'no-chat'}`}
              direction="horizontal"
              className="flex-1"
              onLayout={handlePanelLayout}
            >
              {/* Workspace Panel - hidden when 2 item panels are open (split view) */}
              {panels.length < 2 && (
                <ResizablePanel
                  id="workspace-panel"
                  order={1}
                  defaultSize={(() => {
                    if (panels.length === 0) {
                      return effectiveChatExpanded ? PANEL_DEFAULTS.WORKSPACE_WITH_CHAT : 100;
                    }
                    // 1 panel + workspace = split based on ratio (workspace gets the smaller share)
                    const availableSpace = effectiveChatExpanded ? (100 - PANEL_DEFAULTS.CHAT_MIN) : 100;
                    return availableSpace * (1 - PANEL_DEFAULTS.ITEM_PANEL_SPLIT_RATIO);
                  })()}
                  minSize={panels.length > 0 ? 20 : (effectiveChatExpanded ? PANEL_DEFAULTS.WORKSPACE_MIN : 100)}
                >
                  <WorkspaceCanvasDropzone>
                    {workspaceSection}
                  </WorkspaceCanvasDropzone>
                </ResizablePanel>
              )}

              {/* Item Panels - dynamically rendered from array */}
              {panels.map((panel, index) => {
                // Extract key from the panel ReactNode (set by page.tsx as item.id)
                const panelKey = React.isValidElement(panel) ? panel.key : `panel-${index}`;
                return (
                  <React.Fragment key={panelKey}>
                    {/* Handle only needed when there's something before this panel */}
                    {(index > 0 || panels.length < 2) && (
                      <ResizableHandle
                        id={`panel-handle-${panelKey}`}
                        className="border-r border-sidebar-border"
                      />
                    )}
                    <ResizablePanel
                      id={`item-panel-${panelKey}`}
                      order={panels.length >= 2 ? (1 + index) : (2 + index)}
                      defaultSize={(() => {
                        if (panels.length >= 2) {
                          // 2 panels with chat = chat at min, panels split remaining
                          return effectiveChatExpanded ? (100 - PANEL_DEFAULTS.CHAT_MIN) / 2 : 50;
                        }
                        // 1 panel + workspace with chat = chat at min, split remaining based on ratio
                        const availableSpace = effectiveChatExpanded ? (100 - PANEL_DEFAULTS.CHAT_MIN) : 100;
                        return availableSpace * PANEL_DEFAULTS.ITEM_PANEL_SPLIT_RATIO;
                      })()}
                      minSize={20}
                    >
                      {panel}
                    </ResizablePanel>
                  </React.Fragment>
                );
              })}

              {/* Chat Section - Only when expanded and workspace exists */}
              {effectiveChatExpanded && (
                <>
                  <ResizableHandle
                    id="workspace-chat-handle"
                    className="border-r border-sidebar-border"
                  />

                  {/* Chat Panel */}
                  <ResizablePanel
                    id="chat-panel"
                    order={panels.length >= 2 ? 3 : (2 + panels.length)}
                    defaultSize={panels.length > 0 ? PANEL_DEFAULTS.CHAT_MIN : PANEL_DEFAULTS.CHAT}
                    minSize={PANEL_DEFAULTS.CHAT_MIN}
                    maxSize={PANEL_DEFAULTS.CHAT_MAX}
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
                      />
                    </AssistantDropzone>
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
          )}
        </div>
      </SidebarInset>
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

