import type { Properties } from "posthog-js";
import { posthog } from "@/lib/posthog-client";

const POSTHOG_CAPTURED_ERROR = Symbol.for("thinkex.posthog.captured");

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

/** Report handled errors (e.g. React / Next error boundaries) to PostHog. */
export function capturePosthogException(
  error: unknown,
  properties?: Properties,
): void {
  if (typeof window === "undefined" || !posthog.__loaded) return;
  if (markPostHogCaptured(error)) return;
  posthog.captureException(error, properties);
}
