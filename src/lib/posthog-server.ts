import "server-only";

import { PostHog } from "posthog-node";

const POSTHOG_CAPTURED_ERROR = Symbol.for("thinkex.posthog.captured");

const projectToken = process.env.POSTHOG_PROJECT_TOKEN;
const isDevelopment = process.env.NODE_ENV === "development";

function normalizeHost(value: string | undefined): string | undefined {
  return value?.trim().replace(/\/+$/, "");
}

export const posthogServerHost = normalizeHost(process.env.POSTHOG_HOST);

let posthogServerClient: PostHog | null | undefined;

function markPostHogCaptured(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const trackedError = error as Record<PropertyKey, unknown>;
  if (trackedError[POSTHOG_CAPTURED_ERROR]) {
    return true;
  }

  Object.defineProperty(trackedError, POSTHOG_CAPTURED_ERROR, {
    value: true,
    configurable: true,
  });

  return false;
}

export function getPostHogServerClient(): PostHog | null {
  if (posthogServerClient !== undefined) {
    return posthogServerClient;
  }

  if (isDevelopment || !projectToken) {
    posthogServerClient = null;
    return posthogServerClient;
  }

  posthogServerClient = new PostHog(projectToken, {
    disabled: false,
    flushAt: 1,
    flushInterval: 0,
    ...(posthogServerHost ? { host: posthogServerHost } : {}),
  });

  return posthogServerClient;
}

export function capturePostHogServerException(
  error: unknown,
  options?: {
    distinctId?: string;
    properties?: Record<string | number, unknown>;
  },
): void {
  const client = getPostHogServerClient();
  if (!client || markPostHogCaptured(error)) {
    return;
  }

  client.captureException(error, options?.distinctId, options?.properties);
}

export function capturePostHogServerEvent(
  event: string,
  options?: {
    distinctId?: string;
    properties?: Record<string | number, unknown>;
  },
): void {
  const client = getPostHogServerClient();
  if (!client) {
    return;
  }

  client.capture({
    event,
    distinctId: options?.distinctId ?? "anonymous",
    properties: options?.properties,
  });
}

export async function flushPostHogServer(): Promise<void> {
  await getPostHogServerClient()?.flush();
}
