import { Columns2, Copy, FilePlus2, PanelRightClose, X } from "lucide-react";
import { workspaceContextMenuRenderer } from "#/features/workspaces/components/WorkspaceMenuRenderers";
import type { WorkspaceMenuRenderer } from "#/features/workspaces/components/workspace-menu-actions";
import { renderWorkspaceMenuActions } from "#/features/workspaces/components/workspace-menu-actions";
import type { WorkspaceTab } from "#/features/workspaces/state/workspace-tabs-store";

interface WorkspaceTabActionsMenuProps {
	tab: WorkspaceTab;
	tabIndex: number;
	tabCount: number;
	onNewTabToRight: (tab: WorkspaceTab) => void;
	onDuplicateTab: (tab: WorkspaceTab) => void;
	onCloseTab: (tab: WorkspaceTab) => void;
	onCloseOtherTabs: (tab: WorkspaceTab) => void;
	onCloseTabsToRight: (tab: WorkspaceTab) => void;
}

export function WorkspaceTabContextMenuContent({
	renderer = workspaceContextMenuRenderer,
	...props
}: WorkspaceTabActionsMenuProps & {
	renderer?: WorkspaceMenuRenderer;
}) {
	return renderWorkspaceMenuActions(getWorkspaceTabMenuActions(props), renderer);
}

function getWorkspaceTabMenuActions({
	tab,
	tabIndex,
	tabCount,
	onNewTabToRight,
	onDuplicateTab,
	onCloseTab,
	onCloseOtherTabs,
	onCloseTabsToRight,
}: WorkspaceTabActionsMenuProps) {
	return [
		{
			kind: "item" as const,
			id: "new-tab-to-right",
			label: "New tab to the right",
			leading: <FilePlus2 className="size-4" />,
			onSelect: () => onNewTabToRight(tab),
		},
		{
			kind: "item" as const,
			id: "duplicate-tab",
			label: "Duplicate tab",
			leading: <Copy className="size-4" />,
			onSelect: () => onDuplicateTab(tab),
		},
		{
			kind: "item" as const,
			id: "split-with-current-tab",
			label: "Split with current tab",
			trailing: "Soon",
			leading: <Columns2 className="size-4" />,
			disabled: true,
		},
		{ kind: "separator" as const, id: "close-separator" },
		{
			kind: "item" as const,
			id: "close-tab",
			label: "Close tab",
			leading: <X className="size-4" />,
			disabled: tabCount <= 1,
			onSelect: () => onCloseTab(tab),
		},
		{
			kind: "item" as const,
			id: "close-other-tabs",
			label: "Close other tabs",
			leading: <PanelRightClose className="size-4" />,
			disabled: tabCount <= 1,
			onSelect: () => onCloseOtherTabs(tab),
		},
		{
			kind: "item" as const,
			id: "close-tabs-to-right",
			label: "Close tabs to the right",
			leading: <PanelRightClose className="size-4" />,
			disabled: tabIndex >= tabCount - 1,
			onSelect: () => onCloseTabsToRight(tab),
		},
	];
}
