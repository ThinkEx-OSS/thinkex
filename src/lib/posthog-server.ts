import "server-only";

import { PostHog } from "posthog-node";

const defaultPostHogHost = "https://us.i.posthog.com";
const POSTHOG_CAPTURED_ERROR = Symbol.for("thinkex.posthog.captured");

const apiKey = process.env.POSTHOG_API_KEY;

function normalizeHost(value: string | undefined): string | undefined {
  return value?.trim().replace(/\/+$/, "");
}

export const posthogServerHost =
  normalizeHost(process.env.POSTHOG_HOST) ?? defaultPostHogHost;

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

  if (!apiKey) {
    posthogServerClient = null;
    return posthogServerClient;
  }

  posthogServerClient = new PostHog(apiKey, {
    host: posthogServerHost,
    disabled: false,
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
