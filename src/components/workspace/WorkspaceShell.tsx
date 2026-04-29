"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceWithState } from "@/lib/workspace-state/types";
import { useKeyboardShortcuts } from "@/hooks/ui/use-keyboard-shortcuts";
import useMediaQuery from "@/hooks/ui/use-media-query";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { useWorkspaceOperations } from "@/hooks/workspace/use-workspace-operations";
import {
  WorkspaceProvider,
  useWorkspaceContext,
} from "@/contexts/WorkspaceContext";
// import { JoyrideProvider } from "@/contexts/JoyrideContext";
import { selectWorkspaceOpenMode, useUIStore } from "@/lib/stores/ui-store";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { useSession } from "@/lib/auth-client";
import { WorkspaceSection } from "@/components/workspace-canvas/WorkspaceSection";
import { OpenWorkspaceItemView } from "@/components/workspace-canvas/OpenWorkspaceItemView";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import WorkspaceHeader from "@/components/workspace-canvas/WorkspaceHeader";
import { WorkspaceSearchDialog } from "@/components/workspace-canvas/WorkspaceSearchDialog";
import { useSidebar } from "@/components/ui/sidebar";
import { MobileWarning } from "@/components/ui/MobileWarning";
import {
  AnonymousSessionHandler,
  SidebarCoordinator,
} from "@/components/layout/SessionHandler";
// import { OnboardingVideoDialog } from "@/components/onboarding/OnboardingVideoDialog";
// import { useOnboardingStatus } from "@/hooks/user/use-onboarding-status";
import { PdfEngineWrapper } from "@/components/pdf/PdfEngineWrapper";
import WorkspaceSettingsModal from "@/components/workspace/WorkspaceSettingsModal";
import ShareWorkspaceDialog from "@/components/workspace/ShareWorkspaceDialog";
import { RealtimeProvider } from "@/contexts/RealtimeContext";
import { ZeroProvider } from "@/lib/zero/provider";
import { useConnectionState } from "@rocicorp/zero/react";
import { toast } from "sonner";
import { InviteGuard } from "@/components/workspace/InviteGuard";
import { useReactiveNavigation } from "@/hooks/ui/use-reactive-navigation";
import { useFolderUrl } from "@/hooks/ui/use-folder-url";
import { useAudioRecordingStore } from "@/lib/stores/audio-recording-store";
import { buildWorkspaceItemDefinitionsFromAssets } from "@/lib/uploads/uploaded-asset";
import {
  prepareWorkspaceUploadSelection,
  uploadSelectedFiles,
} from "@/lib/uploads/upload-selection";
import { startAssetProcessing } from "@/lib/uploads/start-asset-processing";
import { emitPasswordProtectedPdf } from "@/components/modals/PasswordProtectedPdfDialog";
import {
  getDocumentUploadFailureMessage,
  getDocumentUploadLoadingMessage,
  getDocumentUploadPartialMessage,
  getDocumentUploadSuccessMessage,
} from "@/lib/uploads/upload-feedback";

// Main workspace content component
interface WorkspaceContentProps {
  currentWorkspace: WorkspaceWithState | null;
  loadingCurrentWorkspace: boolean;
}

