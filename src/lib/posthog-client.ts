import posthog from "posthog-js";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
const uiHost = "https://us.posthog.com";

const sdkDefaultsVersion = "2026-01-30";
const readinessPollIntervalMs = 50;

export { posthog };

export function initPostHog(): void {
  if (typeof window === "undefined" || posthog.__loaded || !projectToken) {
    return;
  }

  posthog.init(projectToken, {
    api_host: apiHost,
    ui_host: uiHost,
    defaults: sdkDefaultsVersion,
    person_profiles: "identified_only",
    loaded: (client) => {
      if (process.env.NODE_ENV === "development") {
        client.debug();
      }
    },
  });
}

export function onPostHogReady(
  callback: (client: typeof posthog) => void,
): () => void {
  if (typeof window === "undefined" || !projectToken) {
    return () => {};
  }

  if (posthog.__loaded) {
    callback(posthog);
    return () => {};
  }

  const intervalId = window.setInterval(() => {
    if (!posthog.__loaded) {
      return;
    }

    window.clearInterval(intervalId);
    callback(posthog);
  }, readinessPollIntervalMs);

  return () => {
    window.clearInterval(intervalId);
  };
}
