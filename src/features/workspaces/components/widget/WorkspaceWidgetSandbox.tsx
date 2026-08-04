import { useEffect, useRef, useState } from "react";

import { useTheme } from "#/components/theme-provider";
import { Button } from "#/components/ui/button";
import {
	buildWidgetSandboxDocument,
	isWidgetSandboxFrameMessage,
	type WidgetSandboxHostMessage,
	type WidgetSandboxTheme,
	WIDGET_SANDBOX_MAX_HEIGHT,
	WIDGET_SANDBOX_MIN_HEIGHT,
	WIDGET_SANDBOX_HOST_SOURCE,
	WIDGET_SANDBOX_TOKENS,
} from "#/features/workspaces/components/widget/workspace-widget-sandbox-document";
import { cn } from "#/lib/utils";

type WorkspaceWidgetSandboxProps = {
	html: string;
	className?: string;
	label?: string;
	/**
	 * Called with the runtime error text when the user asks the AI to fix a
	 * crashed widget. Omit to hide the affordance.
	 */
	onAskAiToFix?: (error: string) => void;
};

type WidgetSandboxError = {
	message: string;
	preserveFrame: boolean;
};

/**
 * Renders untrusted, AI-authored widget HTML inside an opaque-origin sandbox
 * iframe. The frame cannot reach the parent's cookies, storage, or DOM. Host
 * design tokens are injected so the widget looks native in both themes, and
 * runtime errors surface a muted banner (with an optional "Ask AI to fix"
 * action) instead of a blank frame.
 */
export function WorkspaceWidgetSandbox({
	html,
	className,
	label,
	onAskAiToFix,
}: WorkspaceWidgetSandboxProps) {
	const { resolvedTheme } = useTheme();
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const renderedHtmlRef = useRef<string | null>(null);
	const sessionIdRef = useRef(0);
	const readySessionIdRef = useRef<number | null>(null);
	const themeRef = useRef<WidgetSandboxTheme | null>(null);
	const [srcDoc, setSrcDoc] = useState<string | null>(null);
	const [error, setError] = useState<WidgetSandboxError | null>(null);
	const [height, setHeight] = useState(WIDGET_SANDBOX_MIN_HEIGHT);

	// Build a fresh document only when authored HTML changes. Theme changes send
	// a full token snapshot into the existing frame, preserving its JS state.
	//
	// Everything happens in a frame callback, which also keeps the effect
	// render-safe. The tokens have to be read there rather than here: the theme
	// provider applies the `.dark` class in its own effect, and React runs a
	// child's effects before its parents', so reading now would take the previous
	// theme's values and pair them with the new theme's class.
	useEffect(() => {
		const frame = requestAnimationFrame(() => {
			const theme = readWidgetSandboxTheme(resolvedTheme);
			themeRef.current = theme;

			if (renderedHtmlRef.current !== html) {
				renderedHtmlRef.current = html;
				sessionIdRef.current += 1;
				readySessionIdRef.current = null;
				setHeight(WIDGET_SANDBOX_MIN_HEIGHT);
				setSrcDoc(
					buildWidgetSandboxDocument({
						html,
						...theme,
						origin: window.location.origin,
						sessionId: sessionIdRef.current,
					}),
				);
				setError(null);
				return;
			}

			if (readySessionIdRef.current === sessionIdRef.current) {
				postWidgetSandboxTheme(iframeRef.current, sessionIdRef.current, theme);
			}
		});
		return () => cancelAnimationFrame(frame);
	}, [html, resolvedTheme]);

	useEffect(() => {
		function onMessage(event: MessageEvent) {
			if (event.source !== iframeRef.current?.contentWindow) {
				return;
			}
			if (!isWidgetSandboxFrameMessage(event.data)) {
				return;
			}
			if (event.data.sessionId !== sessionIdRef.current) {
				return;
			}
			if (event.data.kind === "error") {
				setError({
					message: event.data.message,
					preserveFrame: readySessionIdRef.current === event.data.sessionId,
				});
				return;
			}
			if (event.data.kind === "height") {
				setHeight(
					Math.min(
						WIDGET_SANDBOX_MAX_HEIGHT,
						Math.max(WIDGET_SANDBOX_MIN_HEIGHT, event.data.height),
					),
				);
				return;
			}
			readySessionIdRef.current = event.data.sessionId;
			if (themeRef.current) {
				postWidgetSandboxTheme(iframeRef.current, event.data.sessionId, themeRef.current);
			}
		}

		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, []);

	const retryWidget = () => {
		readySessionIdRef.current = null;
		setError(null);
		setHeight(WIDGET_SANDBOX_MIN_HEIGHT);
	};
	const showFrame = !error || error.preserveFrame;

	return (
		// Height comes from the frame's own content, so the block takes the room
		// the widget needs instead of a number chosen here.
		<div
			className={cn("relative bg-background", className)}
			style={showFrame ? { height } : undefined}
		>
			{showFrame ? (
				<iframe
					ref={iframeRef}
					title={label ? `${label} widget` : "Widget"}
					sandbox="allow-scripts"
					srcDoc={srcDoc ?? undefined}
					className="h-full w-full border-0 bg-background"
				/>
			) : null}
			{error ? (
				<div
					role="alert"
					className={cn(
						"flex min-h-48 flex-col items-center justify-center gap-4 bg-background p-6 text-center",
						error.preserveFrame && "absolute inset-0 z-10 min-h-0 bg-background/95",
					)}
				>
					<p className="font-medium text-foreground text-sm">Widget error</p>
					<div className="max-h-32 w-full max-w-lg overflow-auto whitespace-pre-wrap rounded-md bg-muted px-4 py-3 font-mono text-muted-foreground text-xs leading-relaxed">
						{error.message}
					</div>
					<div className="flex items-center gap-2">
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={error.preserveFrame ? () => setError(null) : retryWidget}
						>
							{error.preserveFrame ? "Dismiss" : "Try again"}
						</Button>
						{onAskAiToFix ? (
							<Button
								type="button"
								size="sm"
								variant="secondary"
								onClick={() => onAskAiToFix(error.message)}
							>
								Ask AI to fix
							</Button>
						) : null}
					</div>
				</div>
			) : null}
		</div>
	);
}

function readWidgetSandboxTheme(theme: WidgetSandboxTheme["theme"]): WidgetSandboxTheme {
	const style = getComputedStyle(document.documentElement);
	const tokens: Record<string, string> = {};
	for (const name of WIDGET_SANDBOX_TOKENS) {
		tokens[name] = style.getPropertyValue(name).trim();
	}
	return { theme, tokens };
}

function postWidgetSandboxTheme(
	iframe: HTMLIFrameElement | null,
	sessionId: number,
	theme: WidgetSandboxTheme,
) {
	const message: WidgetSandboxHostMessage = {
		source: WIDGET_SANDBOX_HOST_SOURCE,
		kind: "theme",
		sessionId,
		...theme,
	};
	iframe?.contentWindow?.postMessage(message, "*");
}
