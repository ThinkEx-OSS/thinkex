import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { workspacePageQueryKey } from "#/features/workspaces/cache-keys";
import { applyWorkspacePageDeltaToCache } from "#/features/workspaces/cache-page";
import AiChatPanel from "#/features/workspaces/components/AiChatPanel";
import WorkspaceChatLayout from "#/features/workspaces/components/WorkspaceChatLayout";
import {
	CreateStudyItemDialog,
	type StudyItemDialogType,
} from "#/features/workspaces/components/study/CreateStudyItemDialog";
import WorkspaceContextBar from "#/features/workspaces/components/WorkspaceContextBar";
import { hasActiveWorkspaceCapture } from "#/features/workspaces/components/WorkspaceCaptureChrome";
import WorkspaceDragProvider from "#/features/workspaces/components/WorkspaceDragProvider";
import { WorkspaceFileIntakeProvider } from "#/features/workspaces/components/WorkspaceFileIntakeProvider";
import { WorkspaceFileUploadProvider } from "#/features/workspaces/components/WorkspaceFileUploadProvider";
import { WorkspaceRecordingProvider } from "#/features/workspaces/components/WorkspaceRecordingProvider";
import { WorkspaceItemToolbarProvider } from "#/features/workspaces/components/WorkspaceItemToolbarSlot";
import { useWorkspaceFindStore } from "#/features/workspaces/find/workspace-find-store";
import WorkspaceMobileLayout from "#/features/workspaces/components/WorkspaceMobileLayout";
import WorkspacePaneRenderer from "#/features/workspaces/components/WorkspacePaneRenderer";
import { WorkspacePdfEngineProvider } from "#/features/workspaces/components/WorkspacePdfEngineProvider";
import { WorkspaceMaximizedPresentation } from "#/features/workspaces/components/WorkspacePresentation";
import WorkspaceShellSkeleton from "#/features/workspaces/components/WorkspaceShellSkeleton";
import WorkspaceSplitPresentation from "#/features/workspaces/components/WorkspaceSplitPresentation";
import WorkspaceStandardTabPanes from "#/features/workspaces/components/WorkspaceStandardTabPanes";
import WorkspaceTopBar from "#/features/workspaces/components/WorkspaceTopBar";
import type { WorkspaceCreateItemRequest } from "#/features/workspaces/components/workspace-presentation-model";
import { WorkspaceMutationAccessProvider } from "#/features/workspaces/components/workspace-mutation-access";
import {
	useWorkspaceViewPolicy,
	WorkspaceViewCapabilitiesProvider,
} from "#/features/workspaces/components/workspace-view-policy";
import type { WorkspaceItem, WorkspaceSummary } from "#/features/workspaces/contracts";
import type { WorkspaceLocation } from "#/features/workspaces/locations/workspace-location";
import { WorkspaceLocationProvider } from "#/features/workspaces/locations/workspace-location-context";
import { DocumentEditReviewProvider } from "#/features/workspaces/documents/document-edit-review-context";
import { isWorkspaceItemView } from "#/features/workspaces/model/view";
import { getWorkspaceItemPath } from "#/features/workspaces/model/tree";
import { workspaceItemRequiresHeavyViewerRuntime } from "#/features/workspaces/model/workspace-file";
import {
	getActiveWorkspaceViewInstanceId,
	getWorkspaceMobileChatSurfaceMode,
} from "#/features/workspaces/model/workspace-ui";
import { useWorkspaceNavigation } from "#/features/workspaces/navigation/useWorkspaceNavigation";
import { useWorkspaceRealtime } from "#/features/workspaces/realtime/use-workspace-presence";
import { useWorkspacePersistedStoresHydrated } from "#/features/workspaces/state/persisted-store-hydration";
import { useWorkspaceAiComposerDraftQuotes } from "#/features/workspaces/state/workspace-ai-composer-draft-store";
import { useWorkspaceSelectionItemIds } from "#/features/workspaces/state/workspace-selection-store";
import {
	useWorkspaceItemViewStatesByViewInstance,
	useWorkspaceUiSession,
	useWorkspaceUiStore,
} from "#/features/workspaces/state/workspace-ui-store";
import {
	useCreateWorkspaceItemMutation,
	useMoveWorkspaceItemsMutation,
} from "#/features/workspaces/use-workspace-items";
import { getWorkspaceMemberCapabilities } from "#/features/workspaces/workspace-member-capabilities";
import { useAppHotkey } from "#/lib/hotkeys-core";
import { isOpenPopupInteractionTarget } from "#/lib/keyboard-event-target";

