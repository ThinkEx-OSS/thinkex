export type AiChatToolReceiptStatus = "completed" | "failed" | "running";
type AiChatFinishedToolReceiptStatus = Exclude<AiChatToolReceiptStatus, "running">;

export interface AiChatToolReceipt {
	status: AiChatToolReceiptStatus;
	summary: string;
}

const TOOL_RECEIPT_VALUE_MAX_LENGTH = 72;

export function getRunningToolReceipt(input: {
	toolInput: unknown;
	toolName: string;
}): AiChatToolReceipt {
	const toolInput = asRecord(input.toolInput);

	switch (input.toolName) {
		case "workspace_create_items":
			return running(`Creating ${formatCount(getArray(toolInput.items).length, "item")}`);
		case "workspace_delete_items":
			return running(`Deleting ${formatCount(getArray(toolInput.paths).length, "item")}`);
		case "workspace_edit_item":
			return running(`Editing ${quoteName(getBaseName(getString(toolInput.path)))}`);
		case "workspace_move_items": {
			const count = getArray(toolInput.paths).length;
			const destination = formatDestinationName(getString(toolInput.destinationPath));
			const target = formatCount(count, "item");
			return running(destination ? `Moving ${target} to ${destination}` : `Moving ${target}`);
		}
		case "workspace_read_items": {
			const requests = getArray(toolInput.requests).map((request) => asRecord(request));
			const paths = requests.map((request) => getString(request.path)).filter(Boolean) as string[];
			const target = formatToolInputPaths(paths);
			if (requests.length === 1) {
				const range = formatPageRange(getString(requests[0]?.range));
				return running(range ? `Reading ${target} p. ${range}` : `Reading ${target}`);
			}
			return running(`Reading ${target}`);
		}
		case "workspace_rename_item": {
			const oldName = quoteName(getBaseName(getString(toolInput.path)));
			const newName = getString(toolInput.name);
			return running(
				newName ? `Renaming ${oldName} → ${quoteName(newName)}` : `Renaming ${oldName}`,
			);
		}
		case "web_links":
			return running(`Finding links on ${formatUrl(getString(toolInput.url))}`);
		case "web_markdown":
			return running(`Reading ${formatUrlWithPath(getString(toolInput.url))}`);
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
			return running(`Running ${formatToolNameFallback(input.toolName)}`);
	}
}

export function getFinishedToolReceipt(input: {
	baseStatus: AiChatFinishedToolReceiptStatus;
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

	const unknownFallback = () => completed(summarizeUnknownResult(input.output, input.toolName));

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
				destination: formatDestinationName(getString(asRecord(input.toolInput).destinationPath)),
			});
		case "workspace_rename_item":
			return summarizeWorkspaceRename(input.output, input.toolInput);
		case "workspace_edit_item":
			return summarizeWorkspaceEdit(input.output, input.toolInput);
		case "workspace_read_items":
			return summarizeWorkspaceRead(input.output);
		case "web_search":
			return completed(summarizeWebSearch(input.output, input.toolInput));
		case "web_markdown":
			return completed(`Read ${formatUrlWithPath(getString(asRecord(input.toolInput).url))}`);
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
			return unknownFallback();
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
		case "workspace_read_items":
			return failedCount > 0
				? `Couldn’t read ${formatCount(failedCount, "item")}`
				: "Couldn’t read workspace";
		case "compute":
			return "Couldn’t compute";
		default:
			return `${capitalize(formatToolNameFallback(toolName))} failed`;
	}
}

function summarizeWorkspaceBatch(
	output: unknown,
	options: {
		failureVerb: string;
		successVerb: string;
		destination?: string;
		typeFromItem?: (item: unknown) => string;
	},
): AiChatToolReceipt {
	const record = asRecord(output);
	const items = getArray(record.items);
	const failedCount = getArray(record.failed).length;

	if (items.length === 0 && failedCount > 0) {
		return failed(`Couldn’t ${options.failureVerb} ${formatCount(failedCount, "item")}`);
	}

	const base =
		items.length === 1
			? summarizeSingleWorkspaceItem(items[0], options)
			: items.length === 2
				? `${options.successVerb} ${joinNames(items, "item")}`
				: `${options.successVerb} ${formatCount(items.length, "item")}`;

	const successSummary = options.destination ? `${base} to ${options.destination}` : base;

	return completed(appendFailureCount(successSummary, failedCount));
}

