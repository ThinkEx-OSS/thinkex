import { Check, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { getWorkspaceItemDisplay } from "#/features/workspaces/model/item-display";
import type { WorkspaceItemTreePickerNode } from "#/features/workspaces/model/workspace-item-tree-picker";
import { cn } from "#/lib/utils";

interface WorkspaceItemTreePickerDialogProps {
	open: boolean;
	title: string;
	nodes: readonly WorkspaceItemTreePickerNode[];
	selectedValue: string | null;
	rootIcon: LucideIcon;
	rootIconClassName: string;
	confirmLabel: string;
	confirmDisabled?: boolean;
	confirming?: boolean;
	emptyMessage?: string;
	footerStart?: ReactNode;
	onOpenChange: (open: boolean) => void;
	onSelectedValueChange: (value: string | null) => void;
	onConfirm: () => void;
}

export function WorkspaceItemTreePickerDialog({
	open,
	title,
	nodes,
	selectedValue,
	rootIcon,
	rootIconClassName,
	confirmLabel,
	confirmDisabled = false,
	confirming = false,
	emptyMessage = "No folders.",
	footerStart,
	onOpenChange,
	onSelectedValueChange,
	onConfirm,
}: WorkspaceItemTreePickerDialogProps) {
	const rows = getWorkspaceItemTreePickerRows(nodes);
	const hasFooterStart = footerStart !== undefined && footerStart !== null;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
				</DialogHeader>

				<ul
					className="flex max-h-80 flex-col gap-1 overflow-y-auto rounded-md border p-1"
					aria-label={title}
				>
					{rows.length > 0 ? (
						rows.map((node) => (
							<WorkspaceItemTreePickerRow
								key={node.id}
								node={node}
								rootIcon={rootIcon}
								rootIconClassName={rootIconClassName}
								selected={node.value === selectedValue}
								onSelect={() => onSelectedValueChange(node.value)}
							/>
						))
					) : (
						<li className="px-3 py-8 text-center text-muted-foreground text-sm">{emptyMessage}</li>
					)}
				</ul>

				<DialogFooter className={cn(hasFooterStart && "items-center sm:justify-between")}>
					{hasFooterStart ? <div className="min-w-0">{footerStart}</div> : null}
					<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button type="button" disabled={confirmDisabled || confirming} onClick={onConfirm}>
							{confirmLabel}
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
function WorkspaceItemTreePickerRow({
	node,
	rootIcon,
	rootIconClassName,
	selected,
	onSelect,
}: {
	node: WorkspaceItemTreePickerNode;
	rootIcon: LucideIcon;
	rootIconClassName: string;
	selected: boolean;
	onSelect: () => void;
}) {
	const itemDisplay = node.item ? getWorkspaceItemDisplay(node.item) : null;
	const Icon = itemDisplay?.Icon ?? rootIcon;
	const iconClassName = itemDisplay?.iconClassName ?? rootIconClassName;

	return (
		<li className="flex items-center" style={{ paddingLeft: node.depth * 14 }}>
			<button
				type="button"
				className={cn(
					"flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-transparent px-2 text-left text-sm outline-none transition-[background-color,border-color,color,box-shadow] hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 dark:hover:bg-accent/60",
					selected && "border-info/30 bg-info/10 text-foreground shadow-xs ring-1 ring-info/15",
				)}
				onClick={onSelect}
				aria-pressed={selected}
			>
				<Icon
					className={cn("size-4 shrink-0", iconClassName, selected && "text-info")}
					aria-hidden="true"
				/>
				<span className="min-w-0 flex-1 truncate">{node.label}</span>
				{selected ? <Check className="size-4 shrink-0 text-info" aria-hidden="true" /> : null}
			</button>
		</li>
	);
}

function getWorkspaceItemTreePickerRows(nodes: readonly WorkspaceItemTreePickerNode[]) {
	const rows: WorkspaceItemTreePickerNode[] = [];

	for (const node of nodes) {
		rows.push(node);
		rows.push(...getWorkspaceItemTreePickerRows(node.children));
	}

	return rows;
}
