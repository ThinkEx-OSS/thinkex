"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { usePostHog } from 'posthog-js/react';
import { SEO } from "@/components/seo/SEO";
import type { AgentState } from "@/lib/workspace-state/types";
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
import { ModalManager } from "@/components/modals/ModalManager";
import { AnonymousSignInPrompt } from "@/components/modals/AnonymousSignInPrompt";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ItemPanelContent } from "@/components/workspace-canvas/ItemPanelContent";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { MobileWarning } from "@/components/ui/MobileWarning";
import { AuthPageBackground } from "@/components/auth/AuthPageBackground";
// import { OnboardingVideoDialog } from "@/components/onboarding/OnboardingVideoDialog";
// import { useOnboardingStatus } from "@/hooks/user/use-onboarding-status";
import { PdfEngineWrapper } from "@/components/pdf/PdfEngineWrapper";
// Main dashboard content component
function DashboardContent({
  currentWorkspaceId,
  loadingWorkspaces,
  currentWorkspaceTitle,
  currentWorkspaceIcon,
  currentWorkspaceColor,
}: {
  currentWorkspaceId: string | null;
  loadingWorkspaces: boolean;
  currentWorkspaceTitle?: string;
  currentWorkspaceIcon?: string | null;
  currentWorkspaceColor?: string | null;
}) {
  const posthog = usePostHog();
  const { data: session } = useSession();

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

  // Workspace operations (emits events with optimistic updates)
  const operations = useWorkspaceOperations(currentWorkspaceId, state);

  // Version control (history only)
  const { revertToVersion } = useWorkspaceHistory(currentWorkspaceId);
  const { data: eventLog } = useWorkspaceEvents(currentWorkspaceId);

  // Track sign-in prompt for anonymous users
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);

  // Show sign-in prompt after 6 events for anonymous users
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

    // Show prompt after 6 events
    if (eventCount >= 6) {
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
  }, [updateLastSaved, currentWorkspaceId]);

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
  const panels = useMemo(() => {
    // If ANY item is maximized, we hide the panels (ModalManager takes over)
    if (maximizedItemId || !state.items) return [];

    const validItems = openPanelIds
      .map(id => state.items.find(i => i.id === id))
      .filter((item): item is NonNullable<typeof item> =>
        item != null && (item.type === 'note' || item.type === 'pdf')
      );

    return validItems.map((item, index) => (
      <ItemPanelContent
        key={item.id}
        item={item}
        onClose={() => {
          operations.flushPendingChanges(item.id);
          closePanel(item.id);
        }}
        onMaximize={() => setMaximizedItemId(item.id)}
        isMaximized={false}
        onUpdateItem={(updates) => operations.updateItem(item.id, updates)}
        onUpdateItemData={(updater) => operations.updateItemData(item.id, updater)}
        isRightmostPanel={index === validItems.length - 1}
        isLeftPanel={validItems.length === 2 && index === 0}
      />
    ));
  }, [openPanelIds, maximizedItemId, state.items, operations, closePanel, setMaximizedItemId]);

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
            loadingWorkspaces={loadingWorkspaces}
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
            onShowHistory={() => {
              posthog.capture('version-history-viewed', { workspace_id: currentWorkspaceId });
              setShowVersionHistory(true);
            }}
            titleInputRef={titleInputRef as React.RefObject<HTMLInputElement>}
            operations={operations}
            scrollAreaRef={scrollAreaRef as React.RefObject<HTMLDivElement>}
            workspaceTitle={currentWorkspaceTitle}
            workspaceIcon={currentWorkspaceIcon}
            workspaceColor={currentWorkspaceColor}
            modalManager={modalManagerElement}
          />
        }
      />
    </PdfEngineWrapper>
  );
}


// Main page component
// Main page component
function DashboardPage() {
  const router = useRouter();
  // Get workspace context
  const {
    currentSlug,
    workspaces,
    loadingWorkspaces,
  } = useWorkspaceContext();

  // Derive workspace ID directly from slug and sync to store
  const currentWorkspaceId = useMemo(() => {
    if (!currentSlug) return null;
    const workspace = workspaces.find(w => w.slug === currentSlug);
    return workspace?.id || null;
  }, [currentSlug, workspaces]);

  // Get current workspace title for JSON download filename
  const currentWorkspaceTitle = useMemo(() => {
    if (!currentSlug) return undefined;
    const workspace = workspaces.find(w => w.slug === currentSlug);
    return workspace?.name || undefined;
  }, [currentSlug, workspaces]);

  // Get current workspace icon for header breadcrumbs
  const currentWorkspaceIcon = useMemo(() => {
    if (!currentSlug) return null;
    const workspace = workspaces.find(w => w.slug === currentSlug);
    return workspace?.icon || null;
  }, [currentSlug, workspaces]);

  // Get current workspace color for header breadcrumbs
  const currentWorkspaceColor = useMemo(() => {
    if (!currentSlug) return null;
    const workspace = workspaces.find(w => w.slug === currentSlug);
    return workspace?.color || null;
  }, [currentSlug, workspaces]);

  // Sync workspace ID to store
  const setCurrentWorkspaceId = useWorkspaceStore((state) => state.setCurrentWorkspaceId);
  useEffect(() => {
    setCurrentWorkspaceId(currentWorkspaceId);
  }, [currentWorkspaceId, setCurrentWorkspaceId]);

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

  return (
    <DashboardContent
      currentWorkspaceId={currentWorkspaceId}
      loadingWorkspaces={loadingWorkspaces}
      currentWorkspaceTitle={currentWorkspaceTitle}
      currentWorkspaceIcon={currentWorkspaceIcon}
      currentWorkspaceColor={currentWorkspaceColor}
    />
  );
}

// Wrapper for sidebar provider
function SidebarCoordinator({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider defaultOpen={true}>
      {children}
    </SidebarProvider>
  );
}

// Component to handle anonymous users - redirect to guest-setup if no session
function AnonymousSessionHandler({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    // If no session and not loading, redirect to guest-setup
    if (!isPending && !session) {
      router.replace("/guest-setup");
      return;
    }
  }, [session, isPending, router]);

  // Show loading while checking session
  if (isPending) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center p-4 md:p-6 overflow-hidden">
        {/* Background with grid and cards - same as auth page */}
        <AuthPageBackground />

        {/* Content */}
        <div className="relative z-10 text-center space-y-6 max-w-md">
          <div className="flex justify-center">
            <Loader2 className="w-10 h-10 animate-spin text-white" />
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">
            Setting up your workspace...
          </h1>
          <p className="text-sm text-white/70">
            This will only take a moment
          </p>
        </div>
      </main>
    );
  }

  // Don't render dashboard if no session (will redirect)
  if (!session) {
    return null;
  }

  return <>{children}</>;
}

export default function Page() {
  return (
    <>
      <SEO
        title="Dashboard"
        description="Manage your workspaces, create new projects, and organize knowledge effortlessly in your ThinkEx dashboard."
        keywords="dashboard, workspace management, AI workspace, productivity tools"
        url="https://thinkex.app/dashboard"
        canonical="https://thinkex.app/dashboard"
      />
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
