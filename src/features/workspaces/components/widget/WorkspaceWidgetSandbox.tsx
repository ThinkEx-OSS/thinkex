import { Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useTheme } from "#/components/theme-provider";
import { Button } from "#/components/ui/button";
import {
	buildWidgetSandboxDocument,
	isWidgetSandboxFrameMessage,
	WIDGET_SANDBOX_TOKENS,
} from "#/features/workspaces/components/widget/workspace-widget-sandbox-document";
import { cn } from "#/lib/utils";

type WorkspaceWidgetSandboxProps = {
	html: string;
	className?: string;
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
	onAskAiToFix,
}: WorkspaceWidgetSandboxProps) {
	const { resolvedTheme } = useTheme();
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const [srcDoc, setSrcDoc] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	// Build the sandbox document from the authored HTML plus the host's resolved
	// design tokens (read from the live root). Rebuilding on theme change or edit
	// is a fresh render, so the previous error clears with it. State is set in a
	// frame callback, not synchronously, to keep the effect render-safe.
	useEffect(() => {
		const style = getComputedStyle(document.documentElement);
		const tokens: Record<string, string> = {};
		for (const name of WIDGET_SANDBOX_TOKENS) {
			tokens[name] = style.getPropertyValue(name).trim();
		}
		const nextDoc = buildWidgetSandboxDocument({
			html,
			theme: resolvedTheme,
			tokens,
			origin: window.location.origin,
		});

		const frame = requestAnimationFrame(() => {
			setSrcDoc(nextDoc);
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
			} else {
				setError(null);
			}
		}

		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, []);

	return (
		<div className={cn("relative h-full min-h-0 bg-background", className)}>
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
