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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
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

	const answer = readText(payload.answer);

	if (!answer) {
		return null;
	}

	return {
		answer,
		question: readText(payload.question),
		surveyId: readText(payload.survey_id),
		surveyName: readText(payload.survey_name),
		surveyUrl: readText(payload.survey_url),
		personEmail: readText(payload.person_email),
		personName: readText(payload.person_name),
		distinctId: readText(payload.distinct_id),
		currentUrl: readText(payload.current_url),
		eventName: readText(payload.event),
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
