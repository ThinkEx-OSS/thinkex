import {
	BreadcrumbEllipsis,
	BreadcrumbItem,
	BreadcrumbSeparator,
} from "#/components/ui/breadcrumb";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import { getWorkspaceItemDisplay } from "#/features/workspaces/model/item-display";
import type { WorkspaceItem } from "#/features/workspaces/contracts";
import { cn } from "#/lib/utils";

interface WorkspaceBreadcrumbOverflowProps {
	items: WorkspaceItem[];
	className?: string;
	onNavigateToItem: (item: WorkspaceItem) => void;
}

/** Crumbs hidden from the bar, reachable through a bare "…" menu. */
export default function WorkspaceBreadcrumbOverflow({
	items,
	className,
	onNavigateToItem,
}: WorkspaceBreadcrumbOverflowProps) {
	if (items.length === 0) {
		return null;
	}

	return (
		<>
			<BreadcrumbSeparator className={cn("text-muted-foreground/60", className)} />
			<BreadcrumbItem className={className}>
				<DropdownMenu>
					<Tooltip>
						<TooltipTrigger
							render={
								<DropdownMenuTrigger
									render={
										<button
											type="button"
											className="flex size-7 items-center justify-center rounded-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
											aria-label="Show path"
										/>
									}
								>
									<BreadcrumbEllipsis className="size-7" />
								</DropdownMenuTrigger>
							}
						/>
						<TooltipContent>Show path</TooltipContent>
					</Tooltip>
					<DropdownMenuContent align="start" className="w-56">
						{items.map((item) => {
							const { Icon, iconClassName, label } = getWorkspaceItemDisplay(item);

							return (
								<DropdownMenuItem key={item.id} onClick={() => onNavigateToItem(item)}>
									<span className="inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground">
										<Icon className={iconClassName} aria-hidden="true" />
									</span>
									<span className="min-w-0 flex-1 truncate">{item.name}</span>
									<span className="ml-auto shrink-0 text-muted-foreground text-xs">{label}</span>
								</DropdownMenuItem>
							);
						})}
					</DropdownMenuContent>
				</DropdownMenu>
			</BreadcrumbItem>
		</>
	);
}
