import { cjk } from "@streamdown/cjk";
import { createMathPlugin } from "@streamdown/math";
import type { ComponentProps } from "react";
import { Streamdown, type StreamdownProps } from "streamdown";
import "katex/dist/katex.min.css";
import {
	parseWorkspaceReference,
	type WorkspaceReference,
} from "#/features/workspaces/ai/workspace-reference";
import { MarkdownCodeBlock } from "#/features/workspaces/components/ai-chat/ai-chat-code-block";
import { WorkspaceCitation } from "#/features/workspaces/components/ai-chat/WorkspaceCitation";
import type { WorkspaceLocation } from "#/features/workspaces/locations/workspace-location";
import { cn } from "#/lib/utils";

type AiChatMessageResponseProps = Omit<
	ComponentProps<typeof Streamdown>,
	"allowedTags" | "literalTagContent"
> & {
	isStreaming?: boolean;
	workspaceCitationLocations?: ReadonlyMap<WorkspaceReference, WorkspaceLocation>;
};

const math = createMathPlugin({
	errorColor: "var(--color-muted-foreground)",
	singleDollarTextMath: true,
});
const streamdownPlugins = { cjk, math };
const streamdownComponents = { code: MarkdownCodeBlock };
const streamdownAllowedTags = { citation: ["ref"] };
const streamdownLiteralTagContent = ["citation"];
const emptyWorkspaceCitationLocations = new Map<WorkspaceReference, WorkspaceLocation>();
const streamdownAnimation = {
	animation: "fadeIn",
	duration: 160,
	easing: "cubic-bezier(0.16, 1, 0.3, 1)",
	sep: "word",
	stagger: 8,
} satisfies NonNullable<StreamdownProps["animated"]>;

export function AiChatMessageResponse({
	className,
	components,
	isStreaming = false,
	workspaceCitationLocations = emptyWorkspaceCitationLocations,
	...props
}: AiChatMessageResponseProps) {
	const mergedComponents = {
		...streamdownComponents,
		...components,
		citation: (citationProps: Record<string, unknown>) => {
			const parsed = parseWorkspaceReference(citationProps.ref);
			if (parsed.status === "invalid") {
				return null;
			}

			const location = workspaceCitationLocations.get(parsed.ref);
			return location ? <WorkspaceCitation location={location} /> : null;
		},
	};

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
		/>
	);
}
