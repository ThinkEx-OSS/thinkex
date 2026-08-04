import { Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useTheme } from "#/components/theme-provider";
import { Button } from "#/components/ui/button";
import {
	buildWidgetSandboxDocument,
	isWidgetSandboxFrameMessage,
	WIDGET_SANDBOX_MAX_HEIGHT,
	WIDGET_SANDBOX_MIN_HEIGHT,
	WIDGET_SANDBOX_TOKENS,
} from "#/features/workspaces/components/widget/workspace-widget-sandbox-document";
import { cn } from "#/lib/utils";

type WorkspaceWidgetSandboxProps = {
	html: string;
	className?: string;
	/**
	 * Fill the available space instead of sizing to the widget's own content.
	 * For the fullscreen view, where the container decides the height.
	 */
	fill?: boolean;
	/**
	 * Called with the runtime error text when the user asks the AI to fix a
	 * crashed widget. Omit to hide the affordance.
	 */
	onAskAiToFix?: (error: string) => void;
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
	fill = false,
	onAskAiToFix,
}: WorkspaceWidgetSandboxProps) {
	const { resolvedTheme } = useTheme();
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const [srcDoc, setSrcDoc] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [height, setHeight] = useState(WIDGET_SANDBOX_MIN_HEIGHT);

	// Build the sandbox document from the authored HTML plus the host's resolved
	// design tokens. Rebuilding on theme change or edit is a fresh render, so the
	// previous error clears with it.
	//
	// Everything happens in a frame callback, which also keeps the effect
	// render-safe. The tokens have to be read there rather than here: the theme
	// provider applies the `.dark` class in its own effect, and React runs a
	// child's effects before its parents', so reading now would take the previous
	// theme's values and pair them with the new theme's class.
	useEffect(() => {
		const frame = requestAnimationFrame(() => {
			const style = getComputedStyle(document.documentElement);
			const tokens: Record<string, string> = {};
			for (const name of WIDGET_SANDBOX_TOKENS) {
				tokens[name] = style.getPropertyValue(name).trim();
			}

			setSrcDoc(
				buildWidgetSandboxDocument({
					html,
					theme: resolvedTheme,
					tokens,
					origin: window.location.origin,
				}),
			);
			setError(null);
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
			if (event.data.kind === "error") {
				setError(event.data.message);
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
			setError(null);
		}

		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, []);

	return (
		// Height comes from the frame's own content, so the block takes the room
		// the widget needs instead of a number chosen here.
		<div
			className={cn("relative bg-background", fill && "h-full", className)}
			style={fill ? undefined : { height }}
		>
			<iframe
				ref={iframeRef}
				title="Widget preview"
				sandbox="allow-scripts"
				srcDoc={srcDoc ?? undefined}
				className="h-full w-full border-0 bg-background"
			/>
			{error ? (
				<div className="absolute inset-x-0 bottom-0 border-border/70 border-t bg-background/95 p-3 backdrop-blur-sm">
					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0">
							<p className="font-medium text-foreground text-sm">This widget hit an error</p>
							<pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap font-mono text-muted-foreground text-xs">
								{error}
							</pre>
						</div>
						{onAskAiToFix ? (
							<Button
								type="button"
								size="sm"
								variant="secondary"
								className="shrink-0"
								onClick={() => onAskAiToFix(error)}
							>
								<Sparkles className="size-4" />
								Ask AI to fix
							</Button>
						) : null}
					</div>
				</div>
			) : null}
		</div>
	);
}
