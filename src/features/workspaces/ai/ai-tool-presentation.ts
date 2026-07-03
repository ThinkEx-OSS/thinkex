export type AiToolVisibility = "hidden" | "visible";

interface AiToolPresentation {
	title?: string;
	visibility: AiToolVisibility;
}

const defaultToolPresentation = {
	visibility: "visible",
} as const satisfies AiToolPresentation;

const aiToolPresentationByName: Readonly<Record<string, AiToolPresentation>> = {
	compute: { title: "Computing", visibility: "visible" },
	orchestrate: { title: "Working", visibility: "visible" },
	research_deepen: { title: "Researching sources", visibility: "visible" },
	research_discover: { title: "Researching sources", visibility: "visible" },
	sandbox_bash: { visibility: "hidden" },
	web_links: { title: "Reading the web", visibility: "visible" },
	web_markdown: { title: "Reading the web", visibility: "visible" },
	web_search: { title: "Reading the web", visibility: "visible" },
	workspace_create_items: { title: "Updating workspace", visibility: "visible" },
	workspace_delete_items: { title: "Updating workspace", visibility: "visible" },
	workspace_edit_item: { title: "Updating workspace", visibility: "visible" },
	workspace_link_items: { visibility: "hidden" },
	workspace_list_items: { title: "Reading workspace", visibility: "visible" },
	workspace_move_items: { title: "Updating workspace", visibility: "visible" },
	workspace_read_items: { title: "Reading workspace", visibility: "visible" },
	workspace_rename_item: { title: "Updating workspace", visibility: "visible" },
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

function humanizeToolName(value: string) {
	return value
		.split("_")
		.filter(Boolean)
		.map((segment, index) =>
			index === 0 ? segment.charAt(0).toUpperCase() + segment.slice(1) : segment,
		)
		.join(" ");
}
