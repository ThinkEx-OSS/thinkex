import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
	getFlashcardViewerFn,
	recordFlashcardStudyRatingFn,
	resetFlashcardStudyProgressFn,
} from "#/features/workspaces/flashcards/flashcard-functions";
import {
	applyFlashcardStudyRating,
	createEmptyFlashcardStudyState,
	type FlashcardStudyRating,
} from "#/features/workspaces/flashcards/flashcard-study-state";

export function flashcardViewerQueryOptions(input: {
	itemId: string;
	updatedAt: string;
	workspaceId: string;
}) {
	return queryOptions({
		queryKey: ["workspace-flashcards", input.workspaceId, input.itemId, input.updatedAt],
		queryFn: () =>
			getFlashcardViewerFn({
				data: { itemId: input.itemId, workspaceId: input.workspaceId },
			}),
	});
}

export function useResetFlashcardStudyProgress(input: {
	itemId: string;
	updatedAt: string;
	workspaceId: string;
}) {
	const queryClient = useQueryClient();
	const viewerQuery = flashcardViewerQueryOptions(input);
	return useMutation({
		scope: { id: `flashcard-study:${input.itemId}` },
		mutationFn: () =>
			resetFlashcardStudyProgressFn({
				data: { itemId: input.itemId, workspaceId: input.workspaceId },
			}),
		onMutate: async () => {
			await queryClient.cancelQueries({ queryKey: viewerQuery.queryKey });
			const previous = queryClient.getQueryData(viewerQuery.queryKey);
			queryClient.setQueryData(viewerQuery.queryKey, (current) =>
				current ? { ...current, studyState: createEmptyFlashcardStudyState() } : current,
			);
			return { previous };
		},
		onSuccess: (studyState) => {
			queryClient.setQueryData(viewerQuery.queryKey, (current) =>
				current ? { ...current, studyState } : current,
			);
		},
		onError: (_error, _variables, context) => {
			queryClient.setQueryData(viewerQuery.queryKey, context?.previous);
			toast.error("Your study progress could not be reset.");
		},
	});
}

export function useRecordFlashcardStudyRating(input: {
	itemId: string;
	updatedAt: string;
	workspaceId: string;
}) {
	const queryClient = useQueryClient();
	const viewerQuery = flashcardViewerQueryOptions(input);
	return useMutation({
		scope: { id: `flashcard-study:${input.itemId}` },
		mutationFn: (rating: { cardId: string; rating: FlashcardStudyRating }) =>
			recordFlashcardStudyRatingFn({
				data: { itemId: input.itemId, workspaceId: input.workspaceId, ...rating },
			}),
		onMutate: async (rating) => {
			await queryClient.cancelQueries({ queryKey: viewerQuery.queryKey });
			const previous = queryClient.getQueryData(viewerQuery.queryKey);
			queryClient.setQueryData(viewerQuery.queryKey, (current) =>
				current
					? {
							...current,
							studyState: applyFlashcardStudyRating(current.studyState, {
								...rating,
								reviewedAt: new Date().toISOString(),
							}),
						}
					: current,
			);
			return { previous };
		},
		onSuccess: (studyState) => {
			queryClient.setQueryData(viewerQuery.queryKey, (current) =>
				current ? { ...current, studyState } : current,
			);
		},
		onError: (_error, _rating, context) => {
			queryClient.setQueryData(viewerQuery.queryKey, context?.previous);
			toast.error("Your study progress could not be saved.");
		},
	});
}
