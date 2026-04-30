"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { useKeyboardShortcuts } from "@/hooks/ui/use-keyboard-shortcuts";
import { useFolderUrl } from "@/hooks/ui/use-folder-url";
import { useReactiveNavigation } from "@/hooks/ui/use-reactive-navigation";
import {
  WorkspaceItemsProvider,
  useWorkspaceItems,
  useWorkspaceItemsLoading,
} from "@/hooks/workspace/use-workspace-items";
import { useWorkspaceOperations } from "@/hooks/workspace/use-workspace-operations";
import { useWorkspaceUpload } from "@/hooks/workspace/use-workspace-upload";
import {
  WorkspaceProvider,
  useWorkspaceContext,
} from "@/contexts/WorkspaceContext";
import { selectWorkspaceOpenMode, useUIStore } from "@/lib/stores/ui-store";
import { useAudioRecordingStore } from "@/lib/stores/audio-recording-store";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { WorkspaceSection } from "@/components/workspace-canvas/WorkspaceSection";
import WorkspaceHeader from "@/components/workspace-canvas/WorkspaceHeader";
import { WorkspaceSearchDialog } from "@/components/workspace-canvas/WorkspaceSearchDialog";
import { OpenWorkspaceItemView } from "@/components/workspace-canvas/OpenWorkspaceItemView";
import { useSidebar, SidebarProvider } from "@/components/ui/sidebar";
import { MobileWarning } from "@/components/ui/MobileWarning";
import { useConnectionState } from "@rocicorp/zero/react";
import { PdfEngineWrapper } from "@/components/pdf/PdfEngineWrapper";
import WorkspaceSettingsModal from "@/components/workspace/WorkspaceSettingsModal";
import ShareWorkspaceDialog from "@/components/workspace/ShareWorkspaceDialog";
import { RealtimeProvider } from "@/contexts/RealtimeContext";
import { ZeroProvider } from "@/lib/zero/provider";

/**
 * Inner shell — runs after auth + Zero are bootstrapped. Holds the workspace
 * UI, modals, keyboard shortcuts, and side-effects that depend on the active
 * workspace.
 */
function WorkspaceContent() {
  const { data: session } = useSession();
  const { currentWorkspace } = useWorkspaceContext();

  const currentWorkspaceId = currentWorkspace?.id ?? null;
  const currentWorkspaceTitle = currentWorkspace?.name;
  const currentWorkspaceIcon = currentWorkspace?.icon;
  const currentWorkspaceColor = currentWorkspace?.color;

  const zeroConnectionState = useConnectionState();
  const isSaving = zeroConnectionState.name === "connecting";

  const state = useWorkspaceItems();
  const isLoadingWorkspace = useWorkspaceItemsLoading();
  const operations = useWorkspaceOperations(currentWorkspaceId, state);

  // Reactive navigation (auto-scroll/select on new items)
  const { handleCreatedItems } = useReactiveNavigation(state);

  // Audio dialog: open when landing from "record" flow, close on workspace switch.
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

  // Lifted modal state (header opens these).
  const [showWorkspaceSettings, setShowWorkspaceSettings] = useState(false);
  const [showWorkspaceShare, setShowWorkspaceShare] = useState(false);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);

  // Keyboard shortcuts use the sidebar + chat toggles.
  const { toggleSidebar } = useSidebar();
  const toggleChatExpanded = useUIStore((s) => s.toggleChatExpanded);
  const toggleChatMaximized = useUIStore((s) => s.toggleChatMaximized);
  useKeyboardShortcuts(toggleChatExpanded, {
    onToggleSidebar: toggleSidebar,
    onToggleChatMaximize: toggleChatMaximized,
    onFocusSearch: () => {
      if (currentWorkspaceId && !isLoadingWorkspace) {
        setSearchDialogOpen(true);
      }
    },
  });

  // Header-only state (read here to avoid drilling through WorkspaceSection).
  const isChatMaximized = useUIStore((s) => s.isChatMaximized);
  const primaryOpenItemId = useUIStore((s) => s.openItems.primary);
  const workspaceOpenMode = useUIStore(selectWorkspaceOpenMode);
  const closeWorkspaceItem = useUIStore((s) => s.closeWorkspaceItem);
  const setActiveFolderId = useUIStore((s) => s.setActiveFolderId);
  const navigateToRoot = useUIStore((s) => s.navigateToRoot);
  const navigateToFolder = useUIStore((s) => s.navigateToFolder);
  const isChatExpanded = useUIStore((s) => s.isChatExpanded);
  const setIsChatExpanded = useUIStore((s) => s.setIsChatExpanded);

  // Single shared upload pipeline (matches the legacy WorkspaceShell behavior:
  // no per-file size limit; the per-section path enforces 50MB).
  const uploadHeaderFiles = useWorkspaceUpload({
    currentWorkspaceId,
    operations,
    onItemsCreated: handleCreatedItems,
    enforceSizeLimit: false,
  });

  return (
    <PdfEngineWrapper>
      <WorkspaceLayout
        workspaceHeader={
          !isChatMaximized && currentWorkspaceId && !isLoadingWorkspace ? (
            <WorkspaceHeader
              onOpenSearch={() => setSearchDialogOpen(true)}
              currentWorkspaceId={currentWorkspaceId}
              isSaving={isSaving}
              isChatExpanded={isChatExpanded}
              setIsChatExpanded={setIsChatExpanded}
              workspaceName={currentWorkspaceTitle}
              workspaceIcon={currentWorkspaceIcon}
              workspaceColor={currentWorkspaceColor}
              addItem={operations.createItem}
              onPDFUpload={uploadHeaderFiles}
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
            state={state}
            operations={operations}
            openItemView={
              <OpenWorkspaceItemView
                items={state}
                onUpdateItem={operations.updateItem}
                onUpdateItemData={operations.updateItemData}
                onFlushPendingChanges={operations.flushPendingChanges}
              />
            }
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
      />
    </PdfEngineWrapper>
  );
}

/**
 * Side-effect bridge that lives between providers and the workspace UI:
 * - calls `markWorkspaceOpened` once per workspace
 * - syncs active folder with the URL via `useFolderUrl`
 */
function WorkspaceShellInner() {
  const { currentWorkspaceId, markWorkspaceOpened } = useWorkspaceContext();

  const lastTrackedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentWorkspaceId) return;
    if (lastTrackedRef.current === currentWorkspaceId) return;
    markWorkspaceOpened(currentWorkspaceId);
    lastTrackedRef.current = currentWorkspaceId;
  }, [currentWorkspaceId, markWorkspaceOpened]);

  useFolderUrl();

  return (
    <WorkspaceItemsProvider>
      <RealtimeProvider workspaceId={currentWorkspaceId}>
        <WorkspaceContent />
      </RealtimeProvider>
    </WorkspaceItemsProvider>
  );
}

/**
 * Public entry point. The page-level server component already guarantees a
 * session exists (anonymous or real). Flat provider stack from there:
 * WorkspaceProvider → SidebarProvider → ZeroProvider → workspace tree.
 */
export function WorkspaceShell() {
  return (
    <>
      <MobileWarning />
      <WorkspaceProvider>
        <SidebarProvider defaultOpen={false}>
          <ZeroProvider>
            <WorkspaceShellInner />
          </ZeroProvider>
        </SidebarProvider>
      </WorkspaceProvider>
    </>
  );
}
