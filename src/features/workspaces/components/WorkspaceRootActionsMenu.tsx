import { Download, Settings, Share2 } from "lucide-react";
import { type ReactElement, useState } from "react";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { workspaceDropdownMenuRenderer } from "#/features/workspaces/components/WorkspaceMenuRenderers";
import { WorkspaceExportDialog } from "#/features/workspaces/components/WorkspaceExportDialog";
import WorkspaceSettingsDialog from "#/features/workspaces/components/WorkspaceSettingsDialog";
import { WorkspaceShareDialog } from "#/features/workspaces/components/WorkspaceShareDialog";
import { WorkspaceToolbarIconButton } from "#/features/workspaces/components/WorkspaceToolbar";
import {
	renderWorkspaceMenuActions,
	type WorkspaceMenuAction,
} from "#/features/workspaces/components/workspace-menu-actions";
import { useWorkspaceMutationAccess } from "#/features/workspaces/components/workspace-mutation-access";
import type { WorkspaceSummary } from "#/features/workspaces/contracts";

export default function WorkspaceRootActionsMenu({
	workspace,
	trigger,
	align = "start",
	showShareButton = false,
}: {
	workspace: WorkspaceSummary;
	trigger: ReactElement;
	align?: "start" | "center" | "end";
	showShareButton?: boolean;
}) {
	const { capabilities } = useWorkspaceMutationAccess();
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [shareOpen, setShareOpen] = useState(false);
	const [exportOpen, setExportOpen] = useState(false);

	return (
		<>
			{showShareButton ? (
				<WorkspaceToolbarIconButton aria-label="Share workspace" onClick={() => setShareOpen(true)}>
					<Share2 />
				</WorkspaceToolbarIconButton>
			) : null}
			<DropdownMenu>
				<DropdownMenuTrigger render={trigger} />
				<DropdownMenuContent align={align} className="w-52">
					<DropdownMenuGroup>
						<DropdownMenuLabel className="truncate">{workspace.name}</DropdownMenuLabel>
						{renderWorkspaceMenuActions(
							getWorkspaceRootMenuActions({
								canOpenSettings: capabilities.canMutateContent,
								includeShare: !showShareButton,
								onExport: () => setExportOpen(true),
								onOpenSettings: () => setSettingsOpen(true),
								onOpenShare: () => setShareOpen(true),
							}),
							workspaceDropdownMenuRenderer,
						)}
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>
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
			<WorkspaceExportDialog onOpenChange={setExportOpen} open={exportOpen} workspace={workspace} />
		</>
	);
}

function getWorkspaceRootMenuActions(input: {
	canOpenSettings: boolean;
	includeShare: boolean;
	onExport: () => void;
	onOpenSettings: () => void;
	onOpenShare: () => void;
}): WorkspaceMenuAction[] {
	const shareAction: WorkspaceMenuAction = {
		kind: "item",
		id: "share",
		label: "Share",
		leading: <Share2 className="size-4" />,
		onSelect: input.onOpenShare,
	};

	return [
		...(input.includeShare ? [shareAction] : []),
		{
			kind: "item",
			id: "export",
			label: "Export",
			leading: <Download className="size-4" />,
			onSelect: input.onExport,
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
