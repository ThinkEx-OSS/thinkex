const PRODUCTION_URL = "https://thinkex.app";

/**
 * Returns the canonical app base URL.
 * Safe to call from both server and client code.
 *
 * Priority:
 *  1. NEXT_PUBLIC_APP_URL — if it is not a localhost address
 *  2. Hard-coded production URL as fallback
 *
 * Localhost values are intentionally ignored so that config snippets
 * shown to users always reference the live deployment.
 */
export function getBaseURL(): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl && !envUrl.includes("localhost") && !envUrl.includes("127.0.0.1")) {
    return envUrl.replace(/\/$/, "");
  }
  return PRODUCTION_URL;
}
