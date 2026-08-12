import { isRecord } from "#/lib/record";

const FALLBACK_FEEDBACK_QUESTION = "How can we improve ThinkEx?";
const MAX_FIELD_LENGTH = 4000;

export interface PostHogSurveyFeedbackPayload {
	answer: string;
	question?: string;
	surveyId?: string;
	surveyName?: string;
	surveyUrl?: string;
	personEmail?: string;
	personName?: string;
	distinctId?: string;
	currentUrl?: string;
	eventName?: string;
	receivedAt: Date;
}

export interface PostHogSurveyFeedbackEmailContent {
	subject: string;
	text: string;
	html: string;
}

function readText(value: unknown) {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed ? trimmed.slice(0, MAX_FIELD_LENGTH) : undefined;
	}

	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}

	return undefined;
}

function readFirstResponse(payload: Record<string, unknown>) {
	const response = payload.response ?? payload.responses;

	if (Array.isArray(response)) {
		const first = response.find(isRecord);
		return first ?? {};
	}

	return isRecord(response) ? response : {};
}

function escapeHtml(value: string) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

export function parsePostHogSurveyFeedbackPayload(
	payload: unknown,
	receivedAt = new Date(),
): PostHogSurveyFeedbackPayload | null {
	if (!isRecord(payload)) {
		return null;
	}

	const event = isRecord(payload.event) ? payload.event : {};
	const person = isRecord(payload.person) ? payload.person : {};
	const survey = isRecord(payload.survey) ? payload.survey : {};
	const firstResponse = readFirstResponse(payload);
	const answer = readText(payload.answer) ?? readText(firstResponse.answer);

	if (!answer) {
		return null;
	}

	return {
		answer,
		question: readText(payload.question) ?? readText(firstResponse.question),
		surveyId: readText(payload.survey_id) ?? readText(survey.id),
		surveyName: readText(payload.survey_name) ?? readText(survey.name),
		surveyUrl: readText(payload.survey_url) ?? readText(survey.url),
		personEmail: readText(payload.person_email) ?? readText(person.email),
		personName: readText(payload.person_name) ?? readText(person.name),
		distinctId: readText(payload.distinct_id) ?? readText(person.distinct_id),
		currentUrl: readText(payload.current_url) ?? readText(person.url),
		eventName: readText(payload.event) ?? readText(event.name),
		receivedAt,
	};
}

export function buildPostHogSurveyFeedbackEmailContent(
	feedback: PostHogSurveyFeedbackPayload,
): PostHogSurveyFeedbackEmailContent {
	const subject = "New ThinkEx feedback";
	const question = feedback.question ?? FALLBACK_FEEDBACK_QUESTION;
	const metadata = [
		["Question", question],
		["Survey", feedback.surveyName],
		["Survey ID", feedback.surveyId],
		["Person", feedback.personName],
		["Email", feedback.personEmail],
		["Distinct ID", feedback.distinctId],
		["Page", feedback.currentUrl],
		["PostHog event", feedback.eventName],
		["Received", feedback.receivedAt.toISOString()],
	].filter((entry): entry is [string, string] => Boolean(entry[1]));

	const text = [
		"New ThinkEx feedback",
		"",
		question,
		feedback.answer,
		"",
		...metadata.map(([label, value]) => `${label}: ${value}`),
		...(feedback.surveyUrl ? [`Survey URL: ${feedback.surveyUrl}`] : []),
	].join("\n");

	const htmlMetadata = metadata
		.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
		.join("");
	const html = [
		"<h1>New ThinkEx feedback</h1>",
		`<p><strong>${escapeHtml(question)}</strong></p>`,
		`<blockquote>${escapeHtml(feedback.answer).replaceAll("\n", "<br>")}</blockquote>`,
		htmlMetadata ? `<dl>${htmlMetadata}</dl>` : "",
		feedback.surveyUrl
			? `<p><a href="${escapeHtml(feedback.surveyUrl)}">Open survey in PostHog</a></p>`
			: "",
	].join("");

	return { subject, text, html };
}
