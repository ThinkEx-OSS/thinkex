import { Plus } from "lucide-react";

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
import type { WorkspaceCreateItemRequest } from "#/features/workspaces/components/workspace-presentation-model";
import {
	applyWorkspaceMenuReadOnly,
	renderWorkspaceMenuActions,
	type WorkspaceMenuRenderer,
} from "#/features/workspaces/components/workspace-menu-actions";
import { useWorkspaceMutationAccess } from "#/features/workspaces/components/workspace-mutation-access";
import { useWorkspaceRecording } from "#/features/workspaces/components/WorkspaceRecordingProvider";
import {
	WorkspaceViewerMenuNotice,
	WorkspaceViewerRoleBadge,
} from "#/features/workspaces/components/workspace-viewer-ui";
import { workspaceCreateMenuActionGroups } from "#/features/workspaces/model/item-display";

interface WorkspaceCreateMenuProps {
	parentId: string | null;
	onCreateItem: (input: WorkspaceCreateItemRequest) => void;
}

export default function WorkspaceCreateMenu({ parentId, onCreateItem }: WorkspaceCreateMenuProps) {
	const { capabilities } = useWorkspaceMutationAccess();

	if (!capabilities.canMutateContent) {
		return <WorkspaceViewerRoleBadge />;
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger render={<WorkspaceToolbarTextButton />}>
				<Plus className="size-4.5" />
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
	const { requestRecording } = useWorkspaceRecording();
	const actions = getWorkspaceCreateMenuActions({
		parentId,
		onCreateItem,
		onUploadFile: requestFileUpload,
		onRecord: requestRecording,
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
	onRecord,
}: WorkspaceCreateMenuProps & {
	onUploadFile: (parentId: string | null) => void;
	onRecord: (parentId: string | null) => void;
}) {
	return workspaceCreateMenuActionGroups.flatMap((group, index) => [
		...(index > 0 ? [{ kind: "separator" as const, id: `create-${group.id}` }] : []),
		...group.actions.map((action) => ({
			kind: "item" as const,
			id: action.kind === "item" ? action.type : action.id,
			label: action.label,
			leading: <action.Icon className={`size-4 ${action.iconClassName}`} />,
			...(action.kind === "item"
				? { onSelect: () => onCreateItem({ type: action.type, parentId }) }
				: action.kind === "recording"
					? { onSelect: () => onRecord(parentId) }
					: { onSelect: () => onUploadFile(parentId) }),
		})),
	]);
}
