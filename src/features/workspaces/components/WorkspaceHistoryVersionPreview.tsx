import type { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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
import { useWorkspaceMutationAccess } from "#/features/workspaces/components/workspace-mutation-access";
import {
	DocumentEditReviewExtension,
	hideDocumentEditReview,
	showDocumentEditReview,
} from "#/features/workspaces/documents/document-edit-review-extension";
import {
	createInitialTiptapDocumentJson,
	parseTiptapDocumentJson,
	type TiptapDocumentJson,
} from "#/features/workspaces/documents/tiptap-document";
import { getTiptapDocumentBaseExtensions } from "#/features/workspaces/documents/tiptap-extensions";
import {
	getWorkspaceHistoryVersionFn,
	restoreWorkspaceHistoryVersionFn,
} from "#/features/workspaces/history/workspace-history-functions";

export function WorkspaceHistoryVersionPreview({
	actorName,
	createdAt,
	itemId,
	itemName,
	onRestored,
	versionId,
	workspaceId,
}: {
	actorName: string;
	createdAt: string;
	itemId: string;
	itemName: string;
	onRestored: () => void;
	versionId: string;
	workspaceId: string;
}) {
	const { capabilities } = useWorkspaceMutationAccess();
	const queryClient = useQueryClient();
	const [isConfirmingRestore, setIsConfirmingRestore] = useState(false);
	const versionQuery = useQuery({
		queryFn: () => getWorkspaceHistoryVersionFn({ data: { itemId, versionId, workspaceId } }),
		queryKey: ["workspace-history-version", workspaceId, itemId, versionId],
		retry: false,
	});
	const restoreMutation = useMutation({
		mutationFn: () =>
			restoreWorkspaceHistoryVersionFn({ data: { itemId, versionId, workspaceId } }),
		onError: (error) => {
			toast.error(error instanceof Error ? error.message : "Could not restore this version.");
		},
		onSuccess: async (result) => {
			if (result.status !== "undone") {
				toast.error("This version could not be restored.");
				return;
			}
			await queryClient.invalidateQueries({ queryKey: ["workspace-history", workspaceId] });
			toast.success("Version restored.");
			onRestored();
		},
	});
	const version = versionQuery.data && "content" in versionQuery.data ? versionQuery.data : null;
	const canRestore = capabilities.canMutateContent && version?.canRestore === true;

	return (
		<>
			<header className="shrink-0 border-b px-6 py-5">
				<h3 className="truncate font-semibold text-lg">{itemName}</h3>
				<p className="mt-1 text-muted-foreground text-sm">
					Changed by {actorName} · {new Date(createdAt).toLocaleString()}
				</p>
			</header>
			<div className="min-h-0 flex-1 overflow-y-auto px-6 py-2">
				{versionQuery.isPending ? (
					<div className="flex items-center justify-center gap-2 py-16 text-muted-foreground text-sm">
						<LoaderCircle className="size-4 animate-spin" /> Loading version…
					</div>
				) : versionQuery.isError || !version ? (
					<div className="py-16 text-center text-destructive text-sm">
						This version is unavailable.
					</div>
				) : version.itemType !== "document" ? (
					<div className="py-16 text-center text-muted-foreground text-sm">
						Preview is not available for this item type yet.
					</div>
				) : (
					<DocumentVersionDiff
						afterDocument={parseTiptapDocumentJson(version.content)}
						beforeDocument={
							version.beforeContent
								? parseTiptapDocumentJson(version.beforeContent)
								: createInitialTiptapDocumentJson()
						}
					/>
				)}
			</div>
			<footer className="flex shrink-0 items-center justify-between gap-4 border-t bg-dialog-footer px-6 py-4">
				<p className="text-muted-foreground text-xs">
					{version && !version.canRestore
						? "Deleted items cannot be restored yet."
						: "Green is added; red is removed."}
				</p>
				<Button
					type="button"
					variant="outline"
					disabled={!canRestore || restoreMutation.isPending}
					onClick={() => setIsConfirmingRestore(true)}
				>
					{restoreMutation.isPending ? (
						<LoaderCircle className="size-4 animate-spin" />
					) : (
						<RotateCcw className="size-4" />
					)}
					Restore this version
				</Button>
			</footer>
			<AlertDialog open={isConfirmingRestore} onOpenChange={setIsConfirmingRestore}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Restore this version?</AlertDialogTitle>
						<AlertDialogDescription>
							The current document stays in history, and this version becomes the latest one.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								setIsConfirmingRestore(false);
								restoreMutation.mutate();
							}}
						>
							Restore
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

function DocumentVersionDiff({
	afterDocument,
	beforeDocument,
}: {
	afterDocument: TiptapDocumentJson;
	beforeDocument: TiptapDocumentJson;
}) {
	const editor = useEditor({
		content: afterDocument as JSONContent,
		editable: false,
		editorProps: {
			attributes: {
				"aria-label": "Historical document changes",
				class: "workspace-document-prose min-h-full py-4 outline-none",
			},
		},
		extensions: [...getTiptapDocumentBaseExtensions(), DocumentEditReviewExtension],
		immediatelyRender: false,
	});

	useEffect(() => {
		if (!editor) return;
		showDocumentEditReview(editor, beforeDocument);
		return () => hideDocumentEditReview(editor);
	}, [beforeDocument, editor]);

	return <EditorContent editor={editor} />;
}
