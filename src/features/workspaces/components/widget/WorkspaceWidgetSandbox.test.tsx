// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceWidgetSandbox } from "#/features/workspaces/components/widget/WorkspaceWidgetSandbox";
import {
	WIDGET_SANDBOX_FRAME_SOURCE,
	WIDGET_SANDBOX_HOST_SOURCE,
} from "#/features/workspaces/components/widget/workspace-widget-sandbox-document";

const themeState = vi.hoisted(() => ({ resolvedTheme: "light" as "light" | "dark" }));

vi.mock("#/components/theme-provider", () => ({ useTheme: () => themeState }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("WorkspaceWidgetSandbox", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		themeState.resolvedTheme = "light";
		document.documentElement.style.setProperty("--background", "white");
		container = document.body.appendChild(document.createElement("div"));
		root = createRoot(container);
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
			callback(0);
			return 1;
		});
		vi.stubGlobal("cancelAnimationFrame", vi.fn());
	});

	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
		document.documentElement.style.removeProperty("--background");
		vi.unstubAllGlobals();
	});

	it("preserves a live widget across theme changes and rejects stale messages", async () => {
		await render(root, <WorkspaceWidgetSandbox html="<p>one</p>" label="Counter" />);
		const iframe = getIframe(container);
		const frame = iframe.parentElement;
		const initialDocument = iframe.getAttribute("srcdoc");
		const postMessage = vi.spyOn(iframe.contentWindow, "postMessage");

		await sendFrameMessage(iframe, { kind: "ready", sessionId: 1 });
		await sendFrameMessage(iframe, { height: 900, kind: "height", sessionId: 1 });
		expect(frame?.style.height).toBe("720px");

		themeState.resolvedTheme = "dark";
		document.documentElement.style.setProperty("--background", "black");
		await render(root, <WorkspaceWidgetSandbox html="<p>one</p>" label="Counter" />);

		expect(container.querySelector("iframe")).toBe(iframe);
		expect(iframe.title).toBe("Counter widget");
		expect(iframe.getAttribute("srcdoc")).toBe(initialDocument);
		expect(postMessage).toHaveBeenLastCalledWith(
			{
				kind: "theme",
				sessionId: 1,
				source: WIDGET_SANDBOX_HOST_SOURCE,
				theme: "dark",
				tokens: expect.objectContaining({ "--background": "black" }),
			},
			"*",
		);

		await render(root, <WorkspaceWidgetSandbox html="<p>two</p>" />);
		expect(frame?.style.height).toBe("120px");
		expect(iframe.getAttribute("srcdoc")).toContain("var SESSION=2");
		await sendFrameMessage(iframe, { height: 500, kind: "height", sessionId: 1 });
		expect(frame?.style.height).toBe("120px");
	});

	it("lets a load error size itself instead of reloading broken source", async () => {
		await render(root, <WorkspaceWidgetSandbox html="<p>broken</p>" />);
		const iframe = getIframe(container);
		const frame = iframe.parentElement;

		await sendFrameMessage(iframe, {
			kind: "error",
			message: "Unexpected token",
			sessionId: 1,
		});

		expect(frame?.style.height).toBe("");
		expect(frame?.querySelector("iframe")).toBeNull();
		expect(frame?.querySelector("button")).toBeNull();
	});

	it("keeps a ready widget mounted after a runtime error", async () => {
		await render(root, <WorkspaceWidgetSandbox html="<button>Run</button>" />);
		const iframe = getIframe(container);
		const frame = iframe.parentElement;

		await sendFrameMessage(iframe, { kind: "ready", sessionId: 1 });
		await sendFrameMessage(iframe, { kind: "error", message: "Click failed", sessionId: 1 });

		expect(frame?.querySelector("iframe")).toBe(iframe);
		await clickButton(frame, "Dismiss");
		expect(frame?.querySelector('[role="alert"]')).toBeNull();
		expect(frame?.querySelector("iframe")).toBe(iframe);
	});
});

async function render(root: Root, element: ReactNode) {
	await act(async () => root.render(element));
}

function getIframe(container: HTMLElement) {
	const iframe = container.querySelector("iframe");
	if (!iframe?.contentWindow) throw new Error("Expected the sandbox iframe window");
	return iframe as HTMLIFrameElement & { contentWindow: Window };
}

async function sendFrameMessage(
	iframe: HTMLIFrameElement,
	message:
		| { kind: "ready"; sessionId: number }
		| { height: number; kind: "height"; sessionId: number }
		| { kind: "error"; message: string; sessionId: number },
) {
	await act(async () => {
		window.dispatchEvent(
			new MessageEvent("message", {
				data: { ...message, source: WIDGET_SANDBOX_FRAME_SOURCE },
				source: iframe.contentWindow,
			}),
		);
	});
}

async function clickButton(container: HTMLElement | null, label: string) {
	const button = [...(container?.querySelectorAll("button") ?? [])].find(
		(candidate) => candidate.textContent === label,
	);
	await act(async () => button?.click());
}
