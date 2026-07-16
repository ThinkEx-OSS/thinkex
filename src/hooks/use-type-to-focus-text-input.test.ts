import { describe, expect, it } from "vitest";

import { shouldRouteTypingToTextInput } from "#/hooks/use-type-to-focus-text-input";

function createKeyboardEvent(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
	return {
		defaultPrevented: false,
		metaKey: false,
		ctrlKey: false,
		altKey: false,
		isComposing: false,
		key: "a",
		composedPath: () => [],
		...overrides,
	} as unknown as KeyboardEvent;
}

describe("shouldRouteTypingToTextInput", () => {
	it("routes a printable single-character keydown", () => {
		expect(shouldRouteTypingToTextInput(createKeyboardEvent())).toBe(true);
	});

	it("ignores keydown events without a key (e.g. Android IME keyCode 229)", () => {
		// Android Chrome soft keyboards fire keydown with no `key` during IME
		// composition; reading `.length` on it used to throw an uncaught TypeError.
		expect(() =>
			shouldRouteTypingToTextInput(createKeyboardEvent({ key: undefined })),
		).not.toThrow();
		expect(shouldRouteTypingToTextInput(createKeyboardEvent({ key: undefined }))).toBe(false);
	});

	it("ignores non-printable keys", () => {
		expect(shouldRouteTypingToTextInput(createKeyboardEvent({ key: "Enter" }))).toBe(false);
	});

	it("ignores keydown with modifier keys held", () => {
		expect(shouldRouteTypingToTextInput(createKeyboardEvent({ metaKey: true }))).toBe(false);
		expect(shouldRouteTypingToTextInput(createKeyboardEvent({ isComposing: true }))).toBe(false);
	});
});
