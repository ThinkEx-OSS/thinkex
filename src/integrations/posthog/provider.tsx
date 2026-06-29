import { PostHogProvider as PostHogReactProvider } from "@posthog/react";
import { useQuery } from "@tanstack/react-query";
import posthog from "posthog-js";
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

export default function PostHogProvider({ children }: { children: ReactNode }) {
	if (!isPostHogEnabled) {
		return children;
	}

	return (
		<PostHogReactProvider client={posthog}>
			<PostHogAuthSync />
			{children}
		</PostHogReactProvider>
	);
}
