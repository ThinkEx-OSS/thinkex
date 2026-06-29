import { Link } from "@tanstack/react-router";
import { Settings } from "lucide-react";

import { Card, CardHeader, CardTitle } from "#/components/ui/card";
import WorkspaceSettingsDialog from "#/features/workspaces/components/WorkspaceSettingsDialog";
import { WorkspaceToolbarIconButton } from "#/features/workspaces/components/WorkspaceToolbar";
import { WorkspaceCardFooter } from "#/features/workspaces/components/workspace-card-footer";
import type { WorkspaceSummary } from "#/features/workspaces/contracts";
import { getWorkspaceDisplay } from "#/features/workspaces/model/display";
import { getWorkspaceMemberCapabilities } from "#/features/workspaces/workspace-member-capabilities";
import { cn } from "#/lib/utils";

interface WorkspaceCardSearch {
	tab: string | undefined;
	view: string | undefined;
}

interface WorkspaceCardProps {
	workspace: WorkspaceSummary;
	className?: string;
	search?: WorkspaceCardSearch;
}

export default function WorkspaceCard({ workspace, className, search }: WorkspaceCardProps) {
	const { Icon, color } = getWorkspaceDisplay(workspace);
	const capabilities = getWorkspaceMemberCapabilities(workspace.membershipRole);

	return (
		<Card
			className={cn(
				"group/card relative gap-0 overflow-hidden py-0 transition-[background-color,box-shadow] hover:bg-accent hover:shadow-md dark:hover:bg-accent/60",
				className,
			)}
		>
			<Link
				to="/workspaces/$workspaceId"
				params={{ workspaceId: workspace.id }}
				search={search ?? { tab: undefined, view: undefined }}
				preload="intent"
				className="flex w-full cursor-pointer flex-col rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
			>
				<div
					className={cn(
						"flex aspect-[5/2] items-center justify-center transition-[filter] duration-200 group-hover/card:brightness-90",
						color.bg,
					)}
				>
					<Icon className={cn("size-11", color.text)} strokeWidth={1.75} />
				</div>

				<CardHeader className="gap-2 px-4 py-3">
					<CardTitle className="truncate">{workspace.name}</CardTitle>
					<WorkspaceCardFooter workspace={workspace} />
				</CardHeader>
			</Link>

			{capabilities.canMutateContent ? (
				<div
					className={cn(
						"pointer-events-none absolute top-2 right-2 z-10 opacity-0 transition-opacity",
						"group-hover/card:pointer-events-auto group-hover/card:opacity-100",
						"group-focus-within/card:pointer-events-auto group-focus-within/card:opacity-100",
					)}
				>
					<WorkspaceSettingsDialog
						capabilities={capabilities}
						workspace={workspace}
						trigger={
							<WorkspaceToolbarIconButton
								aria-label={`Open settings for ${workspace.name}`}
								onClick={(event) => {
									event.stopPropagation();
								}}
							>
								<Settings />
							</WorkspaceToolbarIconButton>
						}
					/>
				</div>
			) : null}
		</Card>
	);
}
