import { cjk } from "@streamdown/cjk";
import { createMathPlugin } from "@streamdown/math";
import { createContext, type ComponentProps, use } from "react";
import { Streamdown, type StreamdownProps } from "streamdown";
import "katex/dist/katex.min.css";
import {
	parseWorkspaceReference,
	type WorkspaceLocation,
	type WorkspaceReference,
} from "#/features/workspaces/locations/workspace-location";
import { MarkdownCodeBlock } from "#/features/workspaces/components/ai-chat/ai-chat-code-block";
import { WorkspaceCitation } from "#/features/workspaces/components/ai-chat/WorkspaceCitation";
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
const WorkspaceCitationLocationsContext = createContext<
	ReadonlyMap<WorkspaceReference, WorkspaceLocation>
>(emptyWorkspaceCitationLocations);
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
	const children = citationProps.children;
	if (typeof children === "string" && children.trim().length > 0) {
		return children;
	}
	if (children !== undefined && children !== null && typeof children !== "string") {
		return null;
	}

	const ref = parseWorkspaceReference(citationProps.node?.properties?.ref);
	if (!ref) {
		return null;
	}

	const locations = use(WorkspaceCitationLocationsContext);
	const location = locations.get(ref);
	return location ? <WorkspaceCitation location={location} /> : null;
}

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
		citation: StreamdownWorkspaceCitation,
	};

	return (
		<WorkspaceCitationLocationsContext value={workspaceCitationLocations}>
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
		</WorkspaceCitationLocationsContext>
	);
}
