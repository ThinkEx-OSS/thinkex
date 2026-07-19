export type AiToolActivityIconKind = "code" | "edit" | "file" | "search" | "web";
export type AiToolAccess = "read" | "write";
export type AiToolVisibility = "hidden" | "visible";

export interface AiToolModelPolicy {
	access: AiToolAccess;
	codemode: boolean;
}

interface AiToolDefinition {
	model: AiToolModelPolicy;
	ui: {
		icon: AiToolActivityIconKind;
		title: string;
		visibility: AiToolVisibility;
	};
}

function defineAiToolRegistry<const TRegistry extends Record<string, AiToolDefinition>>(
	registry: TRegistry,
) {
	return registry;
}

export const AI_TOOL_REGISTRY = defineAiToolRegistry({
	sandbox_bash: readTool({ icon: "code", title: "Sandbox", visibility: "hidden" }, false),
	orchestrate: readTool({ icon: "code", title: "Work through task" }, false),
	compute: readTool({ icon: "code", title: "Run Python" }),
	web_search: readTool({ icon: "search", title: "Search web" }),
	web_markdown: readTool({ icon: "web", title: "Read webpage" }),
	web_links: readTool({ icon: "web", title: "Find links" }),
	research_discover: readTool({
		icon: "search",
		title: "Discover research",
	}),
	research_deepen: readTool({
		icon: "web",
		title: "Read research",
	}),
	time_get_current: readTool({ icon: "web", title: "Check time", visibility: "hidden" }),
	time_calculate_relative: readTool({
		icon: "web",
		title: "Calculate time",
		visibility: "hidden",
	}),
	workspace_list_items: readTool({ icon: "file", title: "List workspace" }),
	workspace_read_items: readTool({ icon: "file", title: "Read workspace" }),
	workspace_rename_item: writeTool({ icon: "edit", title: "Rename item" }),
	workspace_move_items: writeTool({ icon: "edit", title: "Move items" }),
	workspace_create_items: writeTool({ icon: "edit", title: "Create items" }),
	workspace_delete_items: writeTool({ icon: "edit", title: "Delete items" }),
	workspace_edit_item: writeTool({ icon: "edit", title: "Edit item" }),
	workspace_link_items: writeTool({ icon: "edit", title: "Link items", visibility: "hidden" }),
});

export type AiToolName = keyof typeof AI_TOOL_REGISTRY;
export type AiToolPresentation = (typeof AI_TOOL_REGISTRY)[AiToolName]["ui"];

const fallbackPresentation = {
	icon: "web",
	title: "Tool",
	visibility: "visible",
} as const satisfies AiToolDefinition["ui"];

export function getAiToolDefinition(name: string): AiToolDefinition | undefined {
	return Object.hasOwn(AI_TOOL_REGISTRY, name) ? AI_TOOL_REGISTRY[name as AiToolName] : undefined;
}

export function requireAiToolDefinition(name: string): AiToolDefinition {
	const definition = getAiToolDefinition(name);

	if (!definition) {
		throw new Error(`Unregistered AI tool: ${name}`);
	}

	return definition;
}

export function getAiToolPresentation(name: string): AiToolDefinition["ui"] {
	return (
		getAiToolDefinition(name)?.ui ?? {
			...fallbackPresentation,
			title: formatUnknownToolTitle(name),
		}
	);
}

type AiToolPresentationInput = Pick<AiToolDefinition["ui"], "icon" | "title"> &
	Partial<Omit<AiToolDefinition["ui"], "icon" | "title">>;

function readTool(ui: AiToolPresentationInput, codemode = true): AiToolDefinition {
	return toolDefinition("read", codemode, ui);
}

function writeTool(ui: AiToolPresentationInput): AiToolDefinition {
	// Code Mode exposes only an execution ID, not a stable per-call ID. Keep
	// mutations direct until it can preserve workspace operation idempotency.
	return toolDefinition("write", false, ui);
}

function toolDefinition(
	access: AiToolAccess,
	codemode: boolean,
	ui: AiToolPresentationInput,
): AiToolDefinition {
	return {
		model: { access, codemode },
		ui: {
			icon: ui.icon,
			title: ui.title,
			visibility: ui.visibility ?? "visible",
		},
	};
}

function formatUnknownToolTitle(name: string) {
	const words = name.split(/[_-]+/).filter(Boolean);
	if (words.length === 0) {
		return fallbackPresentation.title;
	}

	const title = words.join(" ");
	return title.charAt(0).toUpperCase() + title.slice(1);
}
