// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	PromptInput,
	PromptInputTextarea,
} from "#/features/workspaces/components/ai-chat/ai-chat-prompt-input";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("PromptInputTextarea", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.body.appendChild(document.createElement("div"));
		root = createRoot(container);
	});

	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
	});

	it("does not delegate Enter shortcuts while an IME composition is active", async () => {
		const onKeyDown = vi.fn();
		await act(async () => {
			root.render(
				<PromptInput
					attachments={{
						add: () => undefined,
						clear: () => undefined,
						composerReady: true,
						files: [],
						remove: () => undefined,
					}}
					onSubmit={() => true}
				>
					<PromptInputTextarea onKeyDown={onKeyDown} />
				</PromptInput>,
			);
		});
		const textarea = container.querySelector("textarea");
		if (!textarea) throw new Error("Expected textarea");

		await act(async () => {
			textarea.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
			textarea.dispatchEvent(
				new KeyboardEvent("keydown", {
					bubbles: true,
					cancelable: true,
					ctrlKey: true,
					key: "Enter",
				}),
			);
		});
		expect(onKeyDown).not.toHaveBeenCalled();

		await act(async () => {
			textarea.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
			textarea.dispatchEvent(
				new KeyboardEvent("keydown", {
					bubbles: true,
					cancelable: true,
					ctrlKey: true,
					key: "Enter",
				}),
			);
		});
		expect(onKeyDown).toHaveBeenCalledOnce();
	});
});
