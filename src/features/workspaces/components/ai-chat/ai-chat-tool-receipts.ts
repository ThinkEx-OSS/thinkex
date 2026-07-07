export type AiChatToolReceiptStatus = "completed" | "failed";

export interface AiChatToolReceipt {
	status: AiChatToolReceiptStatus;
	summary: string;
}

const TOOL_RECEIPT_VALUE_MAX_LENGTH = 72;

export function getRunningToolReceipt(input: {
	toolInput: unknown;
	toolName: string;
}): Pick<AiChatToolReceipt, "summary"> {
	const toolInput = asRecord(input.toolInput);

	switch (input.toolName) {
		case "workspace_create_items":
			return running(`Creating ${formatCount(getArray(toolInput.items).length, "item")}`);
		case "workspace_delete_items":
			return running(`Deleting ${formatCount(getArray(toolInput.paths).length, "item")}`);
		case "workspace_edit_item":
			return running(`Editing ${quoteName(getBaseName(getString(toolInput.path)))}`);
		case "workspace_list_items":
			return running(`Listing ${formatPath(getString(toolInput.path) ?? "/")}`);
		case "workspace_move_items":
			return running(`Moving ${formatCount(getArray(toolInput.paths).length, "item")}`);
		case "workspace_read_items":
			return running(`Reading ${formatToolInputPaths(toolInput.paths)}`);
		case "workspace_rename_item":
			return running(`Renaming ${quoteName(getBaseName(getString(toolInput.path)))}`);
		case "web_links":
			return running(`Finding links on ${formatUrl(getString(toolInput.url))}`);
		case "web_markdown":
			return running(`Reading ${formatUrl(getString(toolInput.url))}`);
		case "web_search":
			return running(`Searching for ${quoteName(getString(toolInput.query))}`);
		case "research_deepen":
			return running(summarizeRunningResearchDeepen(toolInput));
		case "research_discover":
			return running(`Finding sources for ${quoteName(getString(toolInput.query))}`);
		case "compute":
			return running("Running Python");
		case "orchestrate":
			return running("Working through the task");
		default:
			return running("Working");
	}
}

export function getFinishedToolReceipt(input: {
	baseStatus: AiChatToolReceiptStatus;
	output: unknown;
	toolInput: unknown;
	toolName: string;
}): AiChatToolReceipt {
	if (input.baseStatus === "failed") {
		return {
			status: "failed",
			summary: summarizeFailedTool(input.toolName, input.output, input.toolInput),
		};
	}

	switch (input.toolName) {
		case "workspace_create_items":
			return summarizeWorkspaceBatch(input.output, {
				failureVerb: "create",
				successVerb: "Created",
				typeFromItem: (item) =>
					getString(asRecord(item).type) === "folder" ? "folder" : "document",
			});
		case "workspace_delete_items":
			return summarizeWorkspaceBatch(input.output, {
				failureVerb: "delete",
				successVerb: "Deleted",
			});
		case "workspace_move_items":
			return summarizeWorkspaceBatch(input.output, {
				failureVerb: "move",
				successVerb: "Moved",
			});
		case "workspace_rename_item":
			return summarizeWorkspaceSingleItem(input.output, {
				failureVerb: "rename",
				successVerb: "Renamed",
			});
		case "workspace_edit_item":
			return summarizeWorkspaceEdit(input.output, input.toolInput);
		case "workspace_list_items":
			return summarizeWorkspaceList(input.output);
		case "workspace_read_items":
			return summarizeWorkspaceRead(input.output);
		case "web_search":
			return completed(summarizeWebSearch(input.output, input.toolInput));
		case "web_markdown":
			return completed(`Read ${formatUrl(getString(asRecord(input.toolInput).url))}`);
		case "web_links":
			return completed(summarizeWebLinks(input.output, input.toolInput));
		case "research_discover":
			return completed(summarizeResearchDiscover(input.output, input.toolInput));
		case "research_deepen":
			return completed(summarizeResearchDeepen(input.output, input.toolInput));
		case "orchestrate":
			return summarizeCodemode(input.output);
		case "compute":
			return summarizeCompute(input.output);
		default:
			return completed(summarizeUnknownResult(input.output));
	}
}

