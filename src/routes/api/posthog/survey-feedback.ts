import { env as workerEnv } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";

import {
	buildPostHogSurveyFeedbackEmailContent,
	parsePostHogSurveyFeedbackPayload,
} from "#/integrations/posthog/survey-feedback-email";
import { apiError, apiJson, getRequestId } from "#/lib/api/http";
import {
	getEmailSender,
	getTransactionalFromEmail,
	TRANSACTIONAL_FROM_NAME,
} from "#/lib/transactional-email";

const MAX_WEBHOOK_BODY_LENGTH = 128_000;
const FEEDBACK_NOTIFICATION_EMAIL = "hello@thinkex.app";

interface FeedbackWebhookRuntimeEnv {
	POSTHOG_SURVEY_WEBHOOK_SECRET?: string;
}

function getRuntimeEnv() {
	return workerEnv as typeof workerEnv & FeedbackWebhookRuntimeEnv;
}

function getConfiguredSecret() {
	return getRuntimeEnv().POSTHOG_SURVEY_WEBHOOK_SECRET?.trim();
}

function getProvidedSecret(request: Request) {
	const authorization = request.headers.get("authorization")?.trim();

	if (authorization?.toLowerCase().startsWith("bearer ")) {
		return authorization.slice("bearer ".length).trim();
	}

	return (
		request.headers.get("x-thinkex-webhook-secret")?.trim() ??
		new URL(request.url).searchParams.get("token")?.trim() ??
		new URL(request.url).searchParams.get("secret")?.trim() ??
		""
	);
}

async function handlePostHogSurveyFeedbackWebhook(request: Request) {
	const requestId = getRequestId(request);
	const configuredSecret = getConfiguredSecret();

	if (!configuredSecret) {
		return apiError(requestId, 404, "NOT_FOUND", "Feedback webhook is not configured.");
	}

	if (getProvidedSecret(request) !== configuredSecret) {
		return apiError(requestId, 401, "UNAUTHORIZED", "Invalid feedback webhook secret.");
	}

	const bodyText = await request.text();

	if (bodyText.length > MAX_WEBHOOK_BODY_LENGTH) {
		return apiError(requestId, 413, "PAYLOAD_TOO_LARGE", "Feedback webhook payload is too large.");
	}

	let payload: unknown;

	try {
		payload = JSON.parse(bodyText);
	} catch {
		return apiError(requestId, 400, "INVALID_JSON", "Feedback webhook payload must be JSON.");
	}

	const feedback = parsePostHogSurveyFeedbackPayload(payload);

	if (!feedback) {
		return apiJson({ ok: true, skipped: "missing_feedback_answer" }, requestId, 202);
	}

	const emailSender = getEmailSender();

	if (!emailSender) {
		return apiError(requestId, 503, "EMAIL_UNAVAILABLE", "Email delivery is not configured.");
	}

	const content = buildPostHogSurveyFeedbackEmailContent(feedback);

	try {
		await emailSender.send({
			to: FEEDBACK_NOTIFICATION_EMAIL,
			from: {
				email: getTransactionalFromEmail(),
				name: TRANSACTIONAL_FROM_NAME,
			},
			subject: content.subject,
			html: content.html,
			text: content.text,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown send error";
		console.warn("[PostHogSurveyFeedback] Email send failed", {
			requestId,
			message,
		});

		return apiError(requestId, 502, "EMAIL_SEND_FAILED", "Unable to send feedback email.");
	}

	return apiJson({ ok: true }, requestId);
}

export const Route = createFileRoute("/api/posthog/survey-feedback")({
	server: {
		handlers: {
			POST: ({ request }) => handlePostHogSurveyFeedbackWebhook(request),
		},
	},
});

export { handlePostHogSurveyFeedbackWebhook };
