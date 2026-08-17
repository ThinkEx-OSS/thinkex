// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	AiChatTranscriptItem,
	AiChatTranscriptScroller,
} from "#/features/workspaces/components/ai-chat/AiChatTranscriptScroller";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("AiChatTranscriptScroller", () => {
	let container: HTMLDivElement;
	let resizeCallbacks: ResizeObserverCallback[];
	let root: Root;

	beforeEach(() => {
		resizeCallbacks = [];
		vi.stubGlobal(
			"ResizeObserver",
			class {
				constructor(callback: ResizeObserverCallback) {
					resizeCallbacks.push(callback);
				}

				disconnect() {}
				observe() {}
				unobserve() {}
			},
		);
		container = document.body.appendChild(document.createElement("div"));
		root = createRoot(container);
	});

	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it("holds the submitted turn at the reading line while the response height changes", async () => {
		await render(root, transcript({ anchorMessageId: undefined, responseHeight: 36 }));
		const layout = installTranscriptLayout(container);

		await render(root, transcript({ anchorMessageId: "user-2", responseHeight: 36 }));
		expect(layout.getMessageTop("user-2")).toBe(88);

		await render(root, transcript({ anchorMessageId: "user-2", responseHeight: 150 }));
		expect(layout.getMessageTop("user-2")).toBe(88);

		await render(root, transcript({ anchorMessageId: "user-2", responseHeight: 0 }));
		await notifyResize(resizeCallbacks);
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

	it("releases a previous turn anchor without removing its synthetic tail", async () => {
		await render(root, transcript({ anchorMessageId: undefined, responseHeight: 36 }));
		const layout = installTranscriptLayout(container);
		await render(root, transcript({ anchorMessageId: "user-2", responseHeight: 36 }));
		const spacerHeight = layout.spacer.style.height;

		await render(root, transcript({ anchorMessageId: undefined, responseHeight: 36 }));
		layout.setMessageHeight("user-1", 150);
		await notifyResize(resizeCallbacks);

		expect(layout.getMessageTop("user-2")).toBe(88);
		expect(layout.spacer.hidden).toBe(false);
		expect(layout.spacer.style.height).toBe(spacerHeight);
	});

	it("preserves the reader's visible row when earlier content resizes", async () => {
		await render(root, transcript({ anchorMessageId: undefined, responseHeight: 36 }));
		const layout = installTranscriptLayout(container);
		await render(root, transcript({ anchorMessageId: "user-2", responseHeight: 36 }));

		await act(async () => {
			layout.viewport.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
			layout.viewport.scrollTop = 200;
			layout.viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
		});
		const readerTop = layout.getMessageTop("assistant-1");
		const spacerHeight = layout.spacer.style.height;

		layout.setMessageHeight("user-1", 150);
		await notifyResize(resizeCallbacks);

		expect(layout.getMessageTop("assistant-1")).toBe(readerTop);
		expect(layout.spacer.style.height).toBe(spacerHeight);
	});

	it("settles a smooth anchor even when the browser does not dispatch scrollend", async () => {
		vi.useFakeTimers();
		await render(root, transcript({ anchorMessageId: undefined, responseHeight: 36 }));
		const layout = installTranscriptLayout(container);
		Object.defineProperty(layout.viewport, "scrollTo", {
			configurable: true,
			value: vi.fn(),
		});

		await render(
			root,
			transcript({
				anchorMessageId: "user-2",
				reduceMotion: false,
				responseHeight: 36,
				smoothAnchorMessageId: "user-2",
			}),
		);
		expect(layout.getMessageTop("user-2")).not.toBe(88);

		await act(async () => vi.advanceTimersByTimeAsync(1_000));

		expect(layout.getMessageTop("user-2")).toBe(88);
	});

	it("uses instant anchoring when reduced motion is requested", async () => {
		await render(root, transcript({ anchorMessageId: undefined, responseHeight: 36 }));
		const layout = installTranscriptLayout(container);
		const scrollTo = vi.spyOn(layout.viewport, "scrollTo");

		await render(
			root,
			transcript({
				anchorMessageId: "user-2",
				reduceMotion: true,
				responseHeight: 36,
				smoothAnchorMessageId: "user-2",
			}),
		);

		expect(scrollTo).toHaveBeenCalledWith({ behavior: "auto", top: 350 });
	});

	it("reconciles asynchronous content resizing through ResizeObserver", async () => {
		await render(root, transcript({ anchorMessageId: undefined, responseHeight: 36 }));
		const layout = installTranscriptLayout(container);
		await render(root, transcript({ anchorMessageId: "user-2", responseHeight: 36 }));
		expect(layout.getMessageTop("user-2")).toBe(88);

		layout.setMessageHeight("assistant-1", 420);
		await act(async () => {
			for (const callback of resizeCallbacks) {
				callback([], {} as ResizeObserver);
			}
		});

		expect(layout.getMessageTop("user-2")).toBe(88);
	});

	it("updates synthetic spacing when the transcript gap changes", async () => {
		await render(root, transcript({ anchorMessageId: undefined, responseHeight: 36 }));
		const layout = installTranscriptLayout(container);
		await render(root, transcript({ anchorMessageId: "user-2", responseHeight: 36 }));
		expect(layout.spacer.style.marginTop).toBe("-20px");

		layout.content.style.rowGap = "12px";
		await notifyResize(resizeCallbacks);

		expect(layout.spacer.style.marginTop).toBe("-12px");
	});

	it("defers repeated streaming geometry work to ResizeObserver", async () => {
		await render(root, transcript({ anchorMessageId: undefined, responseHeight: 36 }));
		const layout = installTranscriptLayout(container);
		await render(root, transcript({ anchorMessageId: "user-2", responseHeight: 36 }));
		const getAnchorRect = vi.spyOn(layout.getMessageElement("user-2"), "getBoundingClientRect");
		getAnchorRect.mockClear();

		await render(root, transcript({ anchorMessageId: "user-2", responseHeight: 150 }));
		expect(getAnchorRect).not.toHaveBeenCalled();

		await notifyResize(resizeCallbacks);
		expect(getAnchorRect).toHaveBeenCalled();
	});
});

function transcript({
	anchorMessageId,
	initialAnchorMessageId,
	reduceMotion = true,
	responseHeight,
	smoothAnchorMessageId,
}: {
	anchorMessageId: string | undefined;
	initialAnchorMessageId?: string;
	reduceMotion?: boolean;
	responseHeight: number;
	smoothAnchorMessageId?: string;
}) {
	return (
		<AiChatTranscriptScroller
			anchorMessageId={anchorMessageId}
			busy={true}
			initialAnchorMessageId={initialAnchorMessageId}
			reduceMotion={reduceMotion}
			smoothAnchorMessageId={smoothAnchorMessageId}
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
		content,
		spacer,
		viewport,
		getMessageElement(messageId: string) {
			const item = getItems().find((candidate) => candidate.dataset.aiChatMessageId === messageId);
			if (!item) {
				throw new Error(`Expected transcript item ${messageId}`);
			}
			return item;
		},
		setMessageHeight(messageId: string, height: number) {
			const item = getItems().find((candidate) => candidate.dataset.aiChatMessageId === messageId);
			const row = item?.firstElementChild;
			if (!(row instanceof HTMLElement)) {
				throw new Error(`Expected transcript item ${messageId}`);
			}
			row.dataset.testRowHeight = String(height);
		},
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

async function notifyResize(callbacks: ResizeObserverCallback[]) {
	await act(async () => {
		for (const callback of callbacks) {
			callback([], {} as ResizeObserver);
		}
	});
}
