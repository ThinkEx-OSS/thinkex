import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
	getQuizViewerFn,
	recordQuizAnswerFn,
	resetQuizStudyProgressFn,
} from "#/features/workspaces/quizzes/quiz-functions";
import {
	applyQuizAnswer,
	createEmptyQuizStudyState,
} from "#/features/workspaces/quizzes/quiz-study-state";

type QuizViewerData = Awaited<ReturnType<typeof getQuizViewerFn>>;

export function quizViewerQueryOptions(input: {
	itemId: string;
	updatedAt: string;
	workspaceId: string;
}) {
	return queryOptions({
		queryKey: [...quizViewerItemQueryKey(input), input.updatedAt],
		queryFn: () =>
			getQuizViewerFn({
				data: { itemId: input.itemId, workspaceId: input.workspaceId },
			}),
	});
}

export function useResetQuizStudyProgress(input: {
	itemId: string;
	updatedAt: string;
	workspaceId: string;
}) {
	const queryClient = useQueryClient();
	const viewerQuery = quizViewerQueryOptions(input);
	const itemQueryKey = quizViewerItemQueryKey(input);
	return useMutation({
		scope: { id: `quiz-study:${input.itemId}` },
		mutationFn: () =>
			resetQuizStudyProgressFn({
				data: { itemId: input.itemId, workspaceId: input.workspaceId },
			}),
		onMutate: async () => {
			await queryClient.cancelQueries({ queryKey: itemQueryKey });
			const previous = queryClient.getQueryData(viewerQuery.queryKey);
			queryClient.setQueriesData<QuizViewerData>({ queryKey: itemQueryKey }, (current) =>
				current ? { ...current, studyState: createEmptyQuizStudyState() } : current,
			);
			return { previous };
		},
		onSuccess: (studyState) => {
			queryClient.setQueriesData<QuizViewerData>({ queryKey: itemQueryKey }, (current) =>
				current ? { ...current, studyState } : current,
			);
		},
		onError: (_error, _variables, context) => {
			queryClient.setQueryData(viewerQuery.queryKey, context?.previous);
			void queryClient.invalidateQueries({ queryKey: itemQueryKey });
			toast.error("Your quiz progress could not be reset.");
		},
	});
}

export function useRecordQuizAnswer(input: {
	itemId: string;
	updatedAt: string;
	workspaceId: string;
}) {
	const queryClient = useQueryClient();
	const viewerQuery = quizViewerQueryOptions(input);
	const itemQueryKey = quizViewerItemQueryKey(input);
	return useMutation({
		scope: { id: `quiz-study:${input.itemId}` },
		mutationFn: (answer: { questionId: string; selectedOptionId: string }) =>
			recordQuizAnswerFn({
				data: { itemId: input.itemId, workspaceId: input.workspaceId, ...answer },
			}),
		onMutate: async (answer) => {
			await queryClient.cancelQueries({ queryKey: itemQueryKey });
			const previous = queryClient.getQueryData(viewerQuery.queryKey);
			queryClient.setQueriesData<QuizViewerData>({ queryKey: itemQueryKey }, (current) =>
				current
					? {
							...current,
							studyState: applyQuizAnswer(current.studyState, {
								...answer,
								answeredAt: new Date().toISOString(),
							}),
						}
					: current,
			);
			return { previous };
		},
		onSuccess: (studyState) => {
			queryClient.setQueriesData<QuizViewerData>({ queryKey: itemQueryKey }, (current) =>
				current ? { ...current, studyState } : current,
			);
		},
		onError: (_error, _answer, context) => {
			queryClient.setQueryData(viewerQuery.queryKey, context?.previous);
			void queryClient.invalidateQueries({ queryKey: itemQueryKey });
			toast.error("Your answer could not be saved.");
		},
	});
}

function quizViewerItemQueryKey(input: { itemId: string; workspaceId: string }) {
	return ["workspace-quizzes", input.workspaceId, input.itemId] as const;
}
