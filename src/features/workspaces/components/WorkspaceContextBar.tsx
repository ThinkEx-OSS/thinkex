import { ChevronDown, Clock3, Settings, Share2 } from "lucide-react";
import { type ComponentType, type ReactElement, useState } from "react";

import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "#/components/ui/breadcrumb";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { useWorkspaceItemActionDialogState } from "#/features/workspaces/components/useWorkspaceItemActionDialogState";
import WorkspaceContextActions from "#/features/workspaces/components/WorkspaceContextActions";
import {
	DeleteWorkspaceItemAlert,
	RenameWorkspaceItemDialog,
} from "#/features/workspaces/components/WorkspaceItemActionDialogs";
import WorkspaceItemActionsMenu from "#/features/workspaces/components/WorkspaceItemActionsMenu";
import { WorkspaceItemToolbarSlot } from "#/features/workspaces/components/WorkspaceItemToolbarSlot";
import { workspaceDropdownMenuRenderer } from "#/features/workspaces/components/WorkspaceMenuRenderers";
import { MoveWorkspaceItemsDialog } from "#/features/workspaces/components/WorkspaceMoveItemsDialog";
import WorkspaceMobileBreadcrumbOverflow from "#/features/workspaces/components/WorkspaceMobileBreadcrumbOverflow";
import { WorkspaceSearchDialog } from "#/features/workspaces/components/WorkspaceSearchDialog";
import WorkspaceSettingsDialog from "#/features/workspaces/components/WorkspaceSettingsDialog";
import { WorkspaceShareDialog } from "#/features/workspaces/components/WorkspaceShareDialog";
import { WorkspaceToolbarGroup } from "#/features/workspaces/components/WorkspaceToolbar";
import {
	renderWorkspaceMenuActions,
	type WorkspaceMenuAction,
} from "#/features/workspaces/components/workspace-menu-actions";
import { useWorkspaceMutationAccess } from "#/features/workspaces/components/workspace-mutation-access";
import type { WorkspaceItemType, WorkspaceSummary } from "#/features/workspaces/contracts";
import { getWorkspaceDisplay } from "#/features/workspaces/model/display";
import { getWorkspaceItemDisplay } from "#/features/workspaces/model/item-display";
import { getWorkspaceBreadcrumbItems } from "#/features/workspaces/model/tree";
import type { WorkspaceItem } from "#/features/workspaces/model/types";
import { getWorkspaceBrowseParentId } from "#/features/workspaces/model/view";
import { formatAppHotkey, getAppHotkey, useAppHotkey } from "#/lib/hotkeys-core";
import { cn } from "#/lib/utils";

const breadcrumbContentClassName = "flex min-w-0 items-center gap-1.5 truncate";
const breadcrumbCurrentClassName = `${breadcrumbContentClassName} text-foreground`;
const breadcrumbLinkClassName = `${breadcrumbContentClassName} rounded-sm border-0 bg-transparent p-0 font-[inherit] text-muted-foreground underline-offset-4 outline-none transition-colors hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring active:translate-y-0`;
const currentCrumbLabelClassName = "[text-shadow:0.025em_0_0_currentColor]";

interface WorkspaceContextBarProps {
	workspace: WorkspaceSummary;
	activeItem?: WorkspaceItem;
	itemsById: Map<string, WorkspaceItem>;
	toolbarSlotId?: string;
	onCreateItem: (input: { type: WorkspaceItemType; parentId: string | null }) => void;
	onCloseItemView?: () => void;
	onNavigateToRoot: () => void;
	onNavigateToItem: (item: WorkspaceItem) => void;
}

