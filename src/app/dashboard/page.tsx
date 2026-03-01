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
import { ModalManager } from "@/components/modals/ModalManager";
import { AnonymousSignInPrompt } from "@/components/modals/AnonymousSignInPrompt";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { SplitViewLayout } from "@/components/layout/SplitViewLayout";
import { ItemPanelContent } from "@/components/workspace-canvas/ItemPanelContent";
import WorkspaceHeader from "@/components/workspace-canvas/WorkspaceHeader";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { MobileWarning } from "@/components/ui/MobileWarning";
import { AnonymousSessionHandler, SidebarCoordinator } from "@/components/layout/SessionHandler";
// import { OnboardingVideoDialog } from "@/components/onboarding/OnboardingVideoDialog";
// import { useOnboardingStatus } from "@/hooks/user/use-onboarding-status";
import { PdfEngineWrapper } from "@/components/pdf/PdfEngineWrapper";
import WorkspaceSettingsModal from "@/components/workspace/WorkspaceSettingsModal";
import ShareWorkspaceDialog from "@/components/workspace/ShareWorkspaceDialog";
import { VersionHistoryDialog } from "@/components/workspace/VersionHistoryModal";
import { WorkspaceInstructionModal } from "@/components/onboarding/WorkspaceInstructionModal";
import { RealtimeProvider } from "@/contexts/RealtimeContext";
import { toast } from "sonner";
import { useWorkspaceInstructionModal } from "@/hooks/workspace/use-workspace-instruction-modal";

