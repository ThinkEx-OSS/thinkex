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
import { getWorkspaceItemDisplay } from "#/features/workspaces/model/item-display";
import type { WorkspaceItem } from "#/features/workspaces/model/types";

interface WorkspaceMobileBreadcrumbOverflowProps {
	items: WorkspaceItem[];
	onNavigateToItem: (item: WorkspaceItem) => void;
}

export default function WorkspaceMobileBreadcrumbOverflow({
	items,
	onNavigateToItem,
}: WorkspaceMobileBreadcrumbOverflowProps) {
	if (items.length === 0) {
		return null;
	}

	return (
		<>
			<BreadcrumbSeparator className="text-muted-foreground/60 sm:hidden" />
			<BreadcrumbItem className="sm:hidden">
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<button
								type="button"
								className="flex size-7 items-center justify-center rounded-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
								aria-label="Open breadcrumb path"
							/>
						}
					>
						<BreadcrumbEllipsis className="size-7" />
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-56">
						{items.map((item) => {
							const { Icon, iconClassName, label } = getWorkspaceItemDisplay(item);

							return (
								<DropdownMenuItem key={item.id} onClick={() => onNavigateToItem(item)}>
									<span className="inline-flex size-4 items-center justify-center text-muted-foreground">
										<Icon className={iconClassName} aria-hidden="true" />
									</span>
									<span className="min-w-0 truncate">{item.name}</span>
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
