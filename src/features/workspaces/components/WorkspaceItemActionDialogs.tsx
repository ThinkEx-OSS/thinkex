import { type ReactNode, useId } from "react";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { getWorkspaceDescendantIds } from "#/features/workspaces/model/tree";
import type { WorkspaceItem } from "#/features/workspaces/model/types";
import {
	useDeleteWorkspaceItemsMutation,
	useRenameWorkspaceItemMutation,
} from "#/features/workspaces/use-workspace-kernel-items";

export function RenameWorkspaceItemDialog({
	item,
	onOpenChange,
}: {
	item: WorkspaceItem | null;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<Dialog open={Boolean(item)} onOpenChange={onOpenChange}>
			{item ? (
				<RenameWorkspaceItemDialogContent key={item.id} item={item} onOpenChange={onOpenChange} />
			) : null}
		</Dialog>
	);
}

function RenameWorkspaceItemDialogContent({
	item,
	onOpenChange,
}: {
	item: WorkspaceItem;
	onOpenChange: (open: boolean) => void;
}) {
	const nameInputId = useId();
	const renameWorkspaceItemMutation = useRenameWorkspaceItemMutation();

	return (
		<DialogContent>
			<form
				className="grid gap-6"
				action={(formData) => {
					const rawName = formData.get("name");
					const name = (typeof rawName === "string" ? rawName : "").trim();

					if (!name) {
						return;
					}

					if (name !== item.name) {
						renameWorkspaceItemMutation.mutate({
							workspaceId: item.workspaceId,
							itemId: item.id,
							name,
						});
					}

					onOpenChange(false);
				}}
			>
				<DialogHeader>
					<DialogTitle>Rename item</DialogTitle>
					<DialogDescription>Update the item name shown in this workspace.</DialogDescription>
				</DialogHeader>
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor={nameInputId}>Name</FieldLabel>
						<Input id={nameInputId} name="name" defaultValue={item.name} required autoFocus />
					</Field>
				</FieldGroup>
				<DialogFooter>
					<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button type="submit" disabled={renameWorkspaceItemMutation.isPending}>
						Save
					</Button>
				</DialogFooter>
			</form>
		</DialogContent>
	);
}

export function DeleteWorkspaceItemsAlert({
	open,
	workspaceId,
	itemIds,
	title,
	description,
	onOpenChange,
	onDeleted,
	onClosed,
}: {
	open: boolean;
	workspaceId: string;
	itemIds: string[];
	title: string;
	description: ReactNode;
	onOpenChange: (open: boolean) => void;
	onDeleted?: () => void;
	onClosed?: () => void;
}) {
	const deleteWorkspaceItemsMutation = useDeleteWorkspaceItemsMutation();

	return (
		<AlertDialog
			open={open}
			onOpenChange={onOpenChange}
			onOpenChangeComplete={(nextOpen) => {
				if (!nextOpen) {
					onClosed?.();
				}
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>

				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						variant="destructive"
						disabled={itemIds.length === 0 || deleteWorkspaceItemsMutation.isPending}
						onClick={(event) => {
							event.preventDefault();

							if (itemIds.length === 0) {
								return;
							}

							deleteWorkspaceItemsMutation.mutate(
								{
									workspaceId,
									itemIds,
								},
								{
									onSuccess: () => {
										onDeleted?.();
										onOpenChange(false);
									},
								},
							);
						}}
					>
						Delete
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

export function DeleteWorkspaceItemAlert({
	open,
	item,
	items,
	onOpenChange,
	onClosed,
}: {
	open: boolean;
	item: WorkspaceItem;
	items: WorkspaceItem[];
	onOpenChange: (open: boolean) => void;
	onClosed: () => void;
}) {
	return (
		<DeleteWorkspaceItemsAlert
			open={open}
			workspaceId={item.workspaceId}
			itemIds={[item.id]}
			title={`Delete ${item.type === "folder" ? "folder" : "item"}?`}
			description={<WorkspaceDeleteItemDescription item={item} items={items} />}
			onOpenChange={onOpenChange}
			onClosed={onClosed}
		/>
	);
}

function WorkspaceDeleteItemDescription({
	item,
	items,
}: {
	item: WorkspaceItem;
	items: WorkspaceItem[];
}) {
	const descendantCount = getWorkspaceDescendantIds(items, item.id).length;
	const isFolderWithChildren = item.type === "folder" && descendantCount > 0;

	return (
		<>
			This cannot be undone. "{item.name}" will be removed from the workspace.
			{isFolderWithChildren
				? ` This also deletes ${descendantCount} nested ${
						descendantCount === 1 ? "item" : "items"
					}.`
				: ""}
		</>
	);
}

export function WorkspaceDeleteSelectedItemsDescription({
	selectedCount,
}: {
	selectedCount: number;
}) {
	const itemLabel = selectedCount === 1 ? "item" : "items";

	return (
		<>
			This cannot be undone. {selectedCount} selected {itemLabel} will be removed from the
			workspace. Anything inside selected folders will also be deleted.
		</>
	);
}