function summarizeFailedTool(toolName: string, output: unknown, toolInput: unknown) {
	const outputRecord = asRecord(output);
	const failedCount = getArray(outputRecord.failed).length;

	switch (toolName) {
		case "workspace_create_items":
			return failedCount > 0
				? `Couldn’t create ${formatCount(failedCount, "item")}`
				: "Couldn’t update workspace";
		case "workspace_delete_items":
			return failedCount > 0
				? `Couldn’t delete ${formatCount(failedCount, "item")}`
				: "Couldn’t update workspace";
		case "workspace_move_items":
			return failedCount > 0
				? `Couldn’t move ${formatCount(failedCount, "item")}`
				: "Couldn’t update workspace";
		case "workspace_rename_item":
			return failedCount > 0
				? `Couldn’t rename ${formatCount(failedCount, "item")}`
				: "Couldn’t update workspace";
		case "workspace_edit_item":
			return `Couldn’t update ${quoteName(
				getBaseName(getString(outputRecord.path) ?? getPathFromToolInput(toolInput)),
			)}`;
		case "workspace_list_items":
			return failedCount > 0
				? `Couldn’t list ${formatCount(failedCount, "item")}`
				: "Couldn’t list workspace";
		case "workspace_read_items":
			return failedCount > 0
				? `Couldn’t read ${formatCount(failedCount, "item")}`
				: "Couldn’t read workspace";
		case "compute":
			return "Couldn’t compute";
		default:
			return "Couldn’t complete";
	}
}

function summarizeWorkspaceBatch(
	output: unknown,
	options: {
		failureVerb: string;
		successVerb: string;
		typeFromItem?: (item: unknown) => string;
	},
): AiChatToolReceipt {
	const record = asRecord(output);
	const items = getArray(record.items);
	const failedCount = getArray(record.failed).length;

	if (items.length === 0 && failedCount > 0) {
		return failed(`Couldn’t ${options.failureVerb} ${formatCount(failedCount, "item")}`);
	}

	const successSummary =
		items.length === 1
			? summarizeSingleWorkspaceItem(items[0], options)
			: items.length === 2
				? `${options.successVerb} ${joinNames(items, "item")}`
				: `${options.successVerb} ${formatCount(items.length, "item")}`;

	return completed(appendFailureCount(successSummary, failedCount));
}

function summarizeWorkspaceSingleItem(
	output: unknown,
	options: {
		failureVerb: string;
		successVerb: string;
	},
): AiChatToolReceipt {
	const record = asRecord(output);
	const item = asRecord(record.item);
	const failedCount = getArray(record.failed).length;

	if (!record.item && failedCount > 0) {
		return failed(`Couldn’t ${options.failureVerb} ${formatCount(failedCount, "item")}`);
	}

	return completed(
		appendFailureCount(
			`${options.successVerb} ${quoteName(getBaseName(getString(item.path)))}`,
			failedCount,
		),
	);
}

function summarizeSingleWorkspaceItem(
	item: unknown,
	options: {
		successVerb: string;
		typeFromItem?: (item: unknown) => string;
	},
) {
	const type = options.typeFromItem?.(item);
	const name = quoteName(getBaseName(getString(asRecord(item).path)));

	return type ? `${options.successVerb} ${type} ${name}` : `${options.successVerb} ${name}`;
}

function summarizeWorkspaceEdit(output: unknown, toolInput: unknown): AiChatToolReceipt {
	const record = asRecord(output);
	const failedCount = getArray(record.failed).length;
	const appliedCount = getNumber(record.applied) ?? 0;

	if (appliedCount === 0 && failedCount > 0) {
		return failed(
			`Couldn’t update ${quoteName(
				getBaseName(getString(record.path) ?? getPathFromToolInput(toolInput)),
			)}`,
		);
	}

	const summary =
		appliedCount > 1
			? `Updated ${quoteName(getBaseName(getString(record.path)))} with ${formatCount(
					appliedCount,
					"edit",
				)}`
			: `Updated ${quoteName(getBaseName(getString(record.path)))}`;

	return completed(appendFailureCount(summary, failedCount));
}

