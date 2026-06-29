import { Eye } from "lucide-react";

import { Badge } from "#/components/ui/badge";
import {
	ContextMenuGroup,
	ContextMenuLabel,
	ContextMenuSeparator,
} from "#/components/ui/context-menu";
import {
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuSeparator,
} from "#/components/ui/dropdown-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "#/components/ui/hover-card";
import { workspaceRoleLabels } from "#/features/workspaces/contracts";

export const workspaceViewerHovercardTitle = "View-only access";
export const workspaceViewerHovercardDescription =
	"You can browse, open items, and use AI chat. Creating, editing, moving, and deleting require editor access or higher.";

const workspaceViewerRoleBadgeClassName =
	"h-8.5 w-8.5 cursor-default justify-center rounded-full px-0 text-sm sm:w-auto sm:px-2.5 [&>svg]:!size-4";

const workspaceViewerMenuNoticeText = `You're a ${workspaceRoleLabels.viewer.toLowerCase()}`;

const workspaceViewerMenuNoticeComponents = {
	dropdown: {
		Group: DropdownMenuGroup,
		Label: DropdownMenuLabel,
		Separator: DropdownMenuSeparator,
	},
	context: {
		Group: ContextMenuGroup,
		Label: ContextMenuLabel,
		Separator: ContextMenuSeparator,
	},
} as const;

export function WorkspaceViewerRoleBadge() {
	return (
		<div className="inline-flex items-center">
			<HoverCard>
				<HoverCardTrigger
					delay={250}
					render={
						<Badge
							variant="secondary"
							className={workspaceViewerRoleBadgeClassName}
							render={<button type="button" aria-label={workspaceViewerHovercardTitle} />}
						/>
					}
				>
					<Eye aria-hidden="true" />
					<span className="hidden sm:inline">{workspaceRoleLabels.viewer}</span>
				</HoverCardTrigger>
				<HoverCardContent align="end" className="w-64 space-y-1.5">
					<p className="text-sm font-medium">{workspaceViewerHovercardTitle}</p>
					<p className="text-muted-foreground text-xs leading-relaxed">
						{workspaceViewerHovercardDescription}
					</p>
				</HoverCardContent>
			</HoverCard>
		</div>
	);
}

export function WorkspaceViewerMenuNotice({
	menuKind = "dropdown",
}: {
	menuKind?: keyof typeof workspaceViewerMenuNoticeComponents;
}) {
	const { Group, Label, Separator } = workspaceViewerMenuNoticeComponents[menuKind];

	return (
		<>
			<Group>
				<Label className="font-normal leading-snug">{workspaceViewerMenuNoticeText}</Label>
			</Group>
			<Separator />
		</>
	);
}
