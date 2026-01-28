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
  workspaceHeader,
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
  // Get sidebar control to auto-close when panels open
  const { setOpen } = useSidebar();

  // OPTIMIZED: Memoize onLayout callback to prevent ResizablePanelGroup re-renders
  // This prevents cascading re-renders of all ResizablePanel children
  const handlePanelLayout = useCallback((sizes: number[]) => {
    // Track workspace size for column calculations
    const workspaceSize = sizes[0];
    onWorkspaceSizeChange?.(workspaceSize);

    // Auto-maximize behavior removed - let users manually control chat size
  }, [onWorkspaceSizeChange]);

  // Auto-close sidebar when opening item panels to maximize screen space
  const prevPanelCountRef = useRef(panels.length);
  useEffect(() => {
    // Only close when panels go from 0 to 1+ (not when adding more panels)
    if (prevPanelCountRef.current === 0 && panels.length > 0) {
      setOpen(false);
    }
    prevPanelCountRef.current = panels.length;
  }, [panels.length, setOpen]);

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
              />
            </div>
          </AssistantDropzone>
        </div>
      ) : (
        <ResizablePanelGroup
          key={`layout-${effectiveChatExpanded ? "chat" : "no-chat"}`}
          id={`layout-${effectiveChatExpanded ? "chat" : "no-chat"}`}
          direction="horizontal"
          className="flex-1 z-10"
          onLayout={handlePanelLayout}
        >
          {/* Left Area: Split between workspace area (with header) and item panels */}
          <ResizablePanel
            id="left-area-panel"
            order={1}
            defaultSize={(() => {
              if (!effectiveChatExpanded) return 100;
              return 100 - PANEL_DEFAULTS.CHAT;
            })()}
            minSize={effectiveChatExpanded ? PANEL_DEFAULTS.WORKSPACE_MIN : 100}
          >
            <ResizablePanelGroup
              id={`left-area-split-${panels.length}`}
              // Force re-mount when panel count changes to ensure defaultSize is respected
              // and to prevent "Panel data not found" errors from react-resizable-panels
              key={`left-area-split-${panels.length}`}
              direction="horizontal"
              className="flex-1 h-full"
            >
              {/* Workspace area: header + sidebar + workspace canvas */}
              <ResizablePanel
                id="workspace-area-panel"
                order={0}
                defaultSize={(() => {
                  if (panels.length === 0) {
                    return 100;
                  }
                  if (panels.length >= 2) {
                    return 0; // Hide workspace when 2 panels are open
                  }
                  return 100 * (1 - PANEL_DEFAULTS.ITEM_PANEL_SPLIT_RATIO);
                })()}
                minSize={panels.length >= 2 ? 0 : (panels.length > 0 ? 20 : 100)}
              >
                <div className="h-full flex flex-col relative overflow-hidden">
                  {/* Header spans sidebar + workspace canvas (only render when a workspace exists) */}
                  {!!currentWorkspaceId && workspaceHeader}

                  {/* Below header: sidebar + workspace content */}
                  <div className="flex flex-1 overflow-hidden">
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
                      <WorkspaceCanvasDropzone>{workspaceSection}</WorkspaceCanvasDropzone>
                    </SidebarInset>
                  </div>
                </div>
              </ResizablePanel>

              {/* Item Panels - full height, start at top */}
              {panels.length > 0 && (
                <>
                  {panels.length < 2 && (
                    <ResizableHandle
                      id="workspace-panel-handle"
                      className="border-r border-sidebar-border"
                    />
                  )}
                  {panels.map((panel, index) => {
                    const panelKey = React.isValidElement(panel) ? panel.key : `panel-${index}`;
                    return (
                      <React.Fragment key={panelKey}>
                        {panels.length >= 2 && index > 0 && (
                          <ResizableHandle
                            id={`panel-handle-${panelKey}`}
                            className="border-r border-sidebar-border"
                          />
                        )}
                        <ResizablePanel
                          id={`item-panel-${panelKey}`}
                          order={index + 1}
                          defaultSize={panels.length >= 2 ? 50 : 100 * PANEL_DEFAULTS.ITEM_PANEL_SPLIT_RATIO}
                          minSize={20}
                        >
                          {panel}
                        </ResizablePanel>
                      </React.Fragment>
                    );
                  })}
                </>
              )}
            </ResizablePanelGroup>
          </ResizablePanel>

          {/* Chat Section - Only when expanded and workspace exists */}
          {effectiveChatExpanded && (
            <>
              <ResizableHandle id="workspace-chat-handle" className="border-r border-sidebar-border" />
              <ResizablePanel
                id="chat-panel"
                order={2}
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

