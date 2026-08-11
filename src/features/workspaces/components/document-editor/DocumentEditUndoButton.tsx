import { useMutation } from "@tanstack/react-query";
import { LoaderCircle, Undo2 } from "lucide-react";
import { useState } from "react";
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
import type { DocumentEditReceiptUnavailableStatus } from "#/features/workspaces/documents/document-edit-receipt";
import { useDocumentEditReview } from "#/features/workspaces/documents/document-edit-review-context";
import { undoDocumentEditReceiptFn } from "#/features/workspaces/documents/document-edit-review-functions";

/**
 * Undo, with a confirmation step because it throws away work the reader may
 * have asked for and only skimmed.
 */
export function DocumentEditUndoButton({
	className,
	itemId,
	receiptIds,
	workspaceId,
}: {
	className?: string;
	itemId: string;
	receiptIds: string[];
	workspaceId: string;
}) {
	const [isConfirming, setIsConfirming] = useState(false);
	const { hideReview } = useDocumentEditReview();
	const undoMutation = useMutation({
		mutationFn: () =>
			undoDocumentEditReceiptFn({
				data: { itemId, receiptIds, workspaceId },
			}),
		onSuccess: (result) => {
			// Every outcome ends the review: it either just undid the changes, or
			// told us they no longer describe the document. Leaving the marks up
			// after that would be showing a diff we have just been told is wrong.
			hideReview();

			if (result.status === "undone") {
				toast.success("Changes undone.");
			} else {
				toast.error(undoUnavailableMessages[result.status]);
			}
		},
		onError: (error) => {
			toast.error(error instanceof Error ? error.message : "Could not undo these changes.");
		},
	});

	return (
		<>
			<Button
				type="button"
				variant="outline"
				size="sm"
				className={className}
				disabled={undoMutation.isPending}
				onClick={() => setIsConfirming(true)}
			>
				{undoMutation.isPending ? (
					<LoaderCircle className="animate-spin" aria-hidden="true" />
				) : (
					<Undo2 aria-hidden="true" />
				)}
				Undo
			</Button>
			<AlertDialog open={isConfirming} onOpenChange={setIsConfirming}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Undo these changes?</AlertDialogTitle>
						<AlertDialogDescription>
							The document goes back to how it was before the assistant edited it.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Keep changes</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={() => {
								setIsConfirming(false);
								undoMutation.mutate();
							}}
						>
							Undo
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

const undoUnavailableMessages: Record<DocumentEditReceiptUnavailableStatus, string> = {
	content_changed: "This document changed after these edits, so they were not undone.",
	not_found: "These changes are no longer available.",
	not_latest: "Undo the newer changes first.",
	reverted: "These changes were already undone.",
	review_unavailable: "Undo is unavailable for this large document.",
};
