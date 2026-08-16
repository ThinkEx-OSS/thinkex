// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
	AiChatTranscriptItem,
	AiChatTranscriptScroller,
} from "#/features/workspaces/components/ai-chat/AiChatTranscriptScroller";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("AiChatTranscriptScroller", () => {
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

	it("holds the submitted turn at the reading line while the response height changes", async () => {
		await render(root, transcript({ anchorMessageId: undefined, responseHeight: 36 }));
		const layout = installTranscriptLayout(container);

		await render(root, transcript({ anchorMessageId: "user-2", responseHeight: 36 }));
		expect(layout.getMessageTop("user-2")).toBe(88);

		await render(root, transcript({ anchorMessageId: "user-2", responseHeight: 150 }));
		expect(layout.getMessageTop("user-2")).toBe(88);

		await render(root, transcript({ anchorMessageId: "user-2", responseHeight: 0 }));
		expect(layout.getMessageTop("user-2")).toBe(88);
	});

	it("anchors the latest user once when a thread loads", async () => {
		await render(
			root,
			transcript({
				anchorMessageId: undefined,
				initialAnchorMessageId: undefined,
				responseHeight: 36,
			}),
		);
		const layout = installTranscriptLayout(container);

		await render(
			root,
			transcript({
				anchorMessageId: undefined,
				initialAnchorMessageId: "user-2",
				responseHeight: 36,
			}),
		);
		expect(layout.getMessageTop("user-2")).toBe(88);

		await act(async () => {
			layout.viewport.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
			layout.viewport.scrollTop = 200;
			layout.viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
		});
		const readerTop = layout.getMessageTop("assistant-1");

		await render(
			root,
			transcript({
				anchorMessageId: undefined,
				initialAnchorMessageId: "user-1",
				responseHeight: 36,
			}),
		);
		expect(layout.getMessageTop("assistant-1")).toBe(readerTop);
	});

	it("preserves the synthetic tail when the reader takes over scrolling", async () => {
		await render(root, transcript({ anchorMessageId: undefined, responseHeight: 36 }));
		const layout = installTranscriptLayout(container);

		await render(root, transcript({ anchorMessageId: "user-2", responseHeight: 36 }));
		expect(layout.spacer.hidden).toBe(false);
		const spacerHeight = layout.spacer.style.height;

		await act(async () => {
			layout.viewport.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
		});

		expect(layout.spacer.hidden).toBe(false);
		expect(layout.spacer.style.height).toBe(spacerHeight);
	});
});

function transcript({
	anchorMessageId,
	initialAnchorMessageId,
	responseHeight,
}: {
	anchorMessageId: string | undefined;
	initialAnchorMessageId?: string;
	responseHeight: number;
}) {
	return (
		<AiChatTranscriptScroller
			anchorMessageId={anchorMessageId}
			busy={true}
			initialAnchorMessageId={initialAnchorMessageId}
			reduceMotion={true}
		>
			<TestItem messageId="user-1" height={50} />
			<TestItem messageId="assistant-1" height={300} />
			<TestItem messageId="user-2" height={50} />
			<TestItem messageId="assistant-2" height={responseHeight} />
		</AiChatTranscriptScroller>
	);
}

function TestItem({ height, messageId }: { height: number; messageId: string }) {
	return (
		<AiChatTranscriptItem key={messageId} messageId={messageId}>
			<div data-test-row-height={height} />
		</AiChatTranscriptItem>
	);
}

function installTranscriptLayout(container: HTMLElement) {
	const viewport = container.querySelector<HTMLElement>('[aria-label="Messages"]');
	const content = container.querySelector<HTMLElement>('[role="log"]');
	const spacer = container.querySelector<HTMLElement>("[data-ai-chat-tail-spacer]");
	if (!viewport || !content || !spacer) {
		throw new Error("Expected a mounted transcript");
	}

	content.style.paddingTop = "48px";
	content.style.paddingBottom = "20px";
	content.style.rowGap = "20px";
	let storedScrollTop = 0;

	const getItems = () =>
		Array.from(content.children).filter(
			(child): child is HTMLElement => child instanceof HTMLElement && child !== spacer,
		);
	const getHeight = (item: HTMLElement) => {
		const row = item.firstElementChild;
		return row instanceof HTMLElement ? Number(row.dataset.testRowHeight) : 0;
	};
	const getContentHeight = () => {
		const items = getItems();
		const itemHeight = items.reduce((total, item) => total + getHeight(item), 0);
		const itemGaps = Math.max(0, items.length - 1) * 20;
		return 48 + itemHeight + itemGaps + spacer.getBoundingClientRect().height + 20;
	};
	const getMaxScrollTop = () => Math.max(0, getContentHeight() - 600);

	Object.defineProperties(viewport, {
		clientHeight: { configurable: true, get: () => 600 },
		scrollHeight: { configurable: true, get: () => Math.max(600, getContentHeight()) },
		scrollTop: {
			configurable: true,
			get: () => Math.min(storedScrollTop, getMaxScrollTop()),
			set: (value: number) => {
				storedScrollTop = Math.min(value, getMaxScrollTop());
			},
		},
	});
	viewport.getBoundingClientRect = () => new DOMRect(0, 0, 320, 600);
	Object.defineProperty(viewport, "scrollTo", {
		configurable: true,
		value: (optionsOrX: ScrollToOptions | number, y?: number) => {
			const top = typeof optionsOrX === "number" ? y : optionsOrX.top;
			if (typeof top === "number") {
				viewport.scrollTop = top;
			}
		},
	});
	spacer.getBoundingClientRect = () =>
		new DOMRect(0, 0, 320, spacer.hidden ? 0 : Number.parseFloat(spacer.style.height));

	for (const item of getItems()) {
		item.getBoundingClientRect = () => {
			let top = 48 - viewport.scrollTop;
			for (const candidate of getItems()) {
				if (candidate === item) {
					break;
				}
				top += getHeight(candidate) + 20;
			}

			return new DOMRect(0, top, 320, getHeight(item));
		};
	}

	return {
		spacer,
		viewport,
		getMessageTop(messageId: string) {
			const item = getItems().find((candidate) => candidate.dataset.aiChatMessageId === messageId);
			if (!item) {
				throw new Error(`Expected transcript item ${messageId}`);
			}

			return item.getBoundingClientRect().top;
		},
	};
}

async function render(root: Root, children: ReactNode) {
	await act(async () => root.render(children));
}
