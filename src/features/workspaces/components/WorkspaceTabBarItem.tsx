import { useSortable } from "@dnd-kit/react/sortable";
import type { LucideIcon } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "#/components/ui/context-menu";
import { WorkspaceTabShell } from "#/features/workspaces/components/WorkspaceTabShell";
import { useWorkspaceMutationAccess } from "#/features/workspaces/components/workspace-mutation-access";
import { workspaceControlledSortablePlugins } from "#/features/workspaces/components/workspace-sortable-plugins";
import { WORKSPACE_TAB_ITEM_CLASS } from "#/features/workspaces/components/workspace-tab-bar-model";
import { horizontalTabCollisionDetector } from "#/features/workspaces/components/workspace-tab-collision";
import { WORKSPACE_SORTABLE_TAB_TRANSITION } from "#/features/workspaces/components/workspace-tab-motion";
import {
	createWorkspaceTabDragData,
	WORKSPACE_TAB_DRAG_TYPE,
} from "#/features/workspaces/model/drag";
import type { WorkspaceTab } from "#/features/workspaces/state/workspace-tabs-store";
import { cn } from "#/lib/utils";

export function WorkspaceTabDivider({ isVisible = true }: { isVisible?: boolean }) {
	return (
		<div
			className={cn("relative z-10 h-4 w-px shrink-0 bg-border/70", !isVisible && "opacity-0")}
			aria-hidden="true"
		/>
	);
}

export function WorkspaceTabItem({
	tab,
	index,
	title,
	TabIcon,
	iconClassName,
	isActive,
	showDivider,
	showDividerLine,
	showClose,
	onBeforeClose,
	onActivate,
	onClose,
	contextMenuContent,
}: {
	tab: WorkspaceTab;
	index: number;
	title: string;
	TabIcon: LucideIcon;
	iconClassName?: string;
	isActive: boolean;
	showDivider: boolean;
	showDividerLine: boolean;
	showClose: boolean;
	onBeforeClose: (element: HTMLElement | null) => void;
	onActivate: () => void;
	onClose: () => void;
	contextMenuContent?: ReactNode;
}) {
	const [element, setElement] = useState<Element | null>(null);
	const elementRef = useRef<HTMLDivElement | null>(null);
	const handleRef = useRef<HTMLButtonElement | null>(null);
	const setTabElement = (nextElement: HTMLDivElement | null) => {
		elementRef.current = nextElement;
		setElement(nextElement);
	};
	const handleClose = () => {
		onBeforeClose(elementRef.current);
		onClose();
	};
	const { capabilities } = useWorkspaceMutationAccess();
	const { isDragSource, isDropTarget } = useSortable({
		id: tab.id,
		index,
		element,
		handle: handleRef,
		type: WORKSPACE_TAB_DRAG_TYPE,
		accept: WORKSPACE_TAB_DRAG_TYPE,
		disabled: !capabilities.canMutateContent,
		collisionDetector: horizontalTabCollisionDetector,
		transition: {
			...WORKSPACE_SORTABLE_TAB_TRANSITION,
			idle: false,
		},
		plugins: workspaceControlledSortablePlugins,
		data: createWorkspaceTabDragData(tab.id),
	});
	const showAttachedChrome = isActive && !isDragSource;

	const tabContent = (
		<div
			ref={setTabElement}
			className={cn(
				"relative motion-safe:will-change-transform",
				WORKSPACE_TAB_ITEM_CLASS,
				isDragSource && "opacity-70",
				isDropTarget && "rounded-md bg-muted/50",
			)}
		>
			{showDivider ? <WorkspaceTabDivider isVisible={showDividerLine} /> : null}
			<WorkspaceTabShell
				title={title}
				TabIcon={TabIcon}
				iconClassName={iconClassName}
				variant={showAttachedChrome ? "active-attached" : isActive ? "active" : "idle"}
				buttonRef={handleRef}
				isDragSource={isDragSource}
				showClose={showClose}
				closeLabel={`Close ${title}`}
				onActivate={onActivate}
				onClose={handleClose}
			/>
		</div>
	);

	if (!contextMenuContent) {
		return tabContent;
	}

	return (
		<ContextMenu>
			<ContextMenuTrigger render={tabContent} />
			<ContextMenuContent className="w-56">{contextMenuContent}</ContextMenuContent>
		</ContextMenu>
	);
}
