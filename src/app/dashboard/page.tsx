"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { usePostHog } from 'posthog-js/react';
import type { AgentState, PdfData, WorkspaceWithState } from "@/lib/workspace-state/types";
import { initialState } from "@/lib/workspace-state/state";
import { useScrollHeader } from "@/hooks/ui/use-scroll-header";
import { useKeyboardShortcuts } from "@/hooks/ui/use-keyboard-shortcuts";
import { useLayoutState } from "@/hooks/ui/use-layout-state";
import useMediaQuery from "@/hooks/ui/use-media-query";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { useWorkspaceOperations } from "@/hooks/workspace/use-workspace-operations";
import { useWorkspaceHistory } from "@/hooks/workspace/use-workspace-history";
import { useWorkspaceEvents } from "@/hooks/workspace/use-workspace-events";
import { useTextSelectionAgent } from "@/hooks/workspace/use-text-selection-agent";
import { WorkspaceProvider, useWorkspaceContext } from "@/contexts/WorkspaceContext";
// import { JoyrideProvider } from "@/contexts/JoyrideContext";
import { useUIStore } from "@/lib/stores/ui-store";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { useSession } from "@/lib/auth-client";
import { WorkspaceSection } from "@/components/workspace-canvas/WorkspaceSection";
import WorkspaceHeader from "@/components/workspace-canvas/WorkspaceHeader";
import { ModalManager } from "@/components/modals/ModalManager";
import { AnonymousSignInPrompt } from "@/components/modals/AnonymousSignInPrompt";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ItemPanelContent } from "@/components/workspace-canvas/ItemPanelContent";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { MobileWarning } from "@/components/ui/MobileWarning";
import { AnonymousSessionHandler, SidebarCoordinator } from "@/components/layout/SessionHandler";
// import { OnboardingVideoDialog } from "@/components/onboarding/OnboardingVideoDialog";
// import { useOnboardingStatus } from "@/hooks/user/use-onboarding-status";
import { PdfEngineWrapper } from "@/components/pdf/PdfEngineWrapper";
import WorkspaceSettingsModal from "@/components/workspace/WorkspaceSettingsModal";
import ShareWorkspaceDialog from "@/components/workspace/ShareWorkspaceDialog";
import { RealtimeProvider } from "@/contexts/RealtimeContext";
import { toast } from "sonner";

import { InviteGuard } from "@/components/workspace/InviteGuard";
import { useReactiveNavigation } from "@/hooks/ui/use-reactive-navigation";

// Main dashboard content component
interface DashboardContentProps {
  currentWorkspace: WorkspaceWithState | null;
  loadingWorkspaces: boolean;
  loadingCurrentWorkspace: boolean;
}