function summarizeWorkspaceList(output: unknown): AiChatToolReceipt {
	const record = asRecord(output);
	const items = getArray(record.items);
	const failedCount = getArray(record.failed).length;

	if (items.length === 0 && failedCount > 0) {
		return failed(`Couldn’t list ${formatCount(failedCount, "item")}`);
	}

	return completed(appendFailureCount(`Listed ${formatCount(items.length, "item")}`, failedCount));
}

function summarizeWorkspaceRead(output: unknown): AiChatToolReceipt {
	const record = asRecord(output);
	const items = getArray(record.items);
	const failedCount =
		getArray(record.failed).length +
		items.filter((item) => getString(asRecord(item).status) === "failed").length;
	const readyItems = items.filter((item) => getString(asRecord(item).status) === "ready");

	if (readyItems.length === 0 && failedCount > 0) {
		return failed(`Couldn’t read ${formatCount(failedCount, "item")}`);
	}

	const summary =
		readyItems.length === 1
			? `Read ${quoteName(getBaseName(getString(asRecord(readyItems[0]).path)))}`
			: `Read ${formatCount(readyItems.length, "item")}`;

	return completed(appendFailureCount(summary, failedCount));
}

function summarizeWebSearch(output: unknown, toolInput: unknown) {
	const results = getArray(asRecord(output).results);
	return appendSubject(`Found ${formatCount(results.length, "source")}`, asRecord(toolInput).query);
}

function summarizeWebLinks(output: unknown, toolInput: unknown) {
	const items = getArray(asRecord(output).items);
	return `Found ${formatCount(items.length, "link")} on ${formatUrl(getString(asRecord(toolInput).url))}`;
}

function summarizeResearchDiscover(output: unknown, toolInput: unknown) {
	const record = asRecord(output);
	const total = getArray(record.papers).length + getArray(record.github).length;
	return appendSubject(`Found ${formatCount(total, "source")}`, asRecord(toolInput).query);
}

function summarizeResearchDeepen(output: unknown, toolInput: unknown) {
	const record = asRecord(output);
	const input = asRecord(toolInput);
	const paper = getString(input.paper_id);

	if (Array.isArray(record.passages)) {
		return `Read ${formatCount(record.passages.length, "passage")} from ${quoteName(paper)}`;
	}

	if (Array.isArray(record.papers)) {
		return `Found ${formatCount(record.papers.length, "paper")} related to ${quoteName(paper)}`;
	}

	return summarizeUnknownResult(output);
}

function summarizeRunningResearchDeepen(input: Record<string, unknown>) {
	const paper = quoteName(getString(input.paper_id));
	const mode = getString(input.mode);

	if (mode === "passages") {
		return `Reading passages from ${paper}`;
	}

	if (mode === "related") {
		return `Finding related papers for ${paper}`;
	}

	return `Researching ${paper}`;
}

function summarizeCodemode(output: unknown): AiChatToolReceipt {
	const record = asRecord(output);
	const status = getString(record.status);

	if (status === "paused") {
		return completed("Needs input");
	}

	if (status === "error") {
		return failed("Couldn’t complete");
	}

	if (status === "completed") {
		return completed(summarizeUnknownResult(record.result));
	}

	return completed(summarizeUnknownResult(output));
}

function summarizeCompute(output: unknown): AiChatToolReceipt {
	const record = asRecord(output);

	if (record.error) {
		return failed("Couldn’t compute");
	}

	const results = getArray(record.results);
	const imageCount = results.filter((result) => {
		const item = asRecord(result);
		return typeof item.png === "string" || typeof item.jpeg === "string";
	}).length;

	if (imageCount > 0) {
		return completed(`Generated ${formatCount(imageCount, "image")}`);
	}

	const valueCount = results.filter((result) => {
		const item = asRecord(result);
		return typeof item.text === "string" || item.json !== undefined || item.data !== undefined;
	}).length;

	if (valueCount > 0) {
		return completed(`Returned ${formatCount(valueCount, "value")}`);
	}

	const stdout = getArray(asRecord(record.logs).stdout);
	if (stdout.length > 0) {
		return completed(`Wrote ${formatCount(stdout.length, "log line")}`);
	}

	return completed(
		results.length > 0 ? `Returned ${formatCount(results.length, "result")}` : "Computed",
	);
}