interface WorkspaceShellProps {
	workspace: WorkspaceSummary;
	items: WorkspaceItem[];
	activeTabIdFromUrl?: string;
	activeViewFromUrl?: string;
}

export function WorkspaceShell({
	workspace,
	items,
	activeTabIdFromUrl,
	activeViewFromUrl,
}: WorkspaceShellProps) {
	const queryClient = useQueryClient();
	const createWorkspaceItemMutation = useCreateWorkspaceItemMutation();
	const moveWorkspaceItemsMutation = useMoveWorkspaceItemsMutation();
	const [studyDraft, setStudyDraft] = useState<{
		type: StudyItemDialogType;
		parentId: string | null;
	}>();
	const persistedStoresHydrated = useWorkspacePersistedStoresHydrated();
	const ensureWorkspaceUiSession = useWorkspaceUiStore((state) => state.ensureWorkspaceSession);
	const itemViewStatesByViewInstanceId = useWorkspaceItemViewStatesByViewInstance(workspace.id);
	const selectedQuotes = useWorkspaceAiComposerDraftQuotes(workspace.id);
	const setChatSurfaceMode = useWorkspaceUiStore((state) => state.setChatSurfaceMode);
	const toggleChatPanel = useWorkspaceUiStore((state) => state.toggleChatPanel);
	const normalizedUiSession = useWorkspaceUiSession(workspace.id);
	const realtime = useWorkspaceRealtime({
		workspaceId: workspace.id,
		onPageChange: (change) => {
			applyWorkspacePageDeltaToCache(queryClient, change);
		},
		onDesync: () => {
			void queryClient.invalidateQueries({
				queryKey: workspacePageQueryKey(workspace.id),
			});
		},
	});
	const {
		activeItem,
		activeTab,
		activateWorkspaceTab,
		closeItemView,
		closeOtherWorkspaceTabs,
		closeWorkspaceTab,
		closeWorkspaceTabsToRight,
		createWorkspaceTab,
		createWorkspaceTabAfter,
		dispatchWorkspaceDragCommand,
		duplicateWorkspaceTab,
		itemsById,
		openItem,
		openWorkspaceRoot,
		revealWorkspaceLocation,
		scopedItems,
		session,
		validItemIds,
	} = useWorkspaceNavigation({
		workspace,
		items,
		presentation: normalizedUiSession.presentation,
		activeTabIdFromUrl,
		activeViewFromUrl,
	});
	const { capabilities: viewCapabilities, viewportMode } = useWorkspaceViewPolicy();
	const selectedItemIds = useWorkspaceSelectionItemIds(workspace.id);
	const { chatSurfaceMode, presentation } = normalizedUiSession;
	const mobileChatSurfaceMode = getWorkspaceMobileChatSurfaceMode(chatSurfaceMode);
	const hasHeavyViewerRuntimeItems = scopedItems.some(workspaceItemRequiresHeavyViewerRuntime);
	const navigateToWorkspaceLocation = (location: WorkspaceLocation) => {
		const viewInstanceId = revealWorkspaceLocation(location);

		if (viewInstanceId && chatSurfaceMode === "fullscreen") {
			// Desktop docks the chat beside what was just opened; mobile has no docked mode.
			setChatSurfaceMode(workspace.id, viewportMode === "mobile" ? "hidden" : "docked");
		}

		return viewInstanceId;
	};
	const createWorkspaceItem = (input: WorkspaceCreateItemRequest) => {
		if (!getWorkspaceMemberCapabilities(workspace.membershipRole).canMutateContent) {
			return;
		}

		if (input.type === "flashcard" || input.type === "quiz") {
			setStudyDraft({ type: input.type, parentId: input.parentId });
			return;
		}
		createWorkspaceItemMutation.mutate({
			id: crypto.randomUUID(),
			workspaceId: workspace.id,
			parentId: input.parentId,
			type: input.type,
		});
	};
	useEffect(() => {
		ensureWorkspaceUiSession({
			workspaceId: workspace.id,
			validItemIds,
		});
	}, [ensureWorkspaceUiSession, validItemIds, workspace.id]);
	useAppHotkey("workspace.aiChat.toggle", () => {
		toggleChatPanel(workspace.id);
	});
	useAppHotkey(
		"workspace.item.closeCurrent",
		(event) => {
			if (
				!isWorkspaceItemView(activeItem) ||
				isOpenPopupInteractionTarget(event.target) ||
				hasActiveWorkspaceCapture()
			) {
				return;
			}

			// A find bar handles its own Escape. Checking the origin rather than the
			// store matters: the bar clears openFindId before this runs, so reading
			// the store here would see no find open and close the item as well.
			if (event.target instanceof Element && event.target.closest("[data-workspace-find-bar]")) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();

			// Escape from anywhere else dismisses an open find bar first; closing the
			// item out from under someone who was only clearing a search is worse.
			if (useWorkspaceFindStore.getState().openFindId) {
				useWorkspaceFindStore.getState().closeFind();
				return;
			}

			closeItemView();
		},
		{
			conflictBehavior: "allow",
			enabled: isWorkspaceItemView(activeItem),
			preventDefault: false,
			stopPropagation: false,
		},
	);

	if (!persistedStoresHydrated || !session || !activeTab) {
		return <WorkspaceShellSkeleton chatSurfaceMode={chatSurfaceMode} />;
	}

	const aiContextScope = {
		activeItem,
		activeTabId: activeTab.id,
		itemViewStatesByViewInstanceId,
		itemsById,
		presentation,
		selectedItemIds,
		selectedQuotes,
		tabs: session.tabs,
		workspaceId: workspace.id,
		workspaceName: workspace.name,
	};

	const contextBar = (
		<WorkspaceContextBar
			workspace={workspace}
			activeItem={activeItem}
			itemsById={itemsById}
			toolbarSlotId={getActiveWorkspaceViewInstanceId(presentation, activeTab.id)}
			onCreateItem={createWorkspaceItem}
			onCloseItemView={isWorkspaceItemView(activeItem) ? closeItemView : undefined}
			onNavigateToRoot={openWorkspaceRoot}
			onNavigateToItem={openItem}
		/>
	);
	const standardTabPanes = (
		<WorkspaceStandardTabPanes
			activeTabId={activeTab.id}
			itemsById={itemsById}
			scopedItems={scopedItems}
			tabs={session.tabs}
			workspace={workspace}
			onCloseItemView={closeItemView}
			onCreateItem={createWorkspaceItem}
			onOpenItem={openItem}
		/>
	);

	const presentationContent =
		viewportMode === "mobile" ? (
			<WorkspaceMobileLayout
				workspace={workspace}
				contextBar={contextBar}
				content={standardTabPanes}
				chatSurfaceMode={mobileChatSurfaceMode}
				onOpenChat={() => setChatSurfaceMode(workspace.id, "fullscreen")}
				chatPanel={<AiChatPanel context={aiContextScope} />}
			/>
		) : presentation.mode === "maximized" ? (
			<WorkspaceMaximizedPresentation>
				<WorkspacePaneRenderer
					aiContextScope={aiContextScope}
					pane={presentation.pane}
					scopedItems={scopedItems}
					workspace={workspace}
					onCreateItem={createWorkspaceItem}
					onOpenItem={openItem}
				/>
			</WorkspaceMaximizedPresentation>
		) : (
			<WorkspaceChatLayout
				chatSurfaceMode={chatSurfaceMode}
				onDockedChatCollapse={() => setChatSurfaceMode(workspace.id, "hidden")}
				chrome={
					<WorkspaceTopBar
						workspace={workspace}
						itemsById={itemsById}
						tabs={session.tabs}
						activeTab={activeTab}
						contextBar={contextBar}
						presence={realtime}
						onActivateTab={activateWorkspaceTab}
						onCloseTab={closeWorkspaceTab}
						onCloseOtherTabs={closeOtherWorkspaceTabs}
						onCloseTabsToRight={closeWorkspaceTabsToRight}
						onCreateRootTab={createWorkspaceTab}
						onCreateRootTabAfter={createWorkspaceTabAfter}
						onDuplicateTab={duplicateWorkspaceTab}
					/>
				}
				content={
					presentation.mode === "split" ? (
						<WorkspaceSplitPresentation
							aiContextScope={aiContextScope}
							panes={presentation.panes}
							direction={presentation.direction}
							scopedItems={scopedItems}
							workspace={workspace}
							onCreateItem={createWorkspaceItem}
							onOpenItem={openItem}
						/>
					) : (
						standardTabPanes
					)
				}
				chatPanel={<AiChatPanel context={aiContextScope} />}
			/>
		);

	const workspaceInteractionContent = (
		<WorkspaceFileUploadProvider workspaceId={workspace.id}>
			<WorkspaceRecordingProvider
				key={workspace.id}
				workspaceId={workspace.id}
				activeItemId={activeItem?.id}
				itemsById={itemsById}
				onOpenItem={openItem}
			>
				<WorkspaceFileIntakeProvider>
					<WorkspaceDragProvider
						items={scopedItems}
						workspaceId={workspace.id}
						onMoveItems={moveWorkspaceItemsMutation.mutate}
						onWorkspaceDragCommand={dispatchWorkspaceDragCommand}
					>
						<WorkspaceViewCapabilitiesProvider capabilities={viewCapabilities}>
							<WorkspaceItemToolbarProvider>{presentationContent}</WorkspaceItemToolbarProvider>
						</WorkspaceViewCapabilitiesProvider>
					</WorkspaceDragProvider>
				</WorkspaceFileIntakeProvider>
			</WorkspaceRecordingProvider>
		</WorkspaceFileUploadProvider>
	);
	const studyParent = studyDraft?.parentId ? itemsById.get(studyDraft.parentId) : undefined;
	const studyDialogOpen =
		studyDraft !== undefined && (studyDraft.parentId === null || studyParent !== undefined);
	const studyParentPath = studyParent ? getWorkspaceItemPath(studyParent, itemsById) : "/";

	return (
		<WorkspaceMutationAccessProvider membershipRole={workspace.membershipRole}>
			<WorkspaceLocationProvider itemsById={itemsById} navigate={navigateToWorkspaceLocation}>
				<DocumentEditReviewProvider workspaceId={workspace.id}>
					<WorkspacePdfEngineProvider active={hasHeavyViewerRuntimeItems}>
						{workspaceInteractionContent}
					</WorkspacePdfEngineProvider>
					<CreateStudyItemDialog
						type={studyDraft?.type ?? "flashcard"}
						open={studyDialogOpen}
						parentPath={studyParentPath}
						workspaceId={workspace.id}
						onOpenChange={(open) => {
							if (!open) setStudyDraft(undefined);
						}}
					/>
				</DocumentEditReviewProvider>
			</WorkspaceLocationProvider>
		</WorkspaceMutationAccessProvider>
	);
}
