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

// Avoid slicing through a UTF-16 surrogate pair: if the last kept unit is a
// high surrogate, its low half sits just past the budget, so drop it to prevent
// emitting a lone (malformed) surrogate.
function safeTruncationLength(content: string, budget: number): number {
	const lastUnit = content.charCodeAt(budget - 1);

	if (lastUnit >= 0xd800 && lastUnit <= 0xdbff) {
		return budget - 1;
	}

	return budget;
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
			item.content.slice(0, safeTruncationLength(item.content, remainingBudget)) +
			MCP_READ_CONTENT_TRUNCATION_NOTICE;
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