function DashboardContent({
  currentWorkspace,
  loadingWorkspaces,
  loadingCurrentWorkspace,
}: DashboardContentProps) {
  const posthog = usePostHog();
  const { data: session } = useSession();

  const currentWorkspaceId = currentWorkspace?.id || null;
  const currentWorkspaceTitle = currentWorkspace?.name;
  const currentWorkspaceIcon = currentWorkspace?.icon;
  const currentWorkspaceColor = currentWorkspace?.color;

  // Check onboarding status
  // const { shouldShowOnboarding, isLoading: isLoadingOnboarding } = useOnboardingStatus();
  // const [showOnboardingDialog, setShowOnboardingDialog] = useState(false);

  // Show onboarding dialog when user hasn't completed onboarding
  // useEffect(() => {
  //   if (!isLoadingOnboarding && shouldShowOnboarding) {
  //     setShowOnboardingDialog(true);
  //   }
  // }, [shouldShowOnboarding, isLoadingOnboarding]);
  // Get workspace context (now only manages workspace list)
  const {
    currentSlug,
    switchWorkspace,
  } = useWorkspaceContext();

  // Get save status from Zustand store
  const { isSaving, lastSavedAt, hasUnsavedChanges, updateSaveStatus, updateLastSaved, updateHasUnsavedChanges } =
    useWorkspaceStore();

  // ===== EVENT-BASED STATE MANAGEMENT =====
  // Event sourcing + React Query replaces the old autosave/loader hooks
  // State is derived from events, mutations are optimistic
  const { state, isLoading: isLoadingWorkspace, version } = useWorkspaceState(currentWorkspaceId);

  // Clear playing YouTube videos when workspace view mounts (e.g., navigating back from home)
  const clearPlayingYouTubeCards = useUIStore((state) => state.clearPlayingYouTubeCards);
  useEffect(() => {
    clearPlayingYouTubeCards();
  }, [clearPlayingYouTubeCards]);

  // Workspace operations (emits events with optimistic updates)
  const operations = useWorkspaceOperations(currentWorkspaceId, state);

  // Version control (history only)
  const { revertToVersion } = useWorkspaceHistory(currentWorkspaceId);
  const { data: eventLog } = useWorkspaceEvents(currentWorkspaceId);

  // Track sign-in prompt for anonymous users
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);

  // Workspace settings/share modals (lifted so header can open them)
  const [showWorkspaceSettings, setShowWorkspaceSettings] = useState(false);
  const [showWorkspaceShare, setShowWorkspaceShare] = useState(false);

  // Show sign-in prompt after 13 events for anonymous users
  useEffect(() => {
    // Only show for anonymous users
    if (!session?.user?.isAnonymous) {
      return;
    }

    // Wait for events to load
    if (!eventLog || isLoadingWorkspace || !currentWorkspaceId) {
      return;
    }

    // Check if we've already shown the prompt for this workspace
    const promptKey = `sign-in-prompt-shown-${currentWorkspaceId}`;
    const hasShownPrompt = localStorage.getItem(promptKey) === 'true';

    if (hasShownPrompt) {
      return;
    }

    const eventCount = eventLog.events?.length || 0;

    // Show prompt after 13 events
    if (eventCount >= 13) {
      setShowSignInPrompt(true);
      localStorage.setItem(promptKey, 'true');
    }
  }, [session?.user?.isAnonymous, eventLog, isLoadingWorkspace, currentWorkspaceId]);

  // Get sidebar state and controls
  const { state: leftSidebarState, toggleSidebar } = useSidebar();
  const isLeftSidebarOpen = leftSidebarState === "expanded";

  // Manual save is now just a no-op since events auto-persist
  // But we keep it for the UI save button
  const manualSave = useCallback(async () => {
    posthog.capture('manual-save-clicked', { workspace_id: currentWorkspaceId });
    updateLastSaved(new Date());
  }, [updateLastSaved, currentWorkspaceId, posthog]);

  // Update save status based on mutation status
  useEffect(() => {
    updateSaveStatus(operations.isPending);
    if (!operations.isPending && !operations.isError) {
      updateHasUnsavedChanges(false);
      updateLastSaved(new Date());
    }
  }, [operations.isPending, operations.isError, updateSaveStatus, updateHasUnsavedChanges, updateLastSaved]);

  // Mark as saved when workspace is loaded from events
  useEffect(() => {
    if (!isLoadingWorkspace && currentWorkspaceId && state.items) {
      // Use the last event's timestamp if available, otherwise use current time
      let lastSavedDate: Date;
      if (eventLog?.events && eventLog.events.length > 0) {
        // Events are ordered by version, so the last event is the most recent
        const lastEvent = eventLog.events[eventLog.events.length - 1];
        // Ensure timestamp exists and is valid
        if (lastEvent.timestamp != null) {
          // Ensure timestamp is a number (might be string from JSON)
          const timestamp = typeof lastEvent.timestamp === 'number'
            ? lastEvent.timestamp
            : Number(lastEvent.timestamp);
          lastSavedDate = new Date(timestamp);
          // Validate the date is valid
          if (isNaN(lastSavedDate.getTime())) {
            // If invalid, fallback to current time
            lastSavedDate = new Date();
          }
        } else {
          // If timestamp is missing, fallback to current time
          lastSavedDate = new Date();
        }
      } else {
        // Fallback to current time if no events exist (new workspace)
        lastSavedDate = new Date();
      }
      updateLastSaved(lastSavedDate);
      updateHasUnsavedChanges(false);
    }
  }, [isLoadingWorkspace, currentWorkspaceId, state.items, eventLog, updateLastSaved, updateHasUnsavedChanges]);

  // UI State from Zustand stores - using individual selectors to prevent unnecessary re-renders
  // NOTE: Each selector only triggers a re-render when that specific value changes
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const showJsonView = useUIStore((state) => state.showJsonView);
  const isChatExpanded = useUIStore((state) => state.isChatExpanded);
  const searchQuery = useUIStore((state) => state.searchQuery);
  const isChatMaximized = useUIStore((state) => state.isChatMaximized);
  const workspacePanelSize = useUIStore((state) => state.workspacePanelSize);
  // NOTE: openModalItemId is subscribed ONLY in ModalManager to prevent re-renders here
  const showVersionHistory = useUIStore((state) => state.showVersionHistory);
  const showCreateWorkspaceModal = useUIStore((state) => state.showCreateWorkspaceModal);
  const setShowJsonView = useUIStore((state) => state.setShowJsonView);
  const setIsChatExpanded = useUIStore((state) => state.setIsChatExpanded);
  const setSearchQuery = useUIStore((state) => state.setSearchQuery);
  const setIsChatMaximized = useUIStore((state) => state.setIsChatMaximized);
  const setOpenModalItemId = useUIStore((state) => state.setOpenModalItemId);
  const setShowVersionHistory = useUIStore((state) => state.setShowVersionHistory);
  const setShowCreateWorkspaceModal = useUIStore((state) => state.setShowCreateWorkspaceModal);
  const setWorkspacePanelSize = useUIStore((state) => state.setWorkspacePanelSize);
  const toggleChatExpanded = useUIStore((state) => state.toggleChatExpanded);
  const toggleChatMaximized = useUIStore((state) => state.toggleChatMaximized);

  // Panel state - using new array-based system
  const openPanelIds = useUIStore((state) => state.openPanelIds);
  const closePanel = useUIStore((state) => state.closePanel);
  const maximizedItemId = useUIStore((state) => state.maximizedItemId);
  const setMaximizedItemId = useUIStore((state) => state.setMaximizedItemId);

  // Refs and custom hooks
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const { titleInputRef } = useScrollHeader(scrollAreaRef);

  // Layout state
  const layout = useLayoutState({
    isLeftSidebarOpen,
    isChatExpanded,
    workspacePanelSize,
    isChatMaximized,
    isDesktop,
  });

  // Keyboard shortcuts
  useKeyboardShortcuts(
    toggleChatExpanded,
    {
      onToggleSidebar: toggleSidebar,
      onToggleChatMaximize: toggleChatMaximized,
      onFocusSearch: () => {
        titleInputRef.current?.focus();
      },
    }
  );

  // Expand chat when landing with ?createFrom=... (create workspace from home prompt)
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("createFrom")) {
      setIsChatExpanded(true);
    }
  }, [searchParams, setIsChatExpanded]);

  // Reset JSON view when there are no items
  useEffect(() => {
    const itemsCount = state?.items?.length || 0;
    if (itemsCount === 0 && showJsonView) {
      setShowJsonView(false);
    }
  }, [state?.items, showJsonView, setShowJsonView]);

  const getStatePreviewJSON = (s: AgentState | undefined): Record<string, unknown> => {
    const snapshot = (s ?? initialState) as AgentState;
    const { globalTitle, globalDescription, items } = snapshot;
    return {
      globalTitle: globalTitle ?? initialState.globalTitle,
      globalDescription: globalDescription ?? initialState.globalDescription,
      items: items ?? initialState.items,
    };
  };

  // Derive item panels from openPanelIds array
  // NOTE: With split view removed, we always use maximizedItemId (ModalManager)
  // But we keep the panels calculation for now in case we want to re-enable split view later
  // or for the "transition" state. However, openPanel in ui-store now enforces maximizedItemId.
  const panels = useMemo(() => {
    // We don't render side-by-side panels anymore
    return [];
  }, []);

  // CopilotKit actions removed - now using Assistant-UI directly

  // Define Modal Manager Element to reuse
  const modalManagerElement = (
    <ModalManager
      items={state.items}
      onUpdateItem={operations.updateItem}
      onUpdateItemData={operations.updateItemData}

      onFlushPendingChanges={operations.flushPendingChanges}
      showVersionHistory={showVersionHistory}
      setShowVersionHistory={setShowVersionHistory}
      events={eventLog?.events || []}
      currentVersion={version}
      onRevertToVersion={revertToVersion}
      workspaceId={currentWorkspaceId}
    />
  );

  // Text selection handlers - delegate to agent for intelligent processing
  const { handleCreateInstantNote, handleCreateCardFromSelections } = useTextSelectionAgent(operations);

  // Handle reactive navigation for new items
  const { handleCreatedItems } = useReactiveNavigation(state);

  const handleWorkspacePdfUpload = useCallback(
    async (files: File[]) => {
      if (!currentWorkspaceId) {
        throw new Error("Workspace not available");
      }

      const uploadPromises = files.map(async (file) => {
        const formData = new FormData();
        formData.append("file", file);

        const uploadResponse = await fetch("/api/upload-file", {
          method: "POST",
          body: formData,
        });

        if (!uploadResponse.ok) {
          throw new Error(`Failed to upload PDF: ${uploadResponse.statusText}`);
        }

        const { url: fileUrl, filename } = await uploadResponse.json();

        return {
          fileUrl,
          filename: filename || file.name,
          fileSize: file.size,
          name: file.name.replace(/\.pdf$/i, ""),
        };
      });

      const uploadResults = await Promise.all(uploadPromises);
      const pdfCardDefinitions = uploadResults.map((result) => {
        const pdfData: Partial<PdfData> = {
          fileUrl: result.fileUrl,
          filename: result.filename,
          fileSize: result.fileSize,
        };

        return {
          type: "pdf" as const,
          name: result.name,
          initialData: pdfData,
        };
      });

      // Create all PDF cards and navigate to the first one
      const createdIds = operations.createItems(pdfCardDefinitions);
      handleCreatedItems(createdIds);
    },
    [operations, currentWorkspaceId, handleCreatedItems]
  );

  const handleShowHistory = useCallback(() => {
    posthog.capture("version-history-viewed", { workspace_id: currentWorkspaceId });
    setShowWorkspaceShare(true); // Open share dialog instead of dedicated history modal
  }, [posthog, currentWorkspaceId]);


  return (
    <PdfEngineWrapper>
      {/* <OnboardingVideoDialog
        open={showOnboardingDialog}
        onOpenChange={setShowOnboardingDialog}
      /> */}
      <AnonymousSignInPrompt
        open={showSignInPrompt}
        onOpenChange={setShowSignInPrompt}
      />
      <DashboardLayout
        currentWorkspaceId={currentWorkspaceId}
        showJsonView={showJsonView}
        setShowJsonView={setShowJsonView}
        onWorkspaceSwitch={switchWorkspace}
        showCreateModal={showCreateWorkspaceModal}
        setShowCreateModal={setShowCreateWorkspaceModal}
        workspaceHeader={
          !showJsonView && !isChatMaximized && currentWorkspaceId && !isLoadingWorkspace ? (
            <WorkspaceHeader
              titleInputRef={titleInputRef}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              currentWorkspaceId={currentWorkspaceId}
              isDesktop={isDesktop}
              isChatExpanded={isChatExpanded}
              setIsChatExpanded={setIsChatExpanded}
              workspaceName={currentWorkspaceTitle || state.globalTitle}
              workspaceIcon={currentWorkspaceIcon}
              workspaceColor={currentWorkspaceColor}
              addItem={operations.createItem}
              onPDFUpload={handleWorkspacePdfUpload}
              onItemCreated={handleCreatedItems}
              setOpenModalItemId={setOpenModalItemId}
              items={state.items || []}
              onRenameFolder={(folderId, newName) => {
                operations.updateItem(folderId, { name: newName });
              }}
              onOpenSettings={() => setShowWorkspaceSettings(true)}
              onOpenShare={() => setShowWorkspaceShare(true)}
              isItemPanelOpen={panels.length > 0}

              // Active Item Props
              activeItems={(() => {
                if (maximizedItemId) {
                  const item = state.items?.find(i => i.id === maximizedItemId);
                  return item ? [item] : [];
                }
                // If not maximized, show open panels (split view) in breadcrumb too
                if (openPanelIds.length > 0) {
                  return openPanelIds
                    .map(id => state.items?.find(i => i.id === id))
                    .filter((i): i is NonNullable<typeof i> => !!i);
                }
                return [];
              })()}
              activeItemMode={maximizedItemId ? 'maximized' : (panels.length > 0 ? 'split' : null)}
              onCloseActiveItem={(id) => {
                operations.flushPendingChanges(id);
                closePanel(id);
                if (maximizedItemId === id) setMaximizedItemId(null);
              }}
              onMinimizeActiveItem={() => setMaximizedItemId(null)}
              onMaximizeActiveItem={(id) => setMaximizedItemId(id)}
              onUpdateActiveItem={operations.updateItem}
            />
          ) : null
        }
        isDesktop={isDesktop}
        isChatExpanded={isChatExpanded}
        isChatMaximized={isChatMaximized}
        setIsChatExpanded={setIsChatExpanded}
        setIsChatMaximized={setIsChatMaximized}
        onWorkspaceSizeChange={setWorkspacePanelSize}
        onSingleSelect={handleCreateInstantNote}
        onMultiSelect={handleCreateCardFromSelections}
        panels={panels}
        workspaceSection={
          <WorkspaceSection
            loadingWorkspaces={loadingCurrentWorkspace}
            isLoadingWorkspace={isLoadingWorkspace}
            currentWorkspaceId={currentWorkspaceId}
            currentSlug={currentSlug}
            state={state}
            showJsonView={showJsonView}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            isSaving={isSaving}
            lastSavedAt={lastSavedAt}
            hasUnsavedChanges={hasUnsavedChanges}
            onManualSave={manualSave}
            addItem={operations.createItem}
            updateItem={operations.updateItem}
            deleteItem={operations.deleteItem}
            updateAllItems={operations.updateAllItems}

            getStatePreviewJSON={getStatePreviewJSON}
            isChatMaximized={isChatMaximized}
            columns={layout.columns}
            isDesktop={isDesktop}
            isChatExpanded={isChatExpanded}
            setIsChatExpanded={setIsChatExpanded}
            isItemPanelOpen={panels.length > 0}
            setOpenModalItemId={setOpenModalItemId}
            onShowHistory={handleShowHistory}
            titleInputRef={titleInputRef as React.RefObject<HTMLInputElement>}
            operations={operations}
            scrollAreaRef={scrollAreaRef as React.RefObject<HTMLDivElement>}
            workspaceTitle={currentWorkspaceTitle}
            workspaceIcon={currentWorkspaceIcon}
            workspaceColor={currentWorkspaceColor}
          />
        }
        modalManager={modalManagerElement}
        maximizedItemId={maximizedItemId}
      />

      <WorkspaceSettingsModal
        workspace={currentWorkspace}
        open={showWorkspaceSettings}
        onOpenChange={setShowWorkspaceSettings}
      />
      <ShareWorkspaceDialog
        workspace={currentWorkspace}
        open={showWorkspaceShare}
        onOpenChange={setShowWorkspaceShare}
        showHistoryTab={true}
        events={eventLog?.events || []}
        currentVersion={version}
        onRevertToVersion={revertToVersion}
      />
    </PdfEngineWrapper>
  );
}


