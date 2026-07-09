import { Check, Copy, GitBranch, Maximize2, Minimize2, Minus, Plus } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useIsCodeFenceIncomplete } from "streamdown";

import { useTheme } from "#/components/theme-provider";
import {
	CodeBlockActions,
	CodeBlockHeader,
	CodeBlockLabel,
	CodeBlockTitle,
} from "#/components/code-block/code-block-chrome";
import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "#/components/ui/dialog";
import { useCopyToClipboard } from "#/hooks/use-copy-to-clipboard";
import { cn } from "#/lib/utils";

const MAX_MERMAID_SOURCE_LENGTH = 40_000;
const MERMAID_RENDER_ROOT_MARGIN = "320px";
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.25;

type MermaidImage = { alt: string; src: string; width: number };

type MermaidRenderResult =
	| { image: MermaidImage; requestKey: string; status: "ready" }
	| { requestKey: string; status: "error" };

let mermaidRenderQueue = Promise.resolve();

function enqueueMermaidRender(input: { darkMode: boolean; id: string; source: string }) {
	const render = mermaidRenderQueue.then(async () => {
		const { default: mermaid } = await import("mermaid");
		const palette = input.darkMode
			? {
					background: "#171717",
					border: "#525252",
					line: "#a3a3a3",
					surface: "#262626",
					surfaceStrong: "#404040",
					text: "#f5f5f5",
				}
			: {
					background: "#fafaf9",
					border: "#a8a29e",
					line: "#78716c",
					surface: "#f5f5f4",
					surfaceStrong: "#e7e5e4",
					text: "#292524",
				};

		mermaid.initialize({
			fontFamily: "Geist, ui-sans-serif, sans-serif",
			htmlLabels: false,
			look: "neo",
			securityLevel: "strict",
			startOnLoad: false,
			suppressErrorRendering: true,
			theme: "base",
			themeVariables: {
				background: palette.background,
				darkMode: input.darkMode,
				dropShadow: "none",
				lineColor: palette.line,
				noteBkgColor: palette.surface,
				noteBorderColor: palette.border,
				noteTextColor: palette.text,
				primaryBorderColor: palette.border,
				primaryColor: palette.surface,
				primaryTextColor: palette.text,
				secondaryBorderColor: palette.border,
				secondaryColor: palette.surfaceStrong,
				secondaryTextColor: palette.text,
				tertiaryBorderColor: palette.border,
				tertiaryColor: palette.background,
				tertiaryTextColor: palette.text,
				textColor: palette.text,
				useGradient: false,
			},
		});

		return mermaid.render(input.id, input.source);
	});

	mermaidRenderQueue = render.then(
		() => undefined,
		() => undefined,
	);

	return render;
}

function prepareMermaidImage(svg: string): MermaidImage {
	const document = new DOMParser().parseFromString(svg, "image/svg+xml");
	const root = document.documentElement;
	const width = Number(root.getAttribute("viewBox")?.trim().split(/\s+/)[2]);
	if (
		document.querySelector("parsererror") ||
		root.localName !== "svg" ||
		root.namespaceURI !== "http://www.w3.org/2000/svg" ||
		!Number.isFinite(width) ||
		width <= 0
	) {
		throw new Error("Mermaid returned malformed SVG");
	}

	return {
		alt:
			root.querySelector("desc")?.textContent?.trim() ||
			root.querySelector("title")?.textContent?.trim() ||
			"Mermaid diagram",
		src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
		width,
	};
}

function useNearViewport() {
	const containerRef = useRef<HTMLDivElement>(null);
	const [isNearViewport, setIsNearViewport] = useState(false);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}

		if (typeof IntersectionObserver === "undefined") {
			const timeout = window.setTimeout(() => setIsNearViewport(true), 0);
			return () => window.clearTimeout(timeout);
		}

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					setIsNearViewport(true);
					observer.disconnect();
				}
			},
			{ rootMargin: MERMAID_RENDER_ROOT_MARGIN },
		);

		observer.observe(container);
		return () => observer.disconnect();
	}, []);

	return { containerRef, isNearViewport };
}

