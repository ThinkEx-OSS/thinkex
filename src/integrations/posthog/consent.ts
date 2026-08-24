/**
 * Consent state for non-essential analytics. The cookie is the canonical value
 * for both browser and server reads. localStorage only notifies other open tabs
 * when that cookie changes. Strictly-necessary auth/session cookies are never
 * gated by this — only PostHog analytics and session replay.
 */

import { CONSENT_REQUIRED_COOKIE } from "#/integrations/posthog/consent-region";

const CONSENT_STORAGE_KEY = "thinkex_consent";

/** Same name as the cross-tab notification key. */
export const CONSENT_COOKIE_NAME = CONSENT_STORAGE_KEY;

/** One year — a settled preference, not a session value. */
const CONSENT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Bump when the categories or their meaning change; older records are re-prompted. */
const CONSENT_VERSION = 2;

const CONSENT_CHANGE_EVENT = "thinkex:consent-change";
const CONSENT_OPEN_EVENT = "thinkex:consent-open";

export interface ConsentCategories {
	analytics: boolean;
	sessionReplay: boolean;
}

export interface ConsentRecord extends ConsentCategories {
	version: number;
}

export const ACCEPT_ALL: ConsentCategories = { analytics: true, sessionReplay: true };
export const REJECT_ALL: ConsentCategories = { analytics: false, sessionReplay: false };

const DEFAULT_OPT_OUT_REGION_CONSENT: ConsentRecord = {
	analytics: true,
	sessionReplay: true,
	version: CONSENT_VERSION,
};

/**
 * Parses a stored/serialized consent value.
 * Pure and SSR-safe so the server can reuse it. Returns null on any mismatch,
 * which re-prompts the user rather than assuming a stale/garbled choice.
 */
export function parseConsentValue(raw: string | null | undefined): ConsentRecord | null {
	if (!raw) {
		return null;
	}

	try {
		const parsed = JSON.parse(raw) as Partial<ConsentRecord>;
		if (
			parsed.version !== CONSENT_VERSION ||
			typeof parsed.analytics !== "boolean" ||
			typeof parsed.sessionReplay !== "boolean"
		) {
			return null;
		}

		return {
			analytics: parsed.analytics,
			// Session replay can never be on without analytics.
			sessionReplay: parsed.analytics && parsed.sessionReplay,
			version: CONSENT_VERSION,
		};
	} catch {
		return null;
	}
}

/**
 * Returns the encoded cookie value used as the external-store snapshot. Strings
 * have stable identity, which is required by useSyncExternalStore.
 */
export function getStoredConsentValue(): string | null {
	if (typeof document === "undefined") {
		return null;
	}

	return readCookieValue(document.cookie, CONSENT_COOKIE_NAME);
}

/** Returns the stored decision, or null when the user hasn't chosen yet. */
export function getStoredConsent(): ConsentRecord | null {
	return parseConsentValue(decodeConsentCookieValue(getStoredConsentValue()));
}

/**
 * Whether this visitor needs to opt in before analytics run, read from the
 * region cookie the Worker stamped. Defaults to required (opt-in) unless the
 * cookie explicitly says otherwise — the privacy-safe fallback.
 */
export function isConsentRequired(): boolean {
	if (typeof document === "undefined") {
		return true;
	}

	return readCookieValue(document.cookie, CONSENT_REQUIRED_COOKIE) !== "0";
}

/** Browser-level request to opt out of data sharing/tracking defaults. */
export function hasGlobalPrivacyControl(): boolean {
	return (
		typeof navigator !== "undefined" &&
		(navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true
	);
}

/**
 * The decision to apply when nothing is stored yet: nothing in opt-in regions or
 * under GPC, analytics and visual replay on elsewhere. A stored choice always wins.
 */
export function resolveEffectiveConsent(
	stored: ConsentRecord | null,
	consentRequired: boolean,
	hasStoredValue = stored !== null,
	globalPrivacyControl = false,
): ConsentRecord | null {
	if (stored) {
		return stored;
	}

	if (hasStoredValue || consentRequired || globalPrivacyControl) {
		return null;
	}

	return DEFAULT_OPT_OUT_REGION_CONSENT;
}

export function getEffectiveConsent(): ConsentRecord | null {
	const serialized = getStoredConsentValue();
	const stored = parseConsentValue(decodeConsentCookieValue(serialized));
	return resolveEffectiveConsent(
		stored,
		isConsentRequired(),
		serialized !== null,
		hasGlobalPrivacyControl(),
	);
}

/** AI content export requires an explicit stored replay choice, never a regional default. */
export function hasExplicitSessionReplayConsent(): boolean {
	return getStoredConsent()?.sessionReplay === true;
}

export function readCookieValue(
	cookieHeader: string | null | undefined,
	name: string,
): string | null {
	if (!cookieHeader) {
		return null;
	}

	for (const part of cookieHeader.split(";")) {
		const separator = part.indexOf("=");
		if (separator !== -1 && part.slice(0, separator).trim() === name) {
			return part.slice(separator + 1).trim();
		}
	}

	return null;
}

/** Decodes a cookie value without letting malformed user input escape the boundary. */
export function decodeConsentCookieValue(raw: string | null | undefined): string | null {
	if (!raw) {
		return null;
	}

	try {
		return decodeURIComponent(raw);
	} catch {
		return null;
	}
}

/** Persists a decision and notifies listeners (this tab and others). */
export function setStoredConsent(categories: ConsentCategories): void {
	const record: ConsentRecord = {
		analytics: categories.analytics,
		sessionReplay: categories.analytics && categories.sessionReplay,
		version: CONSENT_VERSION,
	};

	if (typeof window !== "undefined" && typeof document !== "undefined") {
		const serialized = JSON.stringify(record);
		// The cookie is the source of truth because both the browser and Worker can
		// read it. localStorage is only a native cross-tab notification channel.
		const secure = window.location.protocol === "https:" ? "; Secure" : "";
		document.cookie = `${CONSENT_COOKIE_NAME}=${encodeURIComponent(serialized)}; Path=/; Max-Age=${CONSENT_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
		try {
			window.localStorage.setItem(CONSENT_STORAGE_KEY, serialized);
		} catch {
			// The cookie still persists; only live cross-tab notification is unavailable.
		}
		window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: record }));
	}
}

/** Subscribe to consent changes from this tab or another. Returns an unsubscribe fn. */
export function subscribeToConsent(callback: () => void): () => void {
	if (typeof window === "undefined") {
		return () => {};
	}

	const handleChange = () => callback();
	const handleStorage = (event: StorageEvent) => {
		if (event.key === CONSENT_STORAGE_KEY) {
			callback();
		}
	};

	window.addEventListener(CONSENT_CHANGE_EVENT, handleChange);
	window.addEventListener("storage", handleStorage);

	return () => {
		window.removeEventListener(CONSENT_CHANGE_EVENT, handleChange);
		window.removeEventListener("storage", handleStorage);
	};
}

/** Opens the "Manage cookies" dialog (e.g. from the footer link). */
export function openConsentPreferences() {
	if (typeof window === "undefined") {
		return;
	}
	window.dispatchEvent(new CustomEvent(CONSENT_OPEN_EVENT));
}

export function subscribeToConsentOpen(callback: () => void): () => void {
	if (typeof window === "undefined") {
		return () => {};
	}
	window.addEventListener(CONSENT_OPEN_EVENT, callback);
	return () => window.removeEventListener(CONSENT_OPEN_EVENT, callback);
}
