import { ChevronDown } from "lucide-react";

import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import type { WorkspaceMembershipRole } from "#/features/workspaces/contracts";
import { workspaceRoleLabels } from "#/features/workspaces/contracts";

export function WorkspaceShareRoleMenu({
	align = "end",
	onRemove,
	onValueChange,
	removeLabel = "Remove",
	roles,
	showChevron = true,
	value,
}: {
	align?: "end" | "start";
	onRemove?: () => void;
	onValueChange: (role: WorkspaceMembershipRole) => void;
	removeLabel?: string;
	roles: WorkspaceMembershipRole[];
	showChevron?: boolean;
	value: WorkspaceMembershipRole;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="text-muted-foreground hover:text-foreground"
						onMouseDown={(event) => {
							event.preventDefault();
						}}
					/>
				}
			>
				{workspaceRoleLabels[value]}
				{showChevron ? <ChevronDown className="size-4 opacity-60" /> : null}
			</DropdownMenuTrigger>
			<DropdownMenuContent align={align} side="bottom" className="min-w-28">
				{roles.map((role) => (
					<DropdownMenuItem key={role} onClick={() => onValueChange(role)}>
						{workspaceRoleLabels[role]}
					</DropdownMenuItem>
				))}
				{onRemove ? (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem variant="destructive" onClick={onRemove}>
							{removeLabel}
						</DropdownMenuItem>
					</>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