function WorkspaceContent({
  currentWorkspace,
  loadingCurrentWorkspace,
}: WorkspaceContentProps) {
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
  const { currentSlug, switchWorkspace } = useWorkspaceContext();
  const zeroConnectionState = useConnectionState();
  const isSaving = zeroConnectionState.name === "connecting";

  const { state, isLoading: isLoadingWorkspace } =
    useWorkspaceState(currentWorkspaceId);

  // Open audio recorder when landing from home Record flow (store flag set before navigate).
  const openAudioDialog = useAudioRecordingStore((s) => s.openDialog);
  const closeAudioDialog = useAudioRecordingStore((s) => s.closeDialog);
  const shouldOpenOnWorkspaceLoad = useAudioRecordingStore(
    (s) => s.shouldOpenOnWorkspaceLoad,
  );
  const setShouldOpenOnWorkspaceLoad = useAudioRecordingStore(
    (s) => s.setShouldOpenOnWorkspaceLoad,
  );
  const prevWorkspaceIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!currentWorkspaceId || isLoadingWorkspace) return;

    if (shouldOpenOnWorkspaceLoad) {
      setShouldOpenOnWorkspaceLoad(false);
      openAudioDialog();
    }

    // Close audio dialog when switching to a different workspace (dialog state is global)
    if (
      prevWorkspaceIdRef.current !== null &&
      prevWorkspaceIdRef.current !== currentWorkspaceId
    ) {
      closeAudioDialog();
    }
    prevWorkspaceIdRef.current = currentWorkspaceId;
  }, [
    currentWorkspaceId,
    isLoadingWorkspace,
    shouldOpenOnWorkspaceLoad,
    openAudioDialog,
    closeAudioDialog,
    setShouldOpenOnWorkspaceLoad,
  ]);

  // Workspace operations
  const operations = useWorkspaceOperations(currentWorkspaceId, state);

  // Workspace settings/share modals (lifted so header can open them)
  const [showWorkspaceSettings, setShowWorkspaceSettings] = useState(false);
  const [showWorkspaceShare, setShowWorkspaceShare] = useState(false);

  // Get sidebar state and controls
  const { toggleSidebar } = useSidebar();

  // UI State from Zustand stores - using individual selectors to prevent unnecessary re-renders
  // NOTE: Each selector only triggers a re-render when that specific value changes
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const isChatExpanded = useUIStore((state) => state.isChatExpanded);
  const isChatMaximized = useUIStore((state) => state.isChatMaximized);
  const showCreateWorkspaceModal = useUIStore(
    (state) => state.showCreateWorkspaceModal,
  );
  const setIsChatExpanded = useUIStore((state) => state.setIsChatExpanded);
  const setIsChatMaximized = useUIStore((state) => state.setIsChatMaximized);
  const openWorkspaceItem = useUIStore((state) => state.openWorkspaceItem);
  const setShowCreateWorkspaceModal = useUIStore(
    (state) => state.setShowCreateWorkspaceModal,
  );

  const toggleChatExpanded = useUIStore((state) => state.toggleChatExpanded);
  const toggleChatMaximized = useUIStore((state) => state.toggleChatMaximized);

  const primaryOpenItemId = useUIStore((state) => state.openItems.primary);
  const workspaceOpenMode = useUIStore(selectWorkspaceOpenMode);
  const closeWorkspaceItem = useUIStore((state) => state.closeWorkspaceItem);
  const setActiveFolderId = useUIStore((state) => state.setActiveFolderId);
  const navigateToRoot = useUIStore((state) => state.navigateToRoot);
  const navigateToFolder = useUIStore((state) => state.navigateToFolder);

  // Refs and custom hooks
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  // Search dialog state for Cmd+K command palette
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);

  // Keyboard shortcuts
  useKeyboardShortcuts(toggleChatExpanded, {
    onToggleSidebar: toggleSidebar,
    onToggleChatMaximize: toggleChatMaximized,
    onFocusSearch: () => {
      if (currentWorkspaceId && !isLoadingWorkspace) {
        setSearchDialogOpen(true);
      }
    },
  });

  // CopilotKit actions removed - now using Assistant-UI directly

  const openWorkspaceItemView = (
    <OpenWorkspaceItemView
      items={state}
      onUpdateItem={operations.updateItem}
      onUpdateItemData={operations.updateItemData}
      onFlushPendingChanges={operations.flushPendingChanges}
    />
  );

  // Handle reactive navigation for new items
  const { handleCreatedItems } = useReactiveNavigation(state);

  const handleWorkspacePdfUpload = useCallback(
    async (files: File[]) => {
      if (!currentWorkspaceId) {
        throw new Error("Workspace not available");
      }

      const { acceptedFiles: filesToUpload, protectedPdfNames } =
        await prepareWorkspaceUploadSelection(files);
      if (protectedPdfNames.length > 0) {
        emitPasswordProtectedPdf(protectedPdfNames);
      }
      if (filesToUpload.length === 0) {
        return;
      }

      const uploadToastId = toast.loading(
        getDocumentUploadLoadingMessage(filesToUpload.length),
      );
      const { uploads, failedFiles } = await uploadSelectedFiles(filesToUpload);

      toast.dismiss(uploadToastId);

      if (uploads.length === 0) {
        if (failedFiles.length > 0) {
          toast.error(getDocumentUploadFailureMessage(failedFiles.length));
        }
        return;
      }

      const pdfCardDefinitions =
        buildWorkspaceItemDefinitionsFromAssets(uploads);

      const createdIds = operations.createItems(pdfCardDefinitions, {
        showSuccessToast: false,
      });
      handleCreatedItems(createdIds);

      void startAssetProcessing({
        workspaceId: currentWorkspaceId,
        assets: uploads,
        itemIds: createdIds,
        onOcrError: (error) => {
          console.error(
            "[WORKSPACE_PROCESSING] Failed to start processing:",
            error,
          );
        },
      });

      if (uploads.length > 0 && failedFiles.length === 0) {
        toast.success(getDocumentUploadSuccessMessage(uploads.length));
      } else if (uploads.length > 0) {
        toast.warning(
          getDocumentUploadPartialMessage(uploads.length, failedFiles.length),
        );
      }
    },
    [operations, currentWorkspaceId, handleCreatedItems],
  );

  return (
    <PdfEngineWrapper>
      {/* <OnboardingVideoDialog
        open={showOnboardingDialog}
        onOpenChange={setShowOnboardingDialog}
      /> */}
      <WorkspaceLayout
        currentWorkspaceId={currentWorkspaceId}
        onWorkspaceSwitch={switchWorkspace}
        showCreateModal={showCreateWorkspaceModal}
        setShowCreateModal={setShowCreateWorkspaceModal}
        isDesktop={isDesktop}
        isChatExpanded={isChatExpanded}
        isChatMaximized={isChatMaximized}
        setIsChatExpanded={setIsChatExpanded}
        setIsChatMaximized={setIsChatMaximized}
        workspaceHeader={
          !isChatMaximized && currentWorkspaceId && !isLoadingWorkspace ? (
            <WorkspaceHeader
              onOpenSearch={() => setSearchDialogOpen(true)}
              currentWorkspaceId={currentWorkspaceId}
              isSaving={isSaving}
              isDesktop={isDesktop}
              isChatExpanded={isChatExpanded}
              setIsChatExpanded={setIsChatExpanded}
              workspaceName={currentWorkspaceTitle}
              workspaceIcon={currentWorkspaceIcon}
              workspaceColor={currentWorkspaceColor}
              addItem={operations.createItem}
              onPDFUpload={handleWorkspacePdfUpload}
              onItemCreated={handleCreatedItems}
              items={state}
              onRenameFolder={(folderId, newName) => {
                operations.updateItem(folderId, { name: newName });
              }}
              onOpenSettings={() => setShowWorkspaceSettings(true)}
              onOpenShare={() => setShowWorkspaceShare(true)}
              activeOpenWorkspaceItem={(() => {
                if (!primaryOpenItemId || workspaceOpenMode !== "single") {
                  return null;
                }
                return state.find((i) => i.id === primaryOpenItemId) ?? null;
              })()}
              onCloseActiveItem={(id) => {
                operations.flushPendingChanges(id);
                closeWorkspaceItem(id);
              }}
              onNavigateToRoot={() => {
                if (primaryOpenItemId) {
                  operations.flushPendingChanges(primaryOpenItemId);
                  navigateToRoot();
                } else {
                  setActiveFolderId(null);
                }
              }}
              onNavigateToFolder={(folderId) => {
                if (primaryOpenItemId) {
                  operations.flushPendingChanges(primaryOpenItemId);
                  navigateToFolder(folderId);
                } else {
                  setActiveFolderId(folderId);
                }
              }}
              onUpdateActiveItem={operations.updateItem}
              getDocumentMarkdownForExport={
                operations.getDocumentMarkdownForExport
              }
              googleLoginHint={session?.user?.email ?? null}
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
            addItem={operations.createItem}
            updateItem={operations.updateItem}
            deleteItem={operations.deleteItem}
            updateAllItems={operations.updateAllItems}
            isChatMaximized={isChatMaximized}
            isDesktop={isDesktop}
            isChatExpanded={isChatExpanded}
            setIsChatExpanded={setIsChatExpanded}
            openWorkspaceItem={openWorkspaceItem}
            titleInputRef={titleInputRef as React.RefObject<HTMLInputElement>}
            operations={operations}
            scrollAreaRef={scrollAreaRef as React.RefObject<HTMLDivElement>}
            workspaceTitle={currentWorkspaceTitle}
            workspaceIcon={currentWorkspaceIcon}
            workspaceColor={currentWorkspaceColor}
            openItemView={openWorkspaceItemView}
          />
        }
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
      <WorkspaceSearchDialog
        open={searchDialogOpen}
        onOpenChange={setSearchDialogOpen}
        items={state}
        currentWorkspaceId={currentWorkspaceId}
        isLoadingWorkspace={isLoadingWorkspace}
      />
    </PdfEngineWrapper>
  );
}

