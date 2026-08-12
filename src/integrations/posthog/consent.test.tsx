// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
	ACCEPT_ALL,
	hasExplicitSessionReplayConsent,
	REJECT_ALL,
	setStoredConsent,
} from "#/integrations/posthog/consent";
import { useConsent, useEffectiveConsent } from "#/integrations/posthog/use-consent";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const CONSENT_COOKIE_NAME = "thinkex_consent";
const CONSENT_REQUIRED_COOKIE = "thinkex_consent_required";

function deleteCookie(name: string) {
	document.cookie = `${name}=; Path=/; Max-Age=0`;
}

function resetLocalStorage() {
	const storage = window.localStorage;
	if (typeof storage?.removeItem === "function") {
		storage.removeItem(CONSENT_COOKIE_NAME);
	}
}

function setConsentCookie(analytics: boolean, sessionReplay: boolean) {
	const serialized = JSON.stringify({ analytics, sessionReplay, version: 2 });
	document.cookie = `${CONSENT_COOKIE_NAME}=${encodeURIComponent(serialized)}; Path=/`;
}

function EffectiveConsentProbe() {
	const consent = useEffectiveConsent();
	return (
		<output>
			{consent?.analytics ? "analytics-on" : "analytics-off"},
			{consent?.sessionReplay ? "replay-on" : "replay-off"},
			{hasExplicitSessionReplayConsent() ? "content-on" : "content-off"}
		</output>
	);
}

describe("browser consent state", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		deleteCookie(CONSENT_COOKIE_NAME);
		deleteCookie(CONSENT_REQUIRED_COOKIE);
		resetLocalStorage();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
		deleteCookie(CONSENT_COOKIE_NAME);
		deleteCookie(CONSENT_REQUIRED_COOKIE);
		resetLocalStorage();
	});

	it("renders a stored decision without entering an update loop", async () => {
		setStoredConsent(ACCEPT_ALL);

		function StoredConsentProbe() {
			const consent = useConsent();
			return <output>{consent?.analytics ? "analytics-on" : "analytics-off"}</output>;
		}

		await act(async () => root.render(<StoredConsentProbe />));

		expect(container.textContent).toBe("analytics-on");
	});

	it("reports the regional default as the effective settings state", async () => {
		document.cookie = `${CONSENT_REQUIRED_COOKIE}=0; Path=/`;

		await act(async () => root.render(<EffectiveConsentProbe />));

		expect(container.textContent).toBe("analytics-on,replay-on,content-off");
	});

	it("reacts to a consent cookie changed by another tab", async () => {
		setStoredConsent(ACCEPT_ALL);

		await act(async () => root.render(<EffectiveConsentProbe />));
		expect(container.textContent).toBe("analytics-on,replay-on,content-on");

		setConsentCookie(REJECT_ALL.analytics, REJECT_ALL.sessionReplay);
		await act(async () => {
			window.dispatchEvent(
				new StorageEvent("storage", {
					key: CONSENT_COOKIE_NAME,
					newValue: JSON.stringify({ ...REJECT_ALL, version: 2 }),
				}),
			);
		});

		expect(container.textContent).toBe("analytics-off,replay-off,content-off");
	});
});