import { InviteGuard } from "@/components/workspace/InviteGuard";
import { useReactiveNavigation } from "@/hooks/ui/use-reactive-navigation";
import { filterPasswordProtectedPdfs } from "@/lib/uploads/pdf-validation";
import { uploadPdfToStorage } from "@/lib/uploads/pdf-upload-with-ocr";
import { emitPasswordProtectedPdf } from "@/components/modals/PasswordProtectedPdfDialog";
import { useFolderUrl } from "@/hooks/ui/use-folder-url";
import { useAudioRecordingStore } from "@/lib/stores/audio-recording-store";

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
  const router = useRouter();
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
    workspaces: allWorkspaces,
    loadingWorkspaces: loadingAllWorkspaces,
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

  // Open audio recorder when landing from home Record flow (store flag set before navigate).
  const openAudioDialog = useAudioRecordingStore((s) => s.openDialog);
  const closeAudioDialog = useAudioRecordingStore((s) => s.closeDialog);
  const shouldOpenOnWorkspaceLoad = useAudioRecordingStore((s) => s.shouldOpenOnWorkspaceLoad);
  const setShouldOpenOnWorkspaceLoad = useAudioRecordingStore((s) => s.setShouldOpenOnWorkspaceLoad);
  const prevWorkspaceIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!currentWorkspaceId || isLoadingWorkspace) return;

    if (shouldOpenOnWorkspaceLoad) {
      setShouldOpenOnWorkspaceLoad(false);
      openAudioDialog();
    }

    // Close audio dialog when switching to a different workspace (dialog state is global)
    if (prevWorkspaceIdRef.current !== null && prevWorkspaceIdRef.current !== currentWorkspaceId) {
      closeAudioDialog();
    }
    prevWorkspaceIdRef.current = currentWorkspaceId;
  }, [currentWorkspaceId, isLoadingWorkspace, shouldOpenOnWorkspaceLoad, openAudioDialog, closeAudioDialog, setShouldOpenOnWorkspaceLoad]);

  // Workspace operations (emits events with optimistic updates)
  const operations = useWorkspaceOperations(currentWorkspaceId, state);

  // Version control (history only)
  const { revertToVersion: revertToVersionRaw } = useWorkspaceHistory(currentWorkspaceId);
  const { data: eventLog } = useWorkspaceEvents(currentWorkspaceId);

  // Track sign-in prompt for anonymous users
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);

  // Workspace settings/share modals (lifted so header can open them)
  const [showWorkspaceSettings, setShowWorkspaceSettings] = useState(false);
  const [showWorkspaceShare, setShowWorkspaceShare] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [assistantThreadRunning, setAssistantThreadRunning] = useState<boolean | null>(null);

  const instructionModal = useWorkspaceInstructionModal({
    workspaceId: currentWorkspaceId,
    assistantIsRunning: assistantThreadRunning,
    analytics: posthog ?? null,
  });

  // Show sign-in prompt after 25 events for anonymous users
  useEffect(() => {
    // Only show for anonymous users
    if (!session?.user?.isAnonymous) {
      return;
    }

    // Wait for events to load
    if (!eventLog || isLoadingWorkspace || !currentWorkspaceId) {
      return;
    }

    const eventCount = eventLog.events?.length || 0;

    // Show prompt after 15 events
    if (eventCount >= 15) {
      setShowSignInPrompt(true);
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
  const showCreateWorkspaceModal = useUIStore((state) => state.showCreateWorkspaceModal);
  const setShowJsonView = useUIStore((state) => state.setShowJsonView);
  const setIsChatExpanded = useUIStore((state) => state.setIsChatExpanded);
  const setSearchQuery = useUIStore((state) => state.setSearchQuery);
  const setIsChatMaximized = useUIStore((state) => state.setIsChatMaximized);
  const setOpenModalItemId = useUIStore((state) => state.setOpenModalItemId);
  const setShowCreateWorkspaceModal = useUIStore((state) => state.setShowCreateWorkspaceModal);

  // Version revert: close ShareWorkspaceDialog on success (history is shown there)
  const revertToVersion = useCallback(
    async (targetVersion: number) => {
      await revertToVersionRaw(targetVersion);
      setShowWorkspaceShare(false);
    },
    [revertToVersionRaw, setShowWorkspaceShare]
  );
  const setWorkspacePanelSize = useUIStore((state) => state.setWorkspacePanelSize);
  const toggleChatExpanded = useUIStore((state) => state.toggleChatExpanded);
  const toggleChatMaximized = useUIStore((state) => state.toggleChatMaximized);

  // View mode from store
  const viewMode = useUIStore((state) => state.viewMode);

  // Panel state - using new array-based system
  const openPanelIds = useUIStore((state) => state.openPanelIds);
  const closePanel = useUIStore((state) => state.closePanel);
  const setActiveFolderId = useUIStore((state) => state.setActiveFolderId);
  const navigateToRoot = useUIStore((state) => state.navigateToRoot);
  const navigateToFolder = useUIStore((state) => state.navigateToFolder);
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
    const { globalTitle, items } = snapshot;
    return {
      globalTitle: globalTitle ?? initialState.globalTitle,
      items: items ?? initialState.items,
    };
  };


  // CopilotKit actions removed - now using Assistant-UI directly

  // Define Modal Manager Element to reuse
  const modalManagerElement = (
    <ModalManager
      items={state.items}
      onUpdateItem={operations.updateItem}
      onUpdateItemData={operations.updateItemData}
      onFlushPendingChanges={operations.flushPendingChanges}
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

      // Reject password-protected PDFs
      const { valid: unprotectedFiles, rejected: protectedNames } = await filterPasswordProtectedPdfs(files);
      if (protectedNames.length > 0) {
        emitPasswordProtectedPdf(protectedNames);
      }
      if (unprotectedFiles.length === 0) {
        return;
      }

      const uploadToastId = toast.loading(
        `Uploading ${unprotectedFiles.length} PDF${unprotectedFiles.length > 1 ? "s" : ""}...`,
        { style: { color: "#fff" } }
      );

      const uploadResults = await Promise.all(
        unprotectedFiles.map(async (file) => {
          try {
            const { url, filename, fileSize } = await uploadPdfToStorage(file);
            return { file, fileUrl: url, filename, fileSize };
          } catch (err) {
            toast.error(`Failed to upload ${file.name}: ${err instanceof Error ? err.message : "Unknown error"}`);
            return null;
          }
        })
      );

      toast.dismiss(uploadToastId);

      const validUploads = uploadResults.filter((r): r is NonNullable<typeof r> => r !== null);
      if (validUploads.length === 0) return;

      const pdfCardDefinitions = validUploads.map(({ file, fileUrl, filename, fileSize }) => ({
        type: "pdf" as const,
        name: file.name.replace(/\.pdf$/i, ""),
        initialData: {
          fileUrl,
          filename,
          fileSize,
          ocrStatus: "processing" as const,
          ocrPages: [],
        } as Partial<PdfData>,
      }));

      const createdIds = operations.createItems(pdfCardDefinitions);
      handleCreatedItems(createdIds);

      // Run OCR via workflow; poller dispatches pdf-processing-complete
      validUploads.forEach((r, i) => {
        const itemId = createdIds[i];
        if (!itemId) return;
        fetch("/api/pdf/ocr/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileUrl: r.fileUrl,
            itemId,
            workspaceId: currentWorkspaceId,
          }),
        })
          .then(async (res) => {
            if (!res.ok) {
              const err = await res.json().catch(() => ({ error: res.statusText }));
              throw new Error((err as { error?: string }).error ?? `OCR start failed: ${res.status}`);
            }
            return res.json();
          })
          .then((data) => {
            if (data.runId && data.itemId) {
              import("@/lib/pdf/poll-pdf-ocr")
                .then(({ pollPdfOcr }) => pollPdfOcr(data.runId, data.itemId))
                .catch((err) => {
                  window.dispatchEvent(
                    new CustomEvent("pdf-processing-complete", {
                      detail: {
                        itemId,
                        textContent: "",
                        ocrPages: [],
                        ocrStatus: "failed" as const,
                        ocrError: err instanceof Error ? err.message : "Failed to start OCR polling",
                      },
                    })
                  );
                });
            } else {
              window.dispatchEvent(
                new CustomEvent("pdf-processing-complete", {
                  detail: {
                    itemId,
                    textContent: "",
                    ocrPages: [],
                    ocrStatus: "failed" as const,
                    ocrError: data.error || "Failed to start OCR",
                  },
                })
              );
            }
          })
          .catch((err) => {
            window.dispatchEvent(
              new CustomEvent("pdf-processing-complete", {
                detail: {
                  itemId,
                  textContent: "",
                  ocrPages: [],
                  ocrStatus: "failed" as const,
                  ocrError: err.message || "Failed to start OCR",
                },
              })
            );
          });
      });
    },
    [operations, currentWorkspaceId, handleCreatedItems]
  );

  const handleShowHistory = useCallback(() => {
    posthog.capture("version-history-viewed", { workspace_id: currentWorkspaceId });
    setShowVersionHistory(true);
  }, [posthog, currentWorkspaceId]);

  // Build the split view layout element (for panel+panel mode only)
  const splitViewContent = useMemo(() => {
    if (viewMode !== 'panel+panel') return undefined;
    return (
      <SplitViewLayout
        items={state.items}
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
            columns={1}
            isDesktop={isDesktop}
            isChatExpanded={isChatExpanded}
            setIsChatExpanded={setIsChatExpanded}
            isItemPanelOpen={true}
            setOpenModalItemId={setOpenModalItemId}
            onShowHistory={handleShowHistory}
            titleInputRef={titleInputRef as React.RefObject<HTMLInputElement>}
            operations={operations}
            scrollAreaRef={scrollAreaRef as React.RefObject<HTMLDivElement>}
            workspaceTitle={currentWorkspaceTitle}
            workspaceIcon={currentWorkspaceIcon}
            workspaceColor={currentWorkspaceColor}
            onRenameFolder={(folderId, newName) => {
              operations.updateItem(folderId, { name: newName });
            }}
            onOpenSettings={() => setShowWorkspaceSettings(true)}
            onOpenShare={() => setShowWorkspaceShare(true)}
            activeItems={[]} // In split view, workspace header doesn't control active item
            activeItemMode={null}
          />
        }
        onUpdateItem={operations.updateItem}
        onUpdateItemData={operations.updateItemData}
        onFlushPendingChanges={operations.flushPendingChanges}
      />
    );
  }, [viewMode, state.items, loadingCurrentWorkspace, isLoadingWorkspace, currentWorkspaceId, currentSlug, state, showJsonView, searchQuery, isSaving, lastSavedAt, hasUnsavedChanges, isChatMaximized, isDesktop, isChatExpanded, currentWorkspaceTitle, currentWorkspaceIcon, currentWorkspaceColor, operations, manualSave, setSearchQuery, setIsChatExpanded, setOpenModalItemId, handleShowHistory, titleInputRef, scrollAreaRef, getStatePreviewJSON]);

  // Build the single panel content (for workspace+panel mode)
  const panelContent = useMemo(() => {
    if (viewMode !== 'workspace+panel') return undefined;
    const panelItem = openPanelIds
      .map(id => state.items.find(i => i.id === id))
      .find((i): i is NonNullable<typeof i> => !!i);
    if (!panelItem) return undefined;
    return (
      <ItemPanelContent
        key={panelItem.id}
        item={panelItem}
        onClose={() => {
          operations.flushPendingChanges(panelItem.id);
          closePanel(panelItem.id);
        }}
        onMaximize={() => setMaximizedItemId(panelItem.id)}
        isMaximized={false}
        onUpdateItem={(updates) => operations.updateItem(panelItem.id, updates)}
        onUpdateItemData={(updater) => operations.updateItemData(panelItem.id, updater)}
        isRightmostPanel={true}
        isLeftPanel={false}
      />
    );
  }, [viewMode, openPanelIds, state.items, operations, closePanel, setMaximizedItemId]);


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
        onAssistantThreadRunningChange={setAssistantThreadRunning}
        splitViewContent={splitViewContent}
        panelContent={panelContent}
        workspaceHeader={
          !showJsonView && !isChatMaximized && currentWorkspaceId && !isLoadingWorkspace ? (
            <WorkspaceHeader
              titleInputRef={titleInputRef as React.RefObject<HTMLInputElement>}
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
              onShowHistory={handleShowHistory}
              isItemPanelOpen={viewMode === 'workspace+panel' || viewMode === 'panel+panel'}
              activeItems={(() => {
                // Collect active items from panels + maximized
                if (maximizedItemId) {
                  const item = state.items?.find(i => i.id === maximizedItemId);
                  return item ? [item] : [];
                }
                if (viewMode === 'workspace+panel' || viewMode === 'panel+panel') {
                  return openPanelIds
                    .map(id => state.items?.find(i => i.id === id))
                    .filter((i): i is NonNullable<typeof i> => !!i);
                }
                return [];
              })()}
              activeItemMode={maximizedItemId ? 'maximized' : null}
              onCloseActiveItem={(id) => {
                operations.flushPendingChanges(id);
                closePanel(id);
                if (maximizedItemId === id) setMaximizedItemId(null);
              }}
              onNavigateToRoot={() => {
                openPanelIds.forEach((id) => operations.flushPendingChanges(id));
                if (maximizedItemId) {
                  navigateToRoot();
                } else {
                  setActiveFolderId(null);
                }
              }}
              onNavigateToFolder={(folderId) => {
                openPanelIds.forEach((id) => operations.flushPendingChanges(id));
                if (maximizedItemId) {
                  navigateToFolder(folderId);
                } else {
                  setActiveFolderId(folderId);
                }
              }}
              onMinimizeActiveItem={() => setMaximizedItemId(null)}
              onMaximizeActiveItem={(id) => setMaximizedItemId(id)}
              onUpdateActiveItem={operations.updateItem}
            />
          ) : undefined
        }
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
            isItemPanelOpen={viewMode === 'workspace+panel' || viewMode === 'panel+panel'}
            setOpenModalItemId={setOpenModalItemId}
            onShowHistory={handleShowHistory}
            titleInputRef={titleInputRef as React.RefObject<HTMLInputElement>}
            operations={operations}
            scrollAreaRef={scrollAreaRef as React.RefObject<HTMLDivElement>}
            workspaceTitle={currentWorkspaceTitle}
            workspaceIcon={currentWorkspaceIcon}
            workspaceColor={currentWorkspaceColor}
            onRenameFolder={(folderId, newName) => {
              operations.updateItem(folderId, { name: newName });
            }}
            onOpenSettings={() => setShowWorkspaceSettings(true)}
            onOpenShare={() => setShowWorkspaceShare(true)}
            activeItems={(() => {
              if (maximizedItemId) {
                const item = state.items?.find(i => i.id === maximizedItemId);
                return item ? [item] : [];
              }
              return [];
            })()}
            activeItemMode={maximizedItemId ? 'maximized' : null}
            onCloseActiveItem={(id) => {
              operations.flushPendingChanges(id);
              closePanel(id);
              if (maximizedItemId === id) setMaximizedItemId(null);
            }}
            onMinimizeActiveItem={() => setMaximizedItemId(null)}
            onMaximizeActiveItem={(id) => setMaximizedItemId(id)}
            onUpdateActiveItem={operations.updateItem}
            modalManager={modalManagerElement}
          />
        }
      />
      <WorkspaceInstructionModal
        mode={instructionModal.mode ?? "first-open"}
        open={instructionModal.open}
        canClose={instructionModal.canClose}
        showFallback={instructionModal.showFallback}
        isGenerating={instructionModal.isGenerating}
        onRequestClose={instructionModal.close}
        onFallbackContinue={instructionModal.continueFromFallback}
        onUserInteracted={instructionModal.markInteracted}
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
      />
      <VersionHistoryDialog
        open={showVersionHistory}
        onOpenChange={setShowVersionHistory}
        events={eventLog?.events || []}
        currentVersion={version}
        onRevertToVersion={revertToVersion}
        items={currentWorkspace?.state?.items || []}
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

  // Sync active folder with URL query param (?folder=<id>)
  // Reset folder/panels when workspace changes
  // and enables browser-native back/forward for folder navigation
  useFolderUrl();

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
