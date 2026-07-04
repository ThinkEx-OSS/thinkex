import type {
	WorkspaceReadItem,
	WorkspaceReadItemsResult,
} from "#/features/workspaces/operations/read-items";

export const MCP_READ_MAX_TOTAL_CONTENT_CHARS = 100_000;

export const MCP_READ_CONTENT_TRUNCATION_NOTICE =
	"\n\n... (content truncated to fit MCP read budget)";

export interface McpReadItem extends WorkspaceReadItem {
	truncated?: boolean;
}

export interface McpReadItemsResult extends WorkspaceReadItemsResult {
	items: McpReadItem[];
	truncated?: boolean;
}

export function capMcpReadItemsContent(
	result: WorkspaceReadItemsResult,
	maxTotalChars = MCP_READ_MAX_TOTAL_CONTENT_CHARS,
): McpReadItemsResult {
	let remainingBudget = maxTotalChars;
	let responseTruncated = false;

	const items = result.items.map((item) => {
		if (item.content === undefined) {
			return item;
		}

		if (remainingBudget <= 0) {
			responseTruncated = true;
			return {
				...item,
				content: "",
				truncated: true,
			};
		}

		if (item.content.length <= remainingBudget) {
			remainingBudget -= item.content.length;
			return item;
		}

		responseTruncated = true;
		const truncatedContent =
			item.content.slice(0, remainingBudget) + MCP_READ_CONTENT_TRUNCATION_NOTICE;
		remainingBudget = 0;

		return {
			...item,
			content: truncatedContent,
			truncated: true,
		};
	});

	return {
		...result,
		items,
		...(responseTruncated ? { truncated: true } : {}),
	};
}