export function AiChatMermaidDiagram({ source }: { source: string }) {
	const isIncomplete = useIsCodeFenceIncomplete();
	const { resolvedTheme } = useTheme();
	const reactId = useId();
	const { containerRef, isNearViewport } = useNearViewport();
	const requestKey = `${resolvedTheme}:${source}`;
	const sourceIsTooLarge = source.length > MAX_MERMAID_SOURCE_LENGTH;
	const [result, setResult] = useState<MermaidRenderResult | null>(null);

	useEffect(() => {
		if (!isNearViewport || isIncomplete || sourceIsTooLarge) {
			return;
		}

		let cancelled = false;
		const id = `thinkex-mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

		void (async () => {
			try {
				const { svg } = await enqueueMermaidRender({
					darkMode: resolvedTheme === "dark",
					id,
					source,
				});
				if (cancelled) {
					return;
				}

				setResult({ image: prepareMermaidImage(svg), requestKey, status: "ready" });
			} catch (error: unknown) {
				if (cancelled) {
					return;
				}

				console.warn("[AiChatMermaidDiagram] Failed to render diagram", error);
				setResult({ requestKey, status: "error" });
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [isIncomplete, isNearViewport, reactId, requestKey, resolvedTheme, source, sourceIsTooLarge]);

	const state: MermaidRenderResult | { status: "loading" } = sourceIsTooLarge
		? { requestKey, status: "error" }
		: isIncomplete || result?.requestKey !== requestKey
			? { status: "loading" }
			: result;

	return (
		<div className="my-4" data-ai-chat-mermaid={state.status} ref={containerRef}>
			{state.status === "loading" ? <MermaidLoading /> : null}
			{state.status === "error" ? <MermaidError source={source} /> : null}
			{state.status === "ready" ? (
				<MermaidDiagramCard
					image={state.image}
					onImageError={() => setResult({ requestKey, status: "error" })}
					source={source}
				/>
			) : null}
		</div>
	);
}

function MermaidLoading() {
	return (
		<div
			className="grid min-h-36 place-items-center rounded-xl border bg-muted/15 px-4 py-8 text-muted-foreground text-sm"
			role="status"
		>
			<div className="flex items-center gap-2">
				<GitBranch className="size-4" aria-hidden="true" />
				Drawing diagram…
			</div>
		</div>
	);
}

function MermaidError({ source }: { source: string }) {
	return (
		<div className="overflow-hidden rounded-xl border bg-muted/15">
			<div className="flex min-h-10 items-center gap-2 border-b px-3 py-2 text-sm">
				<GitBranch className="size-4 text-muted-foreground" aria-hidden="true" />
				<span className="font-medium">Diagram unavailable</span>
			</div>
			<div className="px-3 py-3 text-muted-foreground text-sm">
				<p>This diagram couldn’t be displayed, but the rest of the response is unaffected.</p>
				<details className="mt-2">
					<summary className="w-fit cursor-pointer text-xs underline-offset-4 hover:underline">
						View diagram source
					</summary>
					<pre className="mt-2 max-h-64 overflow-auto rounded-md border bg-background p-3 whitespace-pre-wrap break-words font-mono text-xs text-foreground">
						{source}
					</pre>
				</details>
			</div>
		</div>
	);
}

function MermaidDiagramCard({
	image,
	onImageError,
	source,
}: {
	image: MermaidImage;
	onImageError: () => void;
	source: string;
}) {
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [zoom, setZoom] = useState(1);
	const { copied, copy } = useCopyToClipboard({
		onError: (error) => {
			console.warn("[AiChatMermaidDiagram] Failed to copy source", error);
		},
	});

	return (
		<>
			<section className="overflow-hidden rounded-xl border bg-background shadow-xs">
				<CodeBlockHeader className="min-h-10">
					<CodeBlockTitle>
						<GitBranch className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
						<CodeBlockLabel>Diagram</CodeBlockLabel>
					</CodeBlockTitle>
					<CodeBlockActions>
						<DiagramZoomControls onZoomChange={setZoom} zoom={zoom} />
						<DiagramControl label="View fullscreen" onClick={() => setIsFullscreen(true)}>
							<Maximize2 />
						</DiagramControl>
						<span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
						<DiagramControl
							label={copied ? "Copied" : "Copy diagram source"}
							onClick={() => void copy(source)}
						>
							{copied ? <Check /> : <Copy />}
						</DiagramControl>
					</CodeBlockActions>
				</CodeBlockHeader>
				<DiagramCanvas
					className="overflow-x-auto overflow-y-hidden"
					image={image}
					onImageError={onImageError}
					zoom={zoom}
				/>
			</section>

			<Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
				<DialogContent
					className="fixed inset-0 top-0 left-0 flex h-dvh w-dvw max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-background p-0 sm:max-w-none"
					showCloseButton={false}
				>
					<CodeBlockHeader className="min-h-12 shrink-0 px-4">
						<CodeBlockTitle>
							<GitBranch className="size-4 text-muted-foreground" aria-hidden="true" />
							<DialogTitle className="text-sm">Diagram</DialogTitle>
						</CodeBlockTitle>
						<CodeBlockActions>
							<DiagramZoomControls onZoomChange={setZoom} zoom={zoom} />
							<DiagramControl label="Exit fullscreen" onClick={() => setIsFullscreen(false)}>
								<Minimize2 />
							</DiagramControl>
						</CodeBlockActions>
					</CodeBlockHeader>
					<DiagramCanvas
						className="min-h-0 flex-1 overflow-auto p-6"
						image={image}
						onImageError={onImageError}
						zoom={zoom}
					/>
				</DialogContent>
			</Dialog>
		</>
	);
}

function DiagramZoomControls({
	onZoomChange,
	zoom,
}: {
	onZoomChange: (zoom: number) => void;
	zoom: number;
}) {
	const zoomBy = (delta: number) => {
		onZoomChange(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom + delta)));
	};

	return (
		<div className="flex items-center gap-0.5" role="group" aria-label="Diagram zoom controls">
			<DiagramControl
				label="Zoom out"
				disabled={zoom <= MIN_ZOOM}
				onClick={() => zoomBy(-ZOOM_STEP)}
			>
				<Minus />
			</DiagramControl>
			<span className="min-w-10 text-center font-normal text-[11px] tabular-nums">
				{Math.round(zoom * 100)}%
			</span>
			<DiagramControl label="Zoom in" disabled={zoom >= MAX_ZOOM} onClick={() => zoomBy(ZOOM_STEP)}>
				<Plus />
			</DiagramControl>
		</div>
	);
}

function DiagramCanvas({
	className,
	image,
	onImageError,
	zoom,
}: {
	className?: string;
	image: MermaidImage;
	onImageError: () => void;
	zoom: number;
}) {
	return (
		<div className={cn("bg-muted/10 p-4", className)}>
			<div
				className="mx-auto transition-[width] duration-150 ease-out"
				style={{ width: `min(${zoom * 100}%, ${image.width * zoom}px)` }}
			>
				<img
					alt={image.alt}
					className="h-auto w-full"
					draggable={false}
					onError={onImageError}
					src={image.src}
				/>
			</div>
		</div>
	);
}

function DiagramControl({
	children,
	disabled = false,
	label,
	onClick,
}: {
	children: React.ReactNode;
	disabled?: boolean;
	label: string;
	onClick: () => void;
}) {
	return (
		<Button
			aria-label={label}
			className="size-7 text-muted-foreground [&_svg]:size-3.5"
			disabled={disabled}
			onClick={onClick}
			size="icon"
			title={label}
			type="button"
			variant="ghost"
		>
			{children}
		</Button>
	);
}
