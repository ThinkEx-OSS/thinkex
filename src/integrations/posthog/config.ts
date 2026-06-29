function normalizePostHogHost(host: string | undefined) {
	const value = host?.trim();

	if (!value) {
		return undefined;
	}

	return value.replace(/\/$/, "");
}

function resolvePostHogHostOrigin(host: string | undefined) {
	if (!host) {
		return undefined;
	}

	try {
		return new URL(host).origin;
	} catch {
		return undefined;
	}
}

function parseEnvFlag(value: string | undefined) {
	return value?.trim().toLowerCase() === "true";
}

export const posthogProjectToken = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN?.trim() || undefined;

export const posthogHost = normalizePostHogHost(import.meta.env.VITE_POSTHOG_HOST);
export const posthogHostOrigin = resolvePostHogHostOrigin(posthogHost);
export const isPostHogEnabled = Boolean(posthogProjectToken && posthogHost);

export const posthogFeedbackSurveyId =
	import.meta.env.VITE_POSTHOG_FEEDBACK_SURVEY_ID?.trim() || undefined;

export const isPostHogFeedbackEnabled = isPostHogEnabled && Boolean(posthogFeedbackSurveyId);

/** Vite dev server (`pnpm dev`). Staging/production builds are not dev. */
export const isPostHogDevEnvironment = import.meta.env.DEV;

/**
 * Session replay `$snapshot` payloads are huge and flood the dev terminal.
 * Enabled in deployed builds; locally opt in with VITE_POSTHOG_SESSION_REPLAY=true.
 */
export const isPostHogSessionReplayEnabled =
	!isPostHogDevEnvironment || parseEnvFlag(import.meta.env.VITE_POSTHOG_SESSION_REPLAY);

/** Full-fidelity AI observability in staging/production only; disabled in local dev. */
export const isPostHogAiObservabilityEnabled = isPostHogEnabled && !isPostHogDevEnvironment;