export default function WorkspaceContextBar({
	workspace,
	activeItem,
	itemsById,
	toolbarSlotId,
	onCreateItem,
	onCloseItemView,
	onNavigateToRoot,
	onNavigateToItem,
}: WorkspaceContextBarProps) {
	const { capabilities } = useWorkspaceMutationAccess();
	const { Icon: WorkspaceIcon, color } = getWorkspaceDisplay(workspace);
	const [searchOpen, setSearchOpen] = useState(false);
	const [shareOpen, setShareOpen] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const breadcrumbs = getWorkspaceBreadcrumbItems(activeItem, itemsById);
	const mobileOverflowBreadcrumbs = breadcrumbs.slice(0, -1);
	const createParentId = getWorkspaceBrowseParentId(activeItem);
	const {
		clearDeletingItem,
		clearMovingItem,
		deleteAlertOpen,
		deletingItem,
		moveDialogOpen,
		movingItem,
		openDeleteAlert,
		openMoveDialog,
		renamingItem,
		setDeleteAlertOpen,
		setMoveDialogOpen,
		setRenamingItem,
	} = useWorkspaceItemActionDialogState();
	const workspaceItems = Array.from(itemsById.values());
	const searchHotkey = formatAppHotkey(getAppHotkey("workspace.search.open").hotkey);
	const openWorkspaceSearch = () => setSearchOpen(true);

	useAppHotkey("workspace.search.open", () => {
		openWorkspaceSearch();
	});

	return (
		<>
			<div className="relative z-10 flex h-12 items-center gap-3 bg-background px-4 text-sm sm:h-11">
				<Breadcrumb className="min-w-0 flex-1">
					<BreadcrumbList className="flex-nowrap gap-1.5 overflow-hidden sm:gap-1.5">
						<BreadcrumbItem className="min-w-0">
							{activeItem ? (
								<CrumbButton
									icon={WorkspaceIcon}
									label={workspace.name}
									iconClassName={color.text}
									isCurrent={false}
									hideLabelOnMobile={true}
									onClick={onNavigateToRoot}
								/>
							) : (
								<WorkspaceRootActionsMenu
									capabilities={capabilities}
									onOpenSettings={() => setSettingsOpen(true)}
									onOpenShare={() => setShareOpen(true)}
									trigger={
										<button
											type="button"
											className={breadcrumbCurrentClassName}
											aria-label={`Open actions for ${workspace.name}`}
										>
											<CrumbContent
												icon={WorkspaceIcon}
												label={workspace.name}
												iconClassName={color.text}
												isCurrent={true}
												showDisclosure={true}
											/>
										</button>
									}
								/>
							)}
						</BreadcrumbItem>
						<WorkspaceMobileBreadcrumbOverflow
							items={mobileOverflowBreadcrumbs}
							onNavigateToItem={onNavigateToItem}
						/>
						{breadcrumbs.map((item, index) => (
							<WorkspaceBreadcrumbItem
								key={item.id}
								item={item}
								isCurrent={item.id === activeItem?.id}
								isMobileHidden={index < breadcrumbs.length - 1}
								onClick={() => onNavigateToItem(item)}
								onRenameItem={setRenamingItem}
								onMoveItem={openMoveDialog}
								onDeleteItem={openDeleteAlert}
							/>
						))}
					</BreadcrumbList>
				</Breadcrumb>

				<WorkspaceToolbarGroup className="min-w-0 shrink-0">
					<WorkspaceItemToolbarSlot activeToolbarSlotId={toolbarSlotId ?? activeItem?.id} />
					<WorkspaceContextActions
						activeItem={activeItem}
						createParentId={createParentId}
						searchHotkey={searchHotkey}
						onCreateItem={onCreateItem}
						onSearch={openWorkspaceSearch}
						onCloseItemView={onCloseItemView}
					/>
				</WorkspaceToolbarGroup>
			</div>
			<RenameWorkspaceItemDialog
				item={renamingItem}
				onOpenChange={(open) => {
					if (!open) {
						setRenamingItem(null);
					}
				}}
			/>
			{deletingItem ? (
				<DeleteWorkspaceItemAlert
					open={deleteAlertOpen}
					item={deletingItem}
					items={workspaceItems}
					onOpenChange={setDeleteAlertOpen}
					onClosed={clearDeletingItem}
				/>
			) : null}
			{movingItem ? (
				<MoveWorkspaceItemsDialog
					open={moveDialogOpen}
					workspace={workspace}
					items={workspaceItems}
					itemIds={[movingItem.id]}
					onOpenChange={setMoveDialogOpen}
					onMoved={clearMovingItem}
				/>
			) : null}
			<WorkspaceSearchDialog
				open={searchOpen}
				items={workspaceItems}
				activeItem={activeItem}
				onOpenChange={setSearchOpen}
				onOpenItem={onNavigateToItem}
			/>
			<WorkspaceSettingsDialog
				workspace={workspace}
				capabilities={capabilities}
				open={settingsOpen}
				onOpenChange={setSettingsOpen}
			/>
			<WorkspaceShareDialog
				membershipRole={workspace.membershipRole}
				onOpenChange={setShareOpen}
				open={shareOpen}
				workspaceId={workspace.id}
				workspaceName={workspace.name}
			/>
		</>
	);
}

