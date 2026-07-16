import { type ReactNode, useId, useState } from "react";

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
import { Field, FieldError, FieldGroup, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { getWorkspaceDescendantIds } from "#/features/workspaces/model/tree";
import type { WorkspaceItem } from "#/features/workspaces/model/types";
import {
	useDeleteWorkspaceItemsMutation,
	useRenameWorkspaceItemMutation,
} from "#/features/workspaces/use-workspace-kernel-items";
import { getErrorMessage } from "#/lib/error-message";

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
	// Controlled so a failed rename keeps the user's typed value in place for
	// correction/retry instead of React resetting the form back to the old name.
	const [nameDraft, setNameDraft] = useState(item.name);

	return (
		<DialogContent>
			<form
				className="grid gap-6"
				action={async () => {
					const name = nameDraft.trim();

					if (!name) {
						return;
					}

					if (name === item.name) {
						onOpenChange(false);
						return;
					}

					try {
						await renameWorkspaceItemMutation.mutateAsync({
							workspaceId: item.workspaceId,
							itemId: item.id,
							name,
						});

						onOpenChange(false);
					} catch {
						// Keep the dialog open so the error surfaces inline and the
						// user can correct the name and retry instead of losing input.
					}
				}}
			>
				<DialogHeader>
					<DialogTitle>Rename item</DialogTitle>
					<DialogDescription>Update the item name shown in this workspace.</DialogDescription>
				</DialogHeader>
				<FieldGroup>
					<Field data-invalid={renameWorkspaceItemMutation.isError || undefined}>
						<FieldLabel htmlFor={nameInputId}>Name</FieldLabel>
						<Input
							id={nameInputId}
							name="name"
							value={nameDraft}
							onChange={(event) => setNameDraft(event.target.value)}
							required
							autoFocus
							aria-invalid={renameWorkspaceItemMutation.isError || undefined}
						/>
						{renameWorkspaceItemMutation.isError ? (
							<FieldError>
								{getErrorMessage(
									renameWorkspaceItemMutation.error,
									"Unable to rename workspace item right now.",
								)}
							</FieldError>
						) : null}
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
					// Clear any prior failure so reopening starts from a clean state
					// rather than surfacing a stale error and a "Retry delete" label.
					deleteWorkspaceItemsMutation.reset();
					onClosed?.();
				}
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>

				{deleteWorkspaceItemsMutation.isError ? (
					<p role="alert" className="text-destructive text-sm">
						{getErrorMessage(
							deleteWorkspaceItemsMutation.error,
							"Unable to delete right now. Please try again.",
						)}
					</p>
				) : null}

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

							// Only close on success. On failure the mutation surfaces the
							// error inline (above) and re-enables this button so the user
							// can retry instead of being wedged with no way forward.
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
						{deleteWorkspaceItemsMutation.isError ? "Retry delete" : "Delete"}
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
