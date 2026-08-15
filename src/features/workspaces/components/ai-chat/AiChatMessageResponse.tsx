import { cjk } from "@streamdown/cjk";
import { createMathPlugin } from "@streamdown/math";
import { type ComponentProps, useEffect } from "react";
import { Streamdown, type StreamdownProps } from "streamdown";
import "katex/dist/katex.min.css";
// Extends the shared KaTeX instance with \ce{} chemistry and \pu{} units.
import "katex/contrib/mhchem";
import { useWorkspaceLocationActions } from "#/features/workspaces/locations/workspace-location-context";
import { MarkdownCodeBlock } from "#/features/workspaces/components/ai-chat/ai-chat-code-block";
import { normalizeLlmMarkdown } from "#/features/workspaces/components/ai-chat/normalize-llm-markdown";
import { WorkspaceCitation } from "#/features/workspaces/components/WorkspaceCitation";
import { cn } from "#/lib/utils";

type AiChatMessageResponseProps = Omit<
	ComponentProps<typeof Streamdown>,
	"allowedTags" | "literalTagContent"
> & {
	isStreaming?: boolean;
};

const math = createMathPlugin({
	errorColor: "var(--color-muted-foreground)",
	singleDollarTextMath: true,
});
const streamdownPlugins = { cjk, math };
const streamdownComponents = { code: MarkdownCodeBlock };
const streamdownAllowedTags = { citation: ["ref"] };
const streamdownLiteralTagContent = ["citation"];
const streamdownAnimation = {
	animation: "fadeIn",
	duration: 160,
	easing: "cubic-bezier(0.16, 1, 0.3, 1)",
	sep: "word",
	stagger: 8,
} satisfies NonNullable<StreamdownProps["animated"]>;

type StreamdownCitationProps = Record<string, unknown> & {
	readonly node?: {
		readonly properties?: Readonly<Record<string, unknown>>;
	};
};

function StreamdownWorkspaceCitation(citationProps: StreamdownCitationProps) {
	const { resolveAddress } = useWorkspaceLocationActions();
	const children = citationProps.children;
	if (typeof children === "string" && children.trim().length > 0) {
		return children;
	}
	if (children !== undefined && children !== null && typeof children !== "string") {
		return null;
	}

	const location = resolveAddress(citationProps.node?.properties?.ref);
	return location ? <WorkspaceCitation location={location} /> : null;
}

export function AiChatMessageResponse({
	children,
	className,
	components,
	isStreaming = false,
	...props
}: AiChatMessageResponseProps) {
	useEffect(() => {
		// This browser-only module installs KaTeX's global copy listener.
		void import("katex/contrib/copy-tex");
	}, []);

	const mergedComponents = {
		...streamdownComponents,
		...components,
		citation: StreamdownWorkspaceCitation,
	};
	const normalizedChildren =
		typeof children === "string" ? normalizeLlmMarkdown(children) : children;

	return (
		<Streamdown
			animated={streamdownAnimation}
			className={cn("[&>ol]:pl-2 [&>ul]:pl-2", className)}
			components={mergedComponents}
			isAnimating={isStreaming}
			linkSafety={{ enabled: false }}
			mode="streaming"
			plugins={streamdownPlugins}
			{...props}
			allowedTags={streamdownAllowedTags}
			literalTagContent={streamdownLiteralTagContent}
		>
			{normalizedChildren}
		</Streamdown>
	);
}
