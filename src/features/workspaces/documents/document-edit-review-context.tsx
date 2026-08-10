import { createContext, type ReactNode, use, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import type { DocumentEditReceiptUnavailableStatus } from "#/features/workspaces/documents/document-edit-receipt";
import { getDocumentEditReceiptReviewFn } from "#/features/workspaces/documents/document-edit-review-functions";
import type { TiptapDocumentJson } from "#/features/workspaces/documents/tiptap-document";
import { useWorkspaceLocationActions } from "#/features/workspaces/locations/workspace-location-context";

/**
 * Review belongs to the document, not to the view showing it. Tying it to a
 * view instance meant the review had to be opened after that view existed, and
 * every wherever-it-is-now question became a lifecycle problem.
 *
 * The document it was computed against travels with it. Whether an edit can
 * still be reviewed is a judgement about a moment, so it is asked once, when
 * the reader asks to see it, and never revisited behind their back.
 */
export interface ActiveDocumentEditReview {
	beforeDocument: TiptapDocumentJson;
	itemId: string;
	receiptIds: string[];
}

interface DocumentEditReviewContextValue {
	activeReview: ActiveDocumentEditReview | null;
	hideReview: () => void;
	showReview: (input: { itemId: string; receiptIds: string[] }) => Promise<void>;
	workspaceId: string;
}

const DocumentEditReviewContext = createContext<DocumentEditReviewContextValue | null>(null);

export function DocumentEditReviewProvider({
	children,
	workspaceId,
}: {
	children: ReactNode;
	workspaceId: string;
}) {
	const { reveal } = useWorkspaceLocationActions();
	const [activeReview, setActiveReview] = useState<ActiveDocumentEditReview | null>(null);
	const hideReview = useCallback(() => setActiveReview(null), []);
	const showReview = useCallback(
		async (input: { itemId: string; receiptIds: string[] }) => {
			// reveal opens the document, or focuses the tab already holding it, and
			// only fails when the item is gone.
			if (!reveal({ itemId: input.itemId, kind: "item", version: 1 })) {
				toast.error("This document no longer exists.");
				return;
			}

			const review = await getDocumentEditReceiptReviewFn({
				data: {
					itemId: input.itemId,
					receiptIds: input.receiptIds,
					workspaceId,
				},
			}).catch(() => null);

			if (!review) {
				toast.error("Could not load these changes.");
				return;
			}
			if (review.status !== "ready") {
				toast.error(unavailableReviewMessages[review.status]);
				return;
			}

			setActiveReview({
				beforeDocument: review.beforeDocument,
				itemId: input.itemId,
				receiptIds: input.receiptIds,
			});
		},
		[reveal, workspaceId],
	);
	const value = useMemo(
		() => ({ activeReview, hideReview, showReview, workspaceId }),
		[activeReview, hideReview, showReview, workspaceId],
	);

	return <DocumentEditReviewContext value={value}>{children}</DocumentEditReviewContext>;
}

export function useDocumentEditReview() {
	const value = use(DocumentEditReviewContext);
	if (!value) {
		throw new Error("Document edit review requires a workspace shell.");
	}

	return value;
}

const unavailableReviewMessages: Record<DocumentEditReceiptUnavailableStatus, string> = {
	content_changed: "The document changed after this AI edit.",
	not_found: "These changes are no longer available.",
	not_latest: "Only the latest unchanged AI edit can be reviewed.",
	reverted: "These changes were already undone.",
	review_unavailable: "Change review is unavailable for this large document.",
};