// Main page component (wrapper)
export function WorkspacePage() {
  return (
    <InviteGuard>
      <WorkspaceView />
    </InviteGuard>
  );
}

// Inner component with all the workspace hooks
// Only rendered when InviteGuard allows (authenticated + invite processed)
function WorkspaceView() {
  // Get workspace context - currentWorkspace is loaded directly by slug (fast path)
  const { currentWorkspace, loadingCurrentWorkspace, markWorkspaceOpened } =
    useWorkspaceContext();

  const currentWorkspaceId = currentWorkspace?.id || null;

  // Sync workspace ID to store
  const setCurrentWorkspaceId = useWorkspaceStore(
    (state) => state.setCurrentWorkspaceId,
  );
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

  // Sync active folder with URL query param (?folder=<id>)
  // Reset folder/panels when workspace changes
  // and enables browser-native back/forward for folder navigation
  useFolderUrl();

  return (
    <ZeroProvider>
      <RealtimeProvider workspaceId={currentWorkspaceId}>
        <WorkspaceContent
          currentWorkspace={currentWorkspace}
          loadingCurrentWorkspace={loadingCurrentWorkspace}
        />
      </RealtimeProvider>
    </ZeroProvider>
  );
}

export function WorkspaceShell() {
  return (
    <>
      <MobileWarning />
      <AnonymousSessionHandler>
        <WorkspaceProvider>
          {/* <JoyrideProvider> */}
          <SidebarCoordinator>
            <WorkspacePage />
          </SidebarCoordinator>
          {/* </JoyrideProvider> */}
        </WorkspaceProvider>
      </AnonymousSessionHandler>
    </>
  );
}