function summarizeUnknownResult(output: unknown) {
	const record = asRecord(output);

	if (Array.isArray(record.items)) {
		return `Processed ${formatCount(record.items.length, "item")}`;
	}

	if (Array.isArray(record.results)) {
		return `Found ${formatCount(record.results.length, "result")}`;
	}

	if (Array.isArray(record.papers)) {
		return `Found ${formatCount(record.papers.length, "paper")}`;
	}

	if (Array.isArray(record.passages)) {
		return `Read ${formatCount(record.passages.length, "passage")}`;
	}

	if (typeof record.content === "string") {
		return "Read 1 page";
	}

	return "Done";
}

function completed(summary: string): AiChatToolReceipt {
	return {
		status: "completed",
		summary,
	};
}

function running(summary: string): Pick<AiChatToolReceipt, "summary"> {
	return { summary };
}

function failed(summary: string): AiChatToolReceipt {
	return {
		status: "failed",
		summary,
	};
}

function quoteName(value: string | undefined) {
	return value ? `“${truncateReceiptValue(value)}”` : "item";
}

function joinNames(items: unknown[], fallbackNoun: string) {
	const names = items
		.slice(0, 2)
		.map((item) => quoteName(getBaseName(getString(asRecord(item).path))))
		.filter((name) => name !== "item");

	if (names.length === 2) {
		return `${names[0]} and ${names[1]}`;
	}

	if (names.length === 1) {
		return names[0];
	}

	return formatCount(items.length, fallbackNoun);
}

function formatCount(count: number, noun: string) {
	const safeCount = Number.isFinite(count) && count > 0 ? count : 0;
	return `${safeCount} ${noun}${safeCount === 1 ? "" : "s"}`;
}

function appendSubject(summary: string, subject: unknown) {
	const value = getString(subject);
	return value ? `${summary} for ${quoteName(value)}` : summary;
}

function appendFailureCount(summary: string, failedCount: number) {
	return failedCount > 0 ? `${summary}, ${formatCount(failedCount, "failure")}` : summary;
}

function getBaseName(path: string | undefined) {
	if (!path) {
		return undefined;
	}

	const segments = path.split("/").filter(Boolean);
	return segments.at(-1) ?? path;
}

function getPathFromToolInput(input: unknown) {
	return getString(asRecord(input).path);
}

function formatPath(path: string) {
	return path === "/" ? "workspace root" : quoteName(path);
}

function formatToolInputPaths(value: unknown) {
	const paths = getArray(value)
		.map((item) => getString(item))
		.filter((item): item is string => Boolean(item));

	if (paths.length === 1) {
		return quoteName(getBaseName(paths[0]));
	}

	return formatCount(paths.length, "item");
}

function formatUrl(url: string | undefined) {
	if (!url) {
		return "page";
	}

	try {
		return truncateReceiptValue(new URL(url).hostname.replace(/^www\./, ""));
	} catch {
		return truncateReceiptValue(url);
	}
}

function truncateReceiptValue(value: string) {
	const normalized = value.replace(/\s+/g, " ").trim();

	if (normalized.length <= TOOL_RECEIPT_VALUE_MAX_LENGTH) {
		return normalized;
	}

	const edgeLength = Math.floor((TOOL_RECEIPT_VALUE_MAX_LENGTH - 3) / 2);
	return `${normalized.slice(0, edgeLength)}...${normalized.slice(-edgeLength)}`;
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function getArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function getString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function getNumber(value: unknown): number | undefined {
	return typeof value === "number" ? value : undefined;
}
