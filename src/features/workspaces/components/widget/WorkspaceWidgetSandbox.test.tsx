// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceWidgetSandbox } from "#/features/workspaces/components/widget/WorkspaceWidgetSandbox";
import {
	WIDGET_SANDBOX_FRAME_SOURCE,
	WIDGET_SANDBOX_HOST_SOURCE,
} from "#/features/workspaces/components/widget/workspace-widget-sandbox-document";

const themeState = vi.hoisted(() => ({ resolvedTheme: "light" as "light" | "dark" }));

vi.mock("#/components/theme-provider", () => ({
	useTheme: () => themeState,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("WorkspaceWidgetSandbox", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		themeState.resolvedTheme = "light";
		document.documentElement.style.setProperty("--background", "white");
		container = document.createElement("div");
		document.body.appendChild(container);
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

	it("updates the live frame theme without rebuilding authored HTML", async () => {
		await act(async () => root.render(<WorkspaceWidgetSandbox html="<p>one</p>" />));

		const iframe = container.querySelector("iframe");
		expect(iframe).not.toBeNull();
		if (!iframe?.contentWindow) throw new Error("Expected the sandbox iframe window");

		const initialDocument = iframe.getAttribute("srcdoc");
		expect(initialDocument).toContain("<p>one</p>");
		expect(initialDocument).toContain("var SESSION=1");

		const postMessage = vi.spyOn(iframe.contentWindow, "postMessage");
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						source: WIDGET_SANDBOX_FRAME_SOURCE,
						kind: "ready",
						sessionId: 1,
					},
					source: iframe.contentWindow,
				}),
			);
		});

		themeState.resolvedTheme = "dark";
		document.documentElement.style.setProperty("--background", "black");
		await act(async () => root.render(<WorkspaceWidgetSandbox html="<p>one</p>" />));

		expect(container.querySelector("iframe")).toBe(iframe);
		expect(iframe.getAttribute("srcdoc")).toBe(initialDocument);
		expect(postMessage).toHaveBeenLastCalledWith(
			{
				source: WIDGET_SANDBOX_HOST_SOURCE,
				kind: "theme",
				sessionId: 1,
				theme: "dark",
				tokens: expect.objectContaining({ "--background": "black" }),
			},
			"*",
		);

		await act(async () => root.render(<WorkspaceWidgetSandbox html="<p>two</p>" />));
		expect(iframe.getAttribute("srcdoc")).not.toBe(initialDocument);
		expect(iframe.getAttribute("srcdoc")).toContain("<p>two</p>");
		expect(iframe.getAttribute("srcdoc")).toContain("var SESSION=2");
	});

	it("lets the error view size itself instead of keeping the widget height", async () => {
		await act(async () => root.render(<WorkspaceWidgetSandbox html="<p>broken</p>" />));

		const iframe = container.querySelector("iframe");
		expect(iframe?.contentWindow).not.toBeNull();
		const frame = iframe?.parentElement;

		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						source: WIDGET_SANDBOX_FRAME_SOURCE,
						kind: "error",
						message: "Unexpected token",
						sessionId: 1,
					},
					source: iframe?.contentWindow,
				}),
			);
		});

		expect(frame?.style.height).toBe("");
		expect(frame?.querySelector('[role="alert"]')).not.toBeNull();
	});
});