function summarizeWorkspaceRename(output: unknown, toolInput: unknown): AiChatToolReceipt {
	const record = asRecord(output);
	const item = asRecord(record.item);
	const failedCount = getArray(record.failed).length;

	if (!record.item && failedCount > 0) {
		return failed(`Couldn’t rename ${formatCount(failedCount, "item")}`);
	}

	const oldName = quoteName(getBaseName(getString(item.previousPath)));
	const newName = quoteName(
		getBaseName(getString(item.path) ?? getString(asRecord(toolInput).name)),
	);

	return completed(appendFailureCount(`Renamed ${oldName} → ${newName}`, failedCount));
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
	const warningCount = getArray(record.warnings).length;
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

	const withFailures = appendFailureCount(summary, failedCount);
	return completed(
		warningCount > 0 ? `${withFailures}, ${formatCount(warningCount, "warning")}` : withFailures,
	);
}

function summarizeWorkspaceRead(output: unknown): AiChatToolReceipt {
	const record = asRecord(output);
	const results = getArray(record.results);
	const failedCount = results.filter(
		(result) => getString(asRecord(result).status) === "failed",
	).length;
	const readyItems = results.filter((item) => getString(asRecord(item).status) === "ready");
	const pendingItems = results.filter((item) => getString(asRecord(item).status) === "pending");

	if (readyItems.length === 0 && pendingItems.length === 0 && failedCount > 0) {
		return failed(`Couldn’t read ${formatCount(failedCount, "item")}`);
	}
	if (readyItems.length === 0) {
		return completed(
			appendFailureCount(
				`Extraction in progress for ${formatCount(pendingItems.length, "item")}`,
				failedCount,
			),
		);
	}

	const summary =
		readyItems.length === 1
			? formatSingleReadSummary(readyItems[0])
			: `Read ${formatCount(readyItems.length, "item")}`;

	const pendingSummary =
		pendingItems.length > 0
			? `${summary} · ${formatCount(pendingItems.length, "item")} still processing`
			: summary;
	return completed(appendFailureCount(pendingSummary, failedCount));
}

function formatSingleReadSummary(result: unknown) {
	const record = asRecord(result);
	const name = quoteName(getBaseName(getString(record.path)));
	const location = asRecord(record.location);
	if (getString(location.kind) === "pages") {
		const range = formatPageRange(getString(location.requested));
		const total = getNumber(location.total);
		const returned = getArray(location.returned).length;
		if (range) {
			return total && returned < total
				? `Read ${name} p. ${range} of ${total}`
				: `Read ${name} p. ${range}`;
		}
	}
	return `Read ${name}`;
}

function formatPageRange(range: string | undefined) {
	if (!range) return undefined;
	const trimmed = range.trim();
	return trimmed ? trimmed.replace(/\s*-\s*/g, "–") : undefined;
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

	return summarizeUnknownResult(output, "research_deepen");
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
		return failed("Couldn’t work through the task");
	}

	if (status === "completed") {
		return completed(summarizeUnknownResult(record.result, "orchestrate"));
	}

	return completed(summarizeUnknownResult(output, "orchestrate"));
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

function summarizeUnknownResult(output: unknown, toolName: string) {
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

	return `Ran ${formatToolNameFallback(toolName)}`;
}

function formatToolNameFallback(toolName: string) {
	const words = toolName.split(/[_-]+/).filter(Boolean);
	return words.length > 0 ? words.join(" ") : toolName;
}

function capitalize(value: string) {
	return value.length === 0 ? value : `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function completed(summary: string): AiChatToolReceipt {
	return {
		status: "completed",
		summary,
	};
}

function running(summary: string): AiChatToolReceipt {
	return { status: "running", summary };
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
	const names: string[] = [];
	for (const item of items.slice(0, 2)) {
		const name = quoteName(getBaseName(getString(asRecord(item).path)));
		if (name !== "item") names.push(name);
	}

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

function formatUrlWithPath(url: string | undefined) {
	if (!url) {
		return "page";
	}

	try {
		const parsed = new URL(url);
		const hostname = parsed.hostname.replace(/^www\./, "");
		const path = parsed.pathname.replace(/\/$/, "");
		return truncateReceiptValue(path ? `${hostname}${path}` : hostname);
	} catch {
		return truncateReceiptValue(url);
	}
}

function formatDestinationName(path: string | undefined) {
	if (!path) return undefined;
	if (path === "/") return "workspace root";
	const name = getBaseName(path);
	return name ? quoteName(name) : undefined;
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