// Main page component
// Main page component
// Main page component (wrapper)
export function DashboardPage() {
  return (
    <InviteGuard>
      <DashboardView />
    </InviteGuard>
  );
}

// Inner component with all the dashboard hooks
// Only rendered when InviteGuard allows (authenticated + invite processed)
function DashboardView() {
  // Get workspace context - currentWorkspace is loaded directly by slug (fast path)
  const {
    currentSlug,
    currentWorkspace,
    loadingCurrentWorkspace,
    loadingWorkspaces,
    markWorkspaceOpened,
  } = useWorkspaceContext();

  const currentWorkspaceId = currentWorkspace?.id || null;

  // Sync workspace ID to store
  const setCurrentWorkspaceId = useWorkspaceStore((state) => state.setCurrentWorkspaceId);
  useEffect(() => {
    setCurrentWorkspaceId(currentWorkspaceId);
  }, [currentWorkspaceId, setCurrentWorkspaceId]);

  // Track workspace opens for sorting
  const lastTrackedWorkspaceIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentWorkspaceId) return;

    // Only track if this is a different workspace than last time
    if (lastTrackedWorkspaceIdRef.current === currentWorkspaceId) return;

    // Track the open via context (optimistically updates cache)
    markWorkspaceOpened(currentWorkspaceId);

    lastTrackedWorkspaceIdRef.current = currentWorkspaceId;
  }, [currentWorkspaceId, markWorkspaceOpened]);

  // Reset search query when workspace changes
  const setSearchQuery = useUIStore((state) => state.setSearchQuery);
  useEffect(() => {
    setSearchQuery('');
  }, [currentWorkspaceId, setSearchQuery]);

  // Reset active folder when workspace changes
  const clearActiveFolder = useUIStore((state) => state.clearActiveFolder);
  useEffect(() => {
    clearActiveFolder();
  }, [currentWorkspaceId, clearActiveFolder]);

  // Clear playing YouTube videos when workspace changes
  const clearPlayingYouTubeCards = useUIStore((state) => state.clearPlayingYouTubeCards);
  useEffect(() => {
    clearPlayingYouTubeCards();
  }, [currentWorkspaceId, clearPlayingYouTubeCards]);

  return (
    <RealtimeProvider workspaceId={currentWorkspaceId}>
      <DashboardContent
        currentWorkspace={currentWorkspace}
        loadingWorkspaces={loadingWorkspaces}
        loadingCurrentWorkspace={loadingCurrentWorkspace}
      />
    </RealtimeProvider>
  );
}

export function DashboardShell() {
  return (
    <>
      <MobileWarning />
      <AnonymousSessionHandler>
        <WorkspaceProvider>
          {/* <JoyrideProvider> */}
          <SidebarCoordinator>
            <DashboardPage />
          </SidebarCoordinator>
          {/* </JoyrideProvider> */}
        </WorkspaceProvider>
      </AnonymousSessionHandler>
    </>
  );
}

export default function Page() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/workspace");
  }, [router]);

  return null;
}
