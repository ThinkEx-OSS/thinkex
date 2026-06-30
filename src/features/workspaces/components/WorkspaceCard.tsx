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
				"group/card relative gap-0 overflow-hidden bg-muted/35 py-0 shadow-none ring-0 transition-[background-color,box-shadow] hover:bg-muted/45 sm:bg-card sm:shadow-xs sm:ring-1 sm:ring-foreground/10 sm:hover:bg-accent sm:hover:shadow-md dark:bg-muted/20 dark:hover:bg-muted/25 sm:dark:bg-card sm:dark:hover:bg-accent/60",
				className,
			)}
		>
			<Link
				to="/workspaces/$workspaceId"
				params={{ workspaceId: workspace.id }}
				search={search ?? { tab: undefined, view: undefined }}
				preload="intent"
				className="flex w-full cursor-pointer flex-row items-center rounded-xl pr-11 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:flex-col sm:items-stretch sm:pr-0"
			>
				<div className="flex size-14 shrink-0 items-center justify-center sm:hidden">
					<div className={cn("flex size-9 items-center justify-center rounded-md", color.surface)}>
						<Icon className={cn("size-5", color.text)} strokeWidth={1.75} />
					</div>
				</div>

				<div
					className={cn(
						"hidden aspect-[5/2] w-full items-center justify-center transition-[filter] duration-200 group-hover/card:brightness-90 sm:flex",
						color.bg,
					)}
				>
					<Icon className={cn("size-11", color.text)} strokeWidth={1.75} />
				</div>

				<CardHeader className="min-w-0 flex-1 gap-1 px-3 py-2.5 sm:gap-2 sm:px-4 sm:py-3">
					<CardTitle className="truncate">{workspace.name}</CardTitle>
					<WorkspaceCardFooter workspace={workspace} />
				</CardHeader>
			</Link>

			{capabilities.canMutateContent ? (
				<div
					className={cn(
						"pointer-events-auto absolute top-1/2 right-2 z-10 -translate-y-1/2 opacity-100 transition-opacity sm:pointer-events-none sm:top-2 sm:translate-y-0 sm:opacity-0",
						"sm:group-hover/card:pointer-events-auto sm:group-hover/card:opacity-100",
						"sm:group-focus-within/card:pointer-events-auto sm:group-focus-within/card:opacity-100",
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
