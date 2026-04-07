const PRODUCTION_URL = "https://thinkex.app";

/**
 * Returns the canonical app base URL.
 * Safe to call from both server and client code.
 *
 * Priority:
 *  1. NEXT_PUBLIC_APP_URL — validated and trimmed; localhost values are
 *     intentionally skipped so config snippets always show the live URL.
 *  2. Hard-coded PRODUCTION_URL as fallback.
 *
 * In non-production server environments (local dev, self-hosted) where
 * NEXT_PUBLIC_APP_URL is absent or points to localhost, an Error is thrown
 * so callers don't silently emit config snippets pointing at the live site.
 * Client-side code (browser) always receives PRODUCTION_URL as fallback to
 * avoid crashing the component tree.
 */
export function getBaseURL(): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (envUrl && !envUrl.includes("localhost") && !envUrl.includes("127.0.0.1")) {
    return envUrl.replace(/\/$/, "");
  }

  // On the server in a non-production environment (local dev, preview without
  // NEXT_PUBLIC_APP_URL set) fail loudly rather than silently returning the
  // production URL. typeof window check distinguishes server from browser.
  if (
    typeof window === "undefined" &&
    process.env.NODE_ENV !== "production" &&
    process.env.VERCEL_ENV !== "production"
  ) {
    throw new Error(
      "NEXT_PUBLIC_APP_URL is missing or points to localhost. " +
      "Set it to the canonical deployment URL (e.g. https://your-app.vercel.app)."
    );
  }

  return PRODUCTION_URL;
}
