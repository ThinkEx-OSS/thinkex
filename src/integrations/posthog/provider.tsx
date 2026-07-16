import { PostHogProvider as PostHogReactProvider } from "@posthog/react";
import { useQuery } from "@tanstack/react-query";
import posthog, { type CaptureResult } from "posthog-js";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

import {
	isPostHogDevEnvironment,
	isPostHogEnabled,
	isPostHogSessionReplayEnabled,
	posthogHost,
	posthogProjectToken,
} from "#/integrations/posthog/config";
import type {
	PostHogClientEventName,
	PostHogEventPropertiesByName,
} from "#/integrations/posthog/events";
import type { AuthSession } from "#/lib/session-query";
import { getAuthSessionQueryOptions } from "#/lib/session-query";

const posthogUiHost = "https://us.posthog.com";

/**
 * PostHog's session-replay recorder wraps `window.fetch` to capture network
 * activity and attach tracing headers. When a wrapped request fails (offline, an
 * ad blocker, an aborted in-flight request) the recorder re-throws a
 * `Failed to fetch` TypeError, which our global `unhandledrejection` handler then
 * forwards to `captureException`. These are transient failures inside PostHog's
 * own instrumentation — not ThinkEx application errors — so we drop any
 * `$exception` whose message is `Failed to fetch` and whose stack resolves into
 * the recorder (`network-plugin` / `tracing-headers` / `rrweb-plugins/patch` /
 * `posthog-recorder`). Matching on markers rather than exact fingerprints covers
 * both current issues plus any future ones from the same source.
 */
const RECORDER_FRAME_MARKERS = [
	"network-plugin",
	"tracing-headers",
	"rrweb-plugins/patch",
	"posthog-recorder",
];

type ExceptionStackFrame = { filename?: unknown };
type ExceptionListItem = {
	value?: unknown;
	stacktrace?: { frames?: unknown } | null;
};

function isRecorderNetworkFailure(result: CaptureResult): boolean {
	if (result.event !== "$exception") {
		return false;
	}

	const exceptions = result.properties?.$exception_list;
	if (!Array.isArray(exceptions)) {
		return false;
	}

	let sawFailedToFetch = false;
	let sawRecorderFrame = false;

	for (const exception of exceptions as ExceptionListItem[]) {
		if (typeof exception?.value === "string" && exception.value.includes("Failed to fetch")) {
			sawFailedToFetch = true;
		}

		const frames = exception?.stacktrace?.frames;
		if (!Array.isArray(frames)) {
			continue;
		}

		for (const frame of frames as ExceptionStackFrame[]) {
			const filename = frame?.filename;
			if (
				typeof filename === "string" &&
				RECORDER_FRAME_MARKERS.some((marker) => filename.includes(marker))
			) {
				sawRecorderFrame = true;
			}
		}
	}

	return sawFailedToFetch && sawRecorderFrame;
}

function dropRecorderNetworkFailures(result: CaptureResult | null): CaptureResult | null {
	if (result && isRecorderNetworkFailure(result)) {
		return null;
	}

	return result;
}

function getPostHogTracingHostnames() {
	const hostnames = new Set<string>();

	if (typeof window !== "undefined" && window.location.hostname) {
		hostnames.add(window.location.hostname);
	}

	if (isPostHogDevEnvironment) {
		hostnames.add("localhost");
		hostnames.add("127.0.0.1");
	}

	return [...hostnames];
}

if (typeof window !== "undefined" && isPostHogEnabled) {
	const tracingHeaders = getPostHogTracingHostnames();

	posthog.init(posthogProjectToken, {
		api_host: posthogHost,
		ui_host: posthogUiHost,
		defaults: "2026-05-30",
		debug: false,
		before_send: dropRecorderNetworkFailures,
		...(isPostHogSessionReplayEnabled ? {} : { disable_session_recording: true }),
		...(tracingHeaders.length > 0 ? { tracing_headers: tracingHeaders } : {}),
		loaded: (client) => {
			if (isPostHogDevEnvironment) {
				// Clear debug mode if it was enabled via ?__posthog_debug=true or localStorage.
				client.debug(false);
			}

			if (!isPostHogSessionReplayEnabled) {
				client.stopSessionRecording();
			}
		},
	});
}

export function capturePostHogClientEvent<TEvent extends PostHogClientEventName>(
	event: TEvent,
	properties: PostHogEventPropertiesByName[TEvent],
) {
	if (!isPostHogEnabled) {
		return;
	}

	posthog.capture(event, properties);
}

export function capturePostHogClientException(error: Error, properties?: Record<string, unknown>) {
	if (!isPostHogEnabled) {
		return;
	}

	posthog.captureException(error, properties);
}

function normalizeBrowserError(value: unknown, fallbackMessage: string) {
	if (value instanceof Error) {
		return value;
	}

	if (typeof value === "string" && value.trim()) {
		return new Error(value);
	}

	const error = new Error(fallbackMessage);
	(error as Error & { cause?: unknown }).cause = value;
	return error;
}

type AuthenticatedSession = NonNullable<AuthSession>;

function identifyPostHogUser(session: AuthenticatedSession) {
	if (!isPostHogEnabled) {
		return;
	}

	posthog.identify(session.user.id, {
		email: session.user.email,
		name: session.user.name,
	});
}

/** Clears client-side PostHog identity only; server-side person history remains. */
export function resetPostHogClientIdentity() {
	if (!isPostHogEnabled) {
		return;
	}

	posthog.reset();
}

function PostHogAuthSync() {
	const { data: session, isPending } = useQuery(getAuthSessionQueryOptions());
	const lastDistinctIdRef = useRef<string | null>(null);

	useEffect(() => {
		if (!isPostHogEnabled || isPending) {
			return;
		}

		if (session?.user) {
			identifyPostHogUser(session);
			lastDistinctIdRef.current = session.user.id;
			return;
		}

		if (lastDistinctIdRef.current) {
			resetPostHogClientIdentity();
			lastDistinctIdRef.current = null;
		}
	}, [isPending, session]);

	return null;
}

function PostHogGlobalErrorCapture() {
	useEffect(() => {
		const handleError = (event: ErrorEvent) => {
			capturePostHogClientException(
				normalizeBrowserError(event.error ?? event.message, "Unhandled browser error"),
				{
					colno: event.colno,
					error_boundary: "window.error",
					filename: event.filename,
					lineno: event.lineno,
					message: event.message,
				},
			);
		};

		const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
			capturePostHogClientException(
				normalizeBrowserError(event.reason, "Unhandled promise rejection"),
				{
					error_boundary: "window.unhandledrejection",
					reason_type: typeof event.reason,
				},
			);
		};

		window.addEventListener("error", handleError);
		window.addEventListener("unhandledrejection", handleUnhandledRejection);

		return () => {
			window.removeEventListener("error", handleError);
			window.removeEventListener("unhandledrejection", handleUnhandledRejection);
		};
	}, []);

	return null;
}

export default function PostHogProvider({ children }: { children: ReactNode }) {
	if (!isPostHogEnabled) {
		return children;
	}

	return (
		<PostHogReactProvider client={posthog}>
			<PostHogGlobalErrorCapture />
			<PostHogAuthSync />
			{children}
		</PostHogReactProvider>
	);
}
