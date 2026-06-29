import { WorkspaceCardMetaRow } from "#/features/workspaces/components/workspace-card-meta-row";
import type { WorkspaceSummary } from "#/features/workspaces/contracts";
import {
	getWorkspaceCardRoleLabel,
	getWorkspaceRecencyLabel,
} from "#/features/workspaces/model/display";

interface WorkspaceCardFooterProps {
	workspace: WorkspaceSummary;
}

export function WorkspaceCardFooter({ workspace }: WorkspaceCardFooterProps) {
	return (
		<WorkspaceCardMetaRow
			leading={getWorkspaceCardRoleLabel(workspace)}
			trailing={getWorkspaceRecencyLabel(workspace)}
		/>
	);
}