function WorkspaceRootActionsMenu({
	capabilities,
	onOpenSettings,
	onOpenShare,
	trigger,
}: {
	capabilities: ReturnType<typeof useWorkspaceMutationAccess>["capabilities"];
	onOpenSettings: () => void;
	onOpenShare: () => void;
	trigger: ReactElement;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger render={trigger} />
			<DropdownMenuContent align="start" className="w-52">
				{renderWorkspaceMenuActions(
					getWorkspaceRootMenuActions({
						canOpenSettings: capabilities.canMutateContent,
						onOpenSettings,
						onOpenShare,
					}),
					workspaceDropdownMenuRenderer,
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function getWorkspaceRootMenuActions(input: {
	canOpenSettings: boolean;
	onOpenSettings: () => void;
	onOpenShare: () => void;
}): WorkspaceMenuAction[] {
	return [
		{
			kind: "item",
			id: "share",
			label: "Share",
			leading: <Share2 className="size-4" />,
			onSelect: input.onOpenShare,
		},
		{
			kind: "item",
			id: "version-history",
			label: "Version history",
			leading: <Clock3 className="size-4" />,
			trailing: "Soon",
			disabled: true,
		},
		{
			kind: "item",
			id: "settings",
			label: "Settings",
			leading: <Settings className="size-4" />,
			disabled: !input.canOpenSettings,
			onSelect: input.onOpenSettings,
		},
	];
}

function WorkspaceBreadcrumbItem({
	item,
	isCurrent,
	isMobileHidden,
	onClick,
	onRenameItem,
	onMoveItem,
	onDeleteItem,
}: {
	item: WorkspaceItem;
	isCurrent: boolean;
	isMobileHidden: boolean;
	onClick: () => void;
	onRenameItem: (item: WorkspaceItem) => void;
	onMoveItem: (item: WorkspaceItem) => void;
	onDeleteItem: (item: WorkspaceItem) => void;
}) {
	const { Icon, iconClassName } = getWorkspaceItemDisplay(item);
	const mobileHiddenClassName = isMobileHidden ? "hidden sm:flex" : undefined;

	return (
		<>
			<BreadcrumbSeparator className={cn("text-muted-foreground/60", mobileHiddenClassName)} />
			<BreadcrumbItem className={cn("min-w-0", isCurrent && "flex-shrink", mobileHiddenClassName)}>
				{isCurrent ? (
					<WorkspaceItemActionsMenu
						item={item}
						align="start"
						trigger={
							<button
								type="button"
								className={breadcrumbCurrentClassName}
								aria-label={`Open actions for ${item.name}`}
							/>
						}
						triggerChildren={
							<CrumbContent
								icon={Icon}
								label={item.name}
								iconClassName={iconClassName}
								isCurrent={true}
								showDisclosure={true}
							/>
						}
						onMoveItem={onMoveItem}
						onRenameItem={onRenameItem}
						onDeleteItem={onDeleteItem}
					/>
				) : (
					<CrumbButton
						icon={Icon}
						label={item.name}
						iconClassName={iconClassName}
						isCurrent={false}
						onClick={onClick}
					/>
				)}
			</BreadcrumbItem>
		</>
	);
}

function CrumbButton({
	icon: Icon,
	label,
	iconClassName,
	hideLabelOnMobile = false,
	isCurrent,
	onClick,
}: {
	icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
	label: string;
	iconClassName?: string;
	hideLabelOnMobile?: boolean;
	isCurrent: boolean;
	onClick: () => void;
}) {
	const iconColor = iconClassName ?? "text-muted-foreground";

	if (isCurrent) {
		return (
			<BreadcrumbPage className={breadcrumbCurrentClassName}>
				<CrumbContent
					icon={Icon}
					label={label}
					hideLabelOnMobile={hideLabelOnMobile}
					iconClassName={iconColor}
					isCurrent={true}
				/>
			</BreadcrumbPage>
		);
	}

	return (
		<BreadcrumbLink
			render={
				<button
					type="button"
					className={breadcrumbLinkClassName}
					onClick={onClick}
					aria-label={`Open ${label}`}
				/>
			}
		>
			<CrumbContent
				icon={Icon}
				label={label}
				hideLabelOnMobile={hideLabelOnMobile}
				iconClassName={iconColor}
			/>
		</BreadcrumbLink>
	);
}

function CrumbContent({
	icon: Icon,
	label,
	hideLabelOnMobile = false,
	iconClassName,
	isCurrent = false,
	showDisclosure = false,
}: {
	icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
	label: string;
	hideLabelOnMobile?: boolean;
	iconClassName: string;
	isCurrent?: boolean;
	showDisclosure?: boolean;
}) {
	return (
		<>
			<Icon className={cn("size-3.5 shrink-0", iconClassName)} aria-hidden={true} />
			<CrumbLabel label={label} hideOnMobile={hideLabelOnMobile} isCurrent={isCurrent} />
			{showDisclosure ? (
				<ChevronDown className="size-3 shrink-0 text-muted-foreground" aria-hidden={true} />
			) : null}
		</>
	);
}

function CrumbLabel({
	hideOnMobile,
	isCurrent,
	label,
}: {
	hideOnMobile?: boolean;
	isCurrent: boolean;
	label: string;
}) {
	return (
		<span
			className={cn(
				"min-w-0 max-w-40 truncate sm:max-w-none",
				hideOnMobile && "hidden sm:inline",
				// Keep the active emphasis visual only so breadcrumb spacing never reflows.
				isCurrent && currentCrumbLabelClassName,
			)}
		>
			{label}
		</span>
	);
}
