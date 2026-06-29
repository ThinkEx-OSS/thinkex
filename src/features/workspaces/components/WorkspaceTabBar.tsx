import { FileQuestion, Plus } from "lucide-react";

import { useWorkspaceTabCloseResizeLock } from "#/features/workspaces/components/useWorkspaceTabCloseResizeLock";
import { WorkspaceTabContextMenuContent } from "#/features/workspaces/components/WorkspaceTabActionsMenu";
import {
	WorkspaceTabDivider,
	WorkspaceTabItem,
} from "#/features/workspaces/components/WorkspaceTabBarItem";
import { WorkspaceToolbarIconButton } from "#/features/workspaces/components/WorkspaceToolbar";
import { getWorkspaceTabGridStyle } from "#/features/workspaces/components/workspace-tab-bar-model";
import type { WorkspaceSummary } from "#/features/workspaces/contracts";
import { getWorkspaceDisplay } from "#/features/workspaces/model/display";
import { getWorkspaceItemDisplay } from "#/features/workspaces/model/item-display";
import { findItemForTab } from "#/features/workspaces/model/tabs";
import type { WorkspaceItem } from "#/features/workspaces/model/types";
import type { WorkspaceTab } from "#/features/workspaces/state/workspace-tabs-store";
import { cn } from "#/lib/utils";

interface WorkspaceTabBarProps {
	workspace: WorkspaceSummary;
	itemsById: Map<string, WorkspaceItem>;
	tabs: WorkspaceTab[];
	activeTab: WorkspaceTab;
	onActivateTab: (tab: WorkspaceTab) => void;
	onCloseTab: (tab: WorkspaceTab) => void;
	onCloseOtherTabs: (tab: WorkspaceTab) => void;
	onCloseTabsToRight: (tab: WorkspaceTab) => void;
	onCreateRootTab: () => void;
	onCreateRootTabAfter: (tab: WorkspaceTab) => void;
	onDuplicateTab: (tab: WorkspaceTab) => void;
}

export default function WorkspaceTabBar({
	workspace,
	itemsById,
	tabs,
	activeTab,
	onActivateTab,
	onCloseTab,
	onCloseOtherTabs,
	onCloseTabsToRight,
	onCreateRootTab,
	onCreateRootTabAfter,
	onDuplicateTab,
}: WorkspaceTabBarProps) {
	const { Icon, color } = getWorkspaceDisplay(workspace);
	const closeResizeLock = useWorkspaceTabCloseResizeLock(tabs.length);
	const gridStyle = getWorkspaceTabGridStyle({
		tabCount: tabs.length,
		lockedTabWidth: closeResizeLock.lockedTabWidth,
	});
	const lastTab = tabs[tabs.length - 1];

	return (
		<nav
			className="flex min-w-0 flex-1 items-center gap-1"
			aria-label="Workspace tabs"
			onPointerLeave={closeResizeLock.release}
		>
			<div
				className={cn(
					"grid min-w-0 max-w-full items-center gap-1 overflow-visible",
					closeResizeLock.shouldAnimateResize &&
						"transition-[width,max-width] duration-150 ease-out",
				)}
				style={gridStyle}
			>
				{tabs.map((tab, tabIndex) => {
					const previousTab = tabs[tabIndex - 1];
					const showDivider = tabIndex > 0;
					const showDividerLine =
						showDivider && tab.id !== activeTab.id && previousTab?.id !== activeTab.id;
					const item = findItemForTab(tab, itemsById);
					const isRootTab = !tab.viewItemId;
					const itemDisplay = item ? getWorkspaceItemDisplay(item) : null;
					const TabIcon = isRootTab ? Icon : (itemDisplay?.Icon ?? FileQuestion);
					const title = item?.name ?? (isRootTab ? workspace.name : tab.title);
					const iconClassName = isRootTab
						? color.text
						: (itemDisplay?.iconClassName ?? "text-muted-foreground");
					const isActive = tab.id === activeTab.id;

					return (
						<WorkspaceTabItem
							key={tab.id}
							tab={tab}
							index={tabIndex}
							title={title}
							TabIcon={TabIcon}
							iconClassName={iconClassName}
							isActive={isActive}
							showDivider={showDivider}
							showDividerLine={showDividerLine}
							showClose={tabs.length > 1}
							onBeforeClose={closeResizeLock.lockFromElement}
							onActivate={() => onActivateTab(tab)}
							onClose={() => onCloseTab(tab)}
							contextMenuContent={
								<WorkspaceTabContextMenuContent
									tab={tab}
									tabIndex={tabIndex}
									tabCount={tabs.length}
									onNewTabToRight={onCreateRootTabAfter}
									onDuplicateTab={onDuplicateTab}
									onCloseTab={onCloseTab}
									onCloseOtherTabs={onCloseOtherTabs}
									onCloseTabsToRight={onCloseTabsToRight}
								/>
							}
						/>
					);
				})}
			</div>
			<div className="relative flex shrink-0 items-center gap-1">
				<WorkspaceTabDivider isVisible={lastTab?.id !== activeTab.id} />
				<WorkspaceToolbarIconButton
					className="shrink-0"
					aria-label="Open new workspace tab"
					onClick={onCreateRootTab}
				>
					<Plus />
				</WorkspaceToolbarIconButton>
			</div>
		</nav>
	);
}
