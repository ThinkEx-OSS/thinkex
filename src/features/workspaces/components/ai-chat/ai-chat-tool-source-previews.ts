import type { AiChatToolActivity } from "#/features/workspaces/components/ai-chat/ai-chat-display-state";
import { asRecord } from "#/lib/record";

export interface ToolSourcePreview {
	description?: string;
	kind: string;
	title: string;
	url?: string;
}

export function getToolSourcePreviews(activity: AiChatToolActivity): ToolSourcePreview[] {
	const output = asRecord(activity.detail.output);
	const input = asRecord(activity.detail.input);

	switch (activity.toolName) {
		case "web_search":
			return getArray(output.results).map((item) => {
				const record = asRecord(item);
				return sourcePreviewFromRecord(record, {
					descriptionKeys: ["snippet", "description"],
					kind: getString(record.type) === "image" ? "Image" : "Web",
					titleKeys: ["title"],
					urlKeys: ["url"],
				});
			});
		case "web_links":
			return getArray(output.items).map((item) =>
				typeof item === "string"
					? sourcePreviewFromUrl(item, "Link")
					: sourcePreviewFromRecord(asRecord(item), {
							kind: "Link",
							titleKeys: ["title", "text", "label"],
							urlKeys: ["url", "href"],
						}),
			);
		case "web_fetch": {
			const url = getString(input.url);
			let label = "Page";
			if (output.kind === "image") label = "Image";
			if (output.kind === "unsupported") {
				label = output.reason === "pdf" ? "PDF" : "Unsupported";
			}
			return url ? [sourcePreviewFromUrl(url, label)] : [];
		}
		case "research_discover":
			return [
				...getArray(output.papers).map((item) =>
					sourcePreviewFromRecord(asRecord(item), {
						descriptionKeys: ["abstract", "snippet"],
						kind: "Paper",
						titleKeys: ["title", "paper_id", "primary_id"],
						urlKeys: ["url"],
					}),
				),
				...getArray(output.github).map((item) =>
					sourcePreviewFromRecord(asRecord(item), {
						descriptionKeys: ["snippet"],
						kind: "Repository",
						titleKeys: ["repo", "title"],
						urlKeys: ["url"],
					}),
				),
			];
		case "research_deepen":
			return [
				...getArray(output.papers).map((item) =>
					sourcePreviewFromRecord(asRecord(item), {
						descriptionKeys: ["abstract", "snippet"],
						kind: "Paper",
						titleKeys: ["title", "paper_id", "primary_id"],
						urlKeys: ["url"],
					}),
				),
				...(output.paper
					? [
							sourcePreviewFromRecord(asRecord(output.paper), {
								descriptionKeys: ["abstract", "snippet"],
								kind: "Paper",
								titleKeys: ["title", "paper_id", "primary_id"],
								urlKeys: ["url"],
							}),
						]
					: []),
			];
		default:
			return [];
	}
}

export function getToolSourceHostname(url: string) {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return null;
	}
}

function sourcePreviewFromRecord(
	record: Record<string, unknown>,
	options: {
		descriptionKeys?: string[];
		kind: string;
		titleKeys: string[];
		urlKeys: string[];
	},
): ToolSourcePreview {
	const url = getFirstString(record, options.urlKeys);
	const title =
		getFirstString(record, options.titleKeys) ??
		(url ? getToolSourceHostname(url) : null) ??
		options.kind;

	return {
		description: getFirstString(record, options.descriptionKeys ?? []),
		kind: options.kind,
		title,
		url,
	};
}

function sourcePreviewFromUrl(url: string, kind: string): ToolSourcePreview {
	return {
		kind,
		title: getToolSourceHostname(url) ?? url,
		url,
	};
}

function getArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function getString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getFirstString(record: Record<string, unknown>, keys: string[]) {
	for (const key of keys) {
		const value = getString(record[key]);
		if (value) {
			return value;
		}
	}

	return undefined;
}
