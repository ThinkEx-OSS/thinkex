import { Link } from "@tanstack/react-router";
import { Settings } from "lucide-react";

import { Card, CardHeader, CardTitle } from "#/components/ui/card";
import WorkspaceSettingsDialog from "#/features/workspaces/components/WorkspaceSettingsDialog";
import { WorkspaceToolbarIconButton } from "#/features/workspaces/components/WorkspaceToolbar";
import { WorkspaceCardFooter } from "#/features/workspaces/components/workspace-card-footer";
import type { WorkspaceSummary } from "#/features/workspaces/contracts";
import { getWorkspaceDisplay } from "#/features/workspaces/model/display";
import { getWorkspaceThemeArt } from "#/features/workspaces/model/workspace-themes";
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
	const themeArt = getWorkspaceThemeArt(workspace);
	const capabilities = getWorkspaceMemberCapabilities(workspace.membershipRole);

	return (
		<Card
			className={cn(
				"group/card relative gap-0 overflow-hidden bg-card py-0 shadow-xs ring-1 ring-foreground/10 transition-[background-color,box-shadow] hover:bg-accent hover:shadow-md dark:hover:bg-accent/60",
				className,
			)}
		>
			<Link
				to="/workspaces/$workspaceId"
				params={{ workspaceId: workspace.id }}
				search={search ?? { tab: undefined, view: undefined }}
				preload="intent"
				className="flex w-full cursor-pointer flex-col items-stretch rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
			>
				{themeArt ? (
					// Held slightly back so the theme art reads as chrome rather than
					// competing with the workspace name. It composites onto the card
					// surface, so it softens toward paper in light mode and toward
					// the dark card in dark mode without needing a second treatment.
					<img
						src={themeArt}
						alt=""
						loading="lazy"
						decoding="async"
						// The tint underneath is the placeholder: the workspace colour was
						// derived from this artwork's own background field, so the band
						// starts in roughly the right hue and the illustration resolves
						// onto it instead of popping out of an empty rectangle.
						className={cn(
							"aspect-[5/2] w-full object-cover opacity-85 transition-[filter,opacity] duration-200 group-hover/card:opacity-100 group-hover/card:brightness-90",
							color.bg,
						)}
					/>
				) : (
					<div
						className={cn(
							"flex aspect-[5/2] w-full items-center justify-center transition-[filter] duration-200 group-hover/card:brightness-90",
							color.bg,
						)}
					>
						<Icon className={cn("size-11", color.text)} strokeWidth={1.75} />
					</div>
				)}

				<CardHeader className="min-w-0 flex-1 gap-1 px-3 py-2.5 sm:gap-2 sm:px-4 sm:py-3">
					<CardTitle className="truncate">{workspace.name}</CardTitle>
					<WorkspaceCardFooter workspace={workspace} />
				</CardHeader>
			</Link>

			{capabilities.canMutateContent ? (
				<div
					className={cn(
						"pointer-events-auto absolute top-2 right-2 z-10 opacity-100 transition-opacity sm:pointer-events-none sm:opacity-0",
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
								// Over artwork the ghost button has no legible ground, so it takes
								// the same near-opaque + blurred treatment the item cards already
								// use for controls that sit on a preview.
								className={cn(
									themeArt &&
										"border-border/80 bg-card/95 backdrop-blur-md hover:border-foreground/30 hover:bg-secondary dark:border-white/15 dark:bg-card/90 dark:hover:border-white/35",
								)}
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
