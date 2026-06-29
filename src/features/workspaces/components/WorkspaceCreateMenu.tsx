import { FilePlus2 } from "lucide-react";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { useWorkspaceFileIntake } from "#/features/workspaces/components/WorkspaceFileIntakeProvider";
import {
	workspaceContextMenuRenderer,
	workspaceDropdownMenuRenderer,
} from "#/features/workspaces/components/WorkspaceMenuRenderers";
import { WorkspaceToolbarTextButton } from "#/features/workspaces/components/WorkspaceToolbar";
import {
	applyWorkspaceMenuReadOnly,
	renderWorkspaceMenuActions,
	type WorkspaceMenuRenderer,
} from "#/features/workspaces/components/workspace-menu-actions";
import { useWorkspaceMutationAccess } from "#/features/workspaces/components/workspace-mutation-access";
import {
	WorkspaceViewerMenuNotice,
	WorkspaceViewerRoleBadge,
} from "#/features/workspaces/components/workspace-viewer-ui";
import type { WorkspaceItemType } from "#/features/workspaces/contracts";
import {
	workspaceItemAcquisitionActions,
	workspaceItemLearnCreateActions,
	workspaceItemPrimaryCreateActions,
} from "#/features/workspaces/model/item-display";

interface WorkspaceCreateMenuProps {
	parentId: string | null;
	onCreateItem: (input: { type: WorkspaceItemType; parentId: string | null }) => void;
}

export default function WorkspaceCreateMenu({ parentId, onCreateItem }: WorkspaceCreateMenuProps) {
	const { capabilities } = useWorkspaceMutationAccess();

	if (!capabilities.canMutateContent) {
		return <WorkspaceViewerRoleBadge />;
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger render={<WorkspaceToolbarTextButton />}>
				<FilePlus2 />
				<span className="hidden sm:inline">New</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56">
				<WorkspaceCreateMenuContent parentId={parentId} onCreateItem={onCreateItem} />
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function WorkspaceCreateMenuContent({
	parentId,
	onCreateItem,
	renderer = workspaceDropdownMenuRenderer,
	menuKind = "dropdown",
}: WorkspaceCreateMenuProps & {
	renderer?: WorkspaceMenuRenderer;
	menuKind?: "dropdown" | "context";
}) {
	const { capabilities } = useWorkspaceMutationAccess();
	const readOnly = !capabilities.canMutateContent;
	const { requestFileUpload } = useWorkspaceFileIntake();
	const actions = getWorkspaceCreateMenuActions({
		parentId,
		onCreateItem,
		onUploadFile: requestFileUpload,
	});
	const menuActions = readOnly ? applyWorkspaceMenuReadOnly(actions) : actions;

	return (
		<>
			{readOnly ? <WorkspaceViewerMenuNotice menuKind={menuKind} /> : null}
			{renderWorkspaceMenuActions(menuActions, renderer)}
		</>
	);
}

export function WorkspaceCreateContextMenuContent(props: WorkspaceCreateMenuProps) {
	return (
		<WorkspaceCreateMenuContent
			{...props}
			menuKind="context"
			renderer={workspaceContextMenuRenderer}
		/>
	);
}

function getWorkspaceCreateMenuActions({
	parentId,
	onCreateItem,
	onUploadFile,
}: WorkspaceCreateMenuProps & {
	onUploadFile: (parentId: string | null) => void;
}) {
	return [
		...workspaceItemPrimaryCreateActions.map(({ type, label, Icon, iconClassName }) => ({
			kind: "item" as const,
			id: type,
			label,
			leading: <Icon className={`size-4 ${iconClassName}`} />,
			onSelect: () => onCreateItem({ type, parentId }),
		})),
		...workspaceItemAcquisitionActions.map(
			({ id, label, description, Icon, iconClassName, disabled }) => ({
				kind: "item" as const,
				id,
				label,
				trailing: description,
				disabled,
				leading: <Icon className={`size-4 ${iconClassName}`} />,
				onSelect: id === "upload-file" ? () => onUploadFile(parentId) : undefined,
			}),
		),
		...workspaceItemLearnCreateActions.map(({ type, label, Icon, iconClassName }) => ({
			kind: "item" as const,
			id: type,
			label,
			trailing: "Soon",
			disabled: true,
			leading: <Icon className={`size-4 ${iconClassName}`} />,
			onSelect: () => onCreateItem({ type, parentId }),
		})),
	];
}
