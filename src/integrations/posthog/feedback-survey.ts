import posthog from "posthog-js";
import { SurveyQuestionType, SurveyType, type BasicSurveyQuestion, type Survey } from "posthog-js";

import { isPostHogEnabled, posthogFeedbackSurveyId } from "#/integrations/posthog/config";

export type FeedbackOpenQuestion = BasicSurveyQuestion & { id: string };

export function findFeedbackSurvey(surveys: Survey[], surveyId: string): Survey | null {
	return surveys.find((survey) => survey.id === surveyId && survey.type === SurveyType.API) ?? null;
}

export function getFeedbackOpenQuestions(survey: Survey): FeedbackOpenQuestion[] {
	return survey.questions.filter(
		(question): question is FeedbackOpenQuestion =>
			question.type === SurveyQuestionType.Open && Boolean(question.id),
	);
}

export function buildFeedbackSurveySentProperties(
	survey: Survey,
	responsesByQuestionId: Record<string, string>,
) {
	const openQuestions = getFeedbackOpenQuestions(survey);

	return {
		$survey_id: survey.id,
		$survey_questions: openQuestions.map((question) => ({
			id: question.id,
			question: question.question,
		})),
		$survey_completed: true,
		...Object.fromEntries(
			openQuestions.map((question) => [
				`$survey_response_${question.id}`,
				responsesByQuestionId[question.id] ?? "",
			]),
		),
	};
}

export function captureFeedbackSurveyShown(surveyId: string) {
	if (!isPostHogEnabled) {
		return;
	}

	posthog.capture("survey shown", {
		$survey_id: surveyId,
	});
}

export function captureFeedbackSurveySent(
	survey: Survey,
	responsesByQuestionId: Record<string, string>,
) {
	if (!isPostHogEnabled) {
		return;
	}

	posthog.capture("survey sent", buildFeedbackSurveySentProperties(survey, responsesByQuestionId));
}

export function loadFeedbackSurvey(): Promise<Survey> {
	return new Promise((resolve, reject) => {
		if (!posthogFeedbackSurveyId) {
			reject(new Error("Feedback survey is not configured."));
			return;
		}

		posthog.getSurveys((surveys, context) => {
			if (context?.error) {
				reject(new Error(context.error));
				return;
			}

			if (context && !context.isLoaded) {
				reject(new Error("Unable to load feedback survey."));
				return;
			}

			const survey = findFeedbackSurvey(surveys, posthogFeedbackSurveyId);

			if (!survey) {
				reject(new Error("Feedback survey was not found."));
				return;
			}

			if (getFeedbackOpenQuestions(survey).length === 0) {
				reject(new Error("Feedback survey has no open-text questions."));
				return;
			}

			resolve(survey);
		}, true);
	});
}
