export type AiToolVisibility = "hidden" | "visible";
export type AiToolActivityIconKind = "code" | "edit" | "file" | "search" | "web";

interface AiToolPresentation {
	title?: string;
	visibility: AiToolVisibility;
}

const defaultToolPresentation = {
	visibility: "visible",
} as const satisfies AiToolPresentation;

const aiToolPresentationByName: Readonly<Record<string, AiToolPresentation>> = {
	compute: { title: "Python", visibility: "visible" },
	orchestrate: { title: "Working", visibility: "visible" },
	research_deepen: { title: "Research", visibility: "visible" },
	research_discover: { title: "Research", visibility: "visible" },
	sandbox_bash: { visibility: "hidden" },
	web_links: { title: "Web links", visibility: "visible" },
	web_markdown: { title: "Web page", visibility: "visible" },
	web_search: { title: "Web search", visibility: "visible" },
	workspace_create_items: { title: "Workspace", visibility: "visible" },
	workspace_delete_items: { title: "Workspace", visibility: "visible" },
	workspace_edit_item: { title: "Workspace", visibility: "visible" },
	workspace_link_items: { visibility: "hidden" },
	workspace_list_items: { title: "Workspace", visibility: "visible" },
	workspace_move_items: { title: "Workspace", visibility: "visible" },
	workspace_read_items: { title: "Workspace", visibility: "visible" },
	workspace_rename_item: { title: "Workspace", visibility: "visible" },
};

export function getAiToolPresentation(toolName: string): AiToolPresentation {
	if (toolName.startsWith("time_")) {
		return { visibility: "hidden" };
	}

	return aiToolPresentationByName[toolName] ?? defaultToolPresentation;
}

export function getAiToolActivityTitle(input: { title?: string; toolName: string }) {
	const title = input.title?.trim();

	if (title) {
		return title;
	}

	return getAiToolPresentation(input.toolName).title ?? humanizeToolName(input.toolName);
}

export function getAiToolActivityIconKind(toolName: string): AiToolActivityIconKind {
	if (toolName === "compute" || toolName === "orchestrate") {
		return "code";
	}

	if (toolName.startsWith("web_") || toolName.startsWith("research_")) {
		return toolName.includes("search") || toolName.includes("discover") ? "search" : "web";
	}

	if (toolName.startsWith("workspace_")) {
		return toolName.includes("read") || toolName.includes("list") ? "file" : "edit";
	}

	return "web";
}

function humanizeToolName(value: string) {
	return value
		.split("_")
		.filter(Boolean)
		.map((segment, index) =>
			index === 0 ? segment.charAt(0).toUpperCase() + segment.slice(1) : segment,
		)
		.join(" ");
}
