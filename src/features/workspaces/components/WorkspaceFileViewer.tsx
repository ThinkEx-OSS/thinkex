import { type ComponentType, type LazyExoticComponent, lazy, Suspense } from "react";

import { ContextMenu, ContextMenuTrigger } from "#/components/ui/context-menu";
import { Spinner } from "#/components/ui/spinner";
import { WorkspaceItemActionsContextMenuContent } from "#/features/workspaces/components/WorkspaceItemActionsMenu";
import { getWorkspaceItemDisplay } from "#/features/workspaces/model/item-display";
import type { WorkspaceItem } from "#/features/workspaces/model/types";
import {
	resolveWorkspaceFileTypeFromItem,
	type WorkspaceFileAssetKind,
} from "#/features/workspaces/model/workspace-file";
import { cn } from "#/lib/utils";

interface WorkspaceFileViewerComponentProps {
	item: WorkspaceItem;
	toolbarSlotId?: string;
	workspaceId: string;
}

const workspaceFileViewers: Record<
	WorkspaceFileAssetKind,
	LazyExoticComponent<ComponentType<WorkspaceFileViewerComponentProps>>
> = {
	pdf: lazy(() => import("#/features/workspaces/components/WorkspacePdfViewer")),
	image: lazy(() => import("#/features/workspaces/components/WorkspaceImageViewer")),
};

interface WorkspaceFileViewerProps {
	item: WorkspaceItem;
	toolbarSlotId: string;
	workspaceId: string;
	onDeleteItem: (item: WorkspaceItem) => void;
	onMoveItem: (item: WorkspaceItem) => void;
	onRenameItem: (item: WorkspaceItem) => void;
}

export default function WorkspaceFileViewer({
	item,
	toolbarSlotId,
	workspaceId,
	onDeleteItem,
	onMoveItem,
	onRenameItem,
}: WorkspaceFileViewerProps) {
	const descriptor = resolveWorkspaceFileTypeFromItem(item);
	const Viewer = descriptor ? workspaceFileViewers[descriptor.assetKind] : null;

	return (
		<div className="h-full min-h-0">
			<ContextMenu>
				<ContextMenuTrigger render={<section className="h-full min-h-0 overflow-hidden" />}>
					{Viewer ? (
						<Suspense fallback={<WorkspaceFileViewerSkeleton />}>
							<Viewer item={item} toolbarSlotId={toolbarSlotId} workspaceId={workspaceId} />
						</Suspense>
					) : (
						<div className="flex h-full items-center justify-center bg-background">
							<WorkspaceUnsupportedFilePlaceholder item={item} />
						</div>
					)}
				</ContextMenuTrigger>
				<WorkspaceItemActionsContextMenuContent
					item={item}
					onMoveItem={onMoveItem}
					onRenameItem={onRenameItem}
					onDeleteItem={onDeleteItem}
				/>
			</ContextMenu>
		</div>
	);
}

function WorkspaceUnsupportedFilePlaceholder({ item }: { item: WorkspaceItem }) {
	const { Icon: ItemIcon, iconClassName, surfaceClassName } = getWorkspaceItemDisplay(item);

	return (
		<div className={cn("flex flex-col items-center gap-3 text-center", surfaceClassName)}>
			<ItemIcon className={cn("size-12", iconClassName)} strokeWidth={1.75} aria-hidden="true" />
			<div className="space-y-1">
				<h2 className="font-medium text-foreground text-sm">{item.name}</h2>
				<p className="text-muted-foreground text-xs">This file type does not have a viewer yet.</p>
			</div>
		</div>
	);
}

function WorkspaceFileViewerSkeleton() {
	return (
		<div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 bg-background px-4 text-center text-muted-foreground text-sm">
			<Spinner className="size-4" />
			<p>Loading file viewer...</p>
		</div>
	);
}
