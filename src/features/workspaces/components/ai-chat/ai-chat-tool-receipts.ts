import { asRecord } from "#/lib/record";

export type AiChatToolReceiptStatus = "completed" | "failed" | "interrupted" | "running";
type AiChatFinishedToolReceiptStatus = Exclude<AiChatToolReceiptStatus, "interrupted" | "running">;

/**
 * A receipt segment is one visual chunk of the summary that either has fixed
 * width (`text`, rendered `shrink-0 whitespace-pre` in the tool row) or holds
 * a variable-width label that should shrink first (`name`, rendered
 * `min-w-0 truncate`). The row-level flex layout then handles all dynamic
 * truncation for free — no measurement, no ResizeObserver, no hard-coded
 * character caps — while status icons, favicons, and prefix/suffix words
 * stay visible.
 */
export type AiChatToolReceiptSegment =
	| { kind: "text"; value: string }
	| { kind: "name"; value: string };

export interface AiChatToolReceipt {
	status: AiChatToolReceiptStatus;
	/**
	 * Full plain-text summary used for the row title attribute, accessibility,
	 * and telemetry. Always populated even when `segments` is present so the
	 * hover tooltip and screen-reader output always match the visual state.
	 */
	summary: string;
	/**
	 * Optional structured breakdown for dynamic truncation. When present the
	 * row renderer emits one flex child per segment; when omitted it renders
	 * the summary as a single truncate span (legacy behavior).
	 */
	segments?: AiChatToolReceiptSegment[];
}

type ReceiptPart = string | { name: string };

function toSegments(parts: readonly ReceiptPart[]): AiChatToolReceiptSegment[] {
	const out: AiChatToolReceiptSegment[] = [];
	for (const part of parts) {
		const next: AiChatToolReceiptSegment =
			typeof part === "string" ? { kind: "text", value: part } : { kind: "name", value: part.name };
		if (next.kind === "text" && !next.value) continue;
		const previous = out[out.length - 1];
		if (previous && previous.kind === "text" && next.kind === "text") {
			out[out.length - 1] = { kind: "text", value: previous.value + next.value };
		} else {
			out.push(next);
		}
	}
	return out;
}

function toSummary(segments: readonly AiChatToolReceiptSegment[]): string {
	return segments.map((segment) => segment.value).join("");
}

function build(status: AiChatToolReceiptStatus, parts: readonly ReceiptPart[]): AiChatToolReceipt {
	if (parts.length === 1 && typeof parts[0] === "string") {
		return { status, summary: parts[0] };
	}
	const segments = toSegments(parts);
	return { status, summary: toSummary(segments), segments };
}

/**
 * Receipt factory. Pass strings and `{ name }` parts positionally and the
 * builder assembles a summary string plus a matching segments array.
 *
 * @example
 *   receipt.running("Editing ", ...name(basename))
 *   receipt.completed("Updated ", ...name(basename), " with ", formatCount(count, "edit"))
 */
export const receipt = {
	running: (...parts: ReceiptPart[]) => build("running", parts),
	completed: (...parts: ReceiptPart[]) => build("completed", parts),
	failed: (...parts: ReceiptPart[]) => build("failed", parts),
};

/**
 * Emits a truncatable name wrapped in curly quotes as three receipt parts:
 * the opening quote (fixed), the name (truncates), the closing quote (fixed).
 * The quotes stay visible even when the middle gets ellipsized.
 */
export function name(value: string | undefined): ReceiptPart[] {
	const trimmed = value?.trim();
	if (!trimmed) return ["item"];
	return ["“", { name: trimmed }, "”"];
}

export function getRunningToolReceipt(input: {
	toolInput: unknown;
	toolName: string;
}): AiChatToolReceipt {
	const toolInput = asRecord(input.toolInput);

	switch (input.toolName) {
		case "activate_skill":
			return receipt.running("Using ", ...skillGuidanceName(toolInput));
		case "workspace_create_items":
			return receipt.running(`Creating ${formatCount(getArray(toolInput.items).length, "item")}`);
		case "workspace_delete_items":
			return receipt.running(`Deleting ${formatCount(getArray(toolInput.paths).length, "item")}`);
		case "workspace_edit_item":
			return receipt.running("Editing ", ...name(getBaseName(getString(toolInput.path))));
		case "workspace_move_items": {
			const count = getArray(toolInput.paths).length;
			const destinationName = getDestinationName(getString(toolInput.destinationPath));
			const target = formatCount(count, "item");
			return destinationName
				? receipt.running(`Moving ${target} to `, ...destinationName)
				: receipt.running(`Moving ${target}`);
		}
		case "workspace_read_items": {
			const requests = getArray(toolInput.requests).map((request) => asRecord(request));
			const paths = requests.map((request) => getString(request.path)).filter(Boolean) as string[];
			if (requests.length === 1 && paths[0]) {
				const range = formatPageRange(getString(requests[0]?.range));
				return range
					? receipt.running("Reading ", ...name(getBaseName(paths[0])), ` p. ${range}`)
					: receipt.running("Reading ", ...name(getBaseName(paths[0])));
			}
			return receipt.running(`Reading ${formatCount(paths.length, "item")}`);
		}
		case "workspace_rename_item": {
			const oldName = getBaseName(getString(toolInput.path));
			const newName = getString(toolInput.name);
			return newName
				? receipt.running("Renaming ", ...name(oldName), " → ", ...name(newName))
				: receipt.running("Renaming ", ...name(oldName));
		}
		case "web_fetch":
			return receipt.running("Reading ", {
				name: formatUrlWithPath(getString(toolInput.url)),
			});
		case "web_search":
			return receipt.running("Searching for ", ...name(getString(toolInput.query)));
		case "research_deepen":
			return summarizeRunningResearchDeepen(toolInput);
		case "research_discover":
			return receipt.running("Finding sources for ", ...name(getString(toolInput.query)));
		case "compute":
			return activityTitleReceipt("running", toolInput) ?? receipt.running("Running Python");
		case "orchestrate":
			return activityTitleReceipt("running", toolInput) ?? receipt.running("Working");
		default:
			return receipt.running(`Running ${formatToolNameFallback(input.toolName)}`);
	}
}

export function getFinishedToolReceipt(input: {
	baseStatus: AiChatFinishedToolReceiptStatus;
	output: unknown;
	toolInput: unknown;
	toolName: string;
}): AiChatToolReceipt {
	if (input.baseStatus === "failed") {
		return summarizeFailedTool(input.toolName, input.output, input.toolInput);
	}

	switch (input.toolName) {
		case "activate_skill":
			return receipt.completed("Used ", ...skillGuidanceName(asRecord(input.toolInput)));
		case "workspace_create_items":
			return summarizeWorkspaceBatch(input.output, {
				failureVerb: "create",
				successVerb: "Created",
				typeFromItem: (item) => {
					const type = getString(asRecord(item).type);
					return type === "folder" ? "folder" : type === "flashcard" ? "flashcard set" : "document";
				},
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
				destination: getDestinationName(getString(asRecord(input.toolInput).destinationPath)),
			});
		case "workspace_rename_item":
			return summarizeWorkspaceRename(input.output, input.toolInput);
		case "workspace_edit_item":
			return summarizeWorkspaceEdit(input.output, input.toolInput);
		case "workspace_read_items":
			return summarizeWorkspaceRead(input.output);
		case "web_search":
			return summarizeWebSearch(input.output, input.toolInput);
		case "web_fetch":
			return summarizeWebFetch(input.output, input.toolInput);
		case "research_discover":
			return summarizeResearchDiscover(input.output, input.toolInput);
		case "research_deepen":
			return summarizeResearchDeepen(input.output, input.toolInput);
		case "orchestrate":
			return summarizeCodemode(input.output, input.toolInput);
		case "compute":
			return summarizeCompute(input.output, input.toolInput);
		default:
			return receipt.completed(summarizeUnknownResult(input.output, input.toolName));
	}
}

function summarizeFailedTool(
	toolName: string,
	output: unknown,
	toolInput: unknown,
): AiChatToolReceipt {
	const outputRecord = asRecord(output);
	const failedCount = getArray(outputRecord.failed).length;

	switch (toolName) {
		case "activate_skill":
			return receipt.failed("Couldn’t load ", ...skillGuidanceName(asRecord(toolInput)));
		case "workspace_create_items":
			return failedCount > 0
				? receipt.failed(`Couldn’t create ${formatCount(failedCount, "item")}`)
				: receipt.failed("Couldn’t update workspace");
		case "workspace_delete_items":
			return failedCount > 0
				? receipt.failed(`Couldn’t delete ${formatCount(failedCount, "item")}`)
				: receipt.failed("Couldn’t update workspace");
		case "workspace_move_items":
			return failedCount > 0
				? receipt.failed(`Couldn’t move ${formatCount(failedCount, "item")}`)
				: receipt.failed("Couldn’t update workspace");
		case "workspace_rename_item":
			return failedCount > 0
				? receipt.failed(`Couldn’t rename ${formatCount(failedCount, "item")}`)
				: receipt.failed("Couldn’t update workspace");
		case "workspace_edit_item":
			return receipt.failed(
				"Couldn’t update ",
				...name(getBaseName(getString(outputRecord.path) ?? getPathFromToolInput(toolInput))),
			);
		case "workspace_read_items":
			return failedCount > 0
				? receipt.failed(`Couldn’t read ${formatCount(failedCount, "item")}`)
				: receipt.failed("Couldn’t read workspace");
		case "compute":
			return receipt.failed("Couldn’t compute");
		default:
			return receipt.failed(`${capitalize(formatToolNameFallback(toolName))} failed`);
	}
}

function summarizeWorkspaceBatch(
	output: unknown,
	options: {
		failureVerb: string;
		successVerb: string;
		destination?: ReceiptPart[];
		typeFromItem?: (item: unknown) => string;
	},
): AiChatToolReceipt {
	const record = asRecord(output);
	const items = getArray(record.items);
	const failedCount = getArray(record.failed).length;

	if (items.length === 0 && failedCount > 0) {
		return receipt.failed(`Couldn’t ${options.failureVerb} ${formatCount(failedCount, "item")}`);
	}

	const base: ReceiptPart[] =
		items.length === 1
			? singleWorkspaceItemParts(items[0], options)
			: items.length === 2
				? [`${options.successVerb} `, ...joinNames(items, "item")]
				: [`${options.successVerb} ${formatCount(items.length, "item")}`];

	const withDestination = options.destination
		? ([...base, " to ", ...options.destination] as ReceiptPart[])
		: base;
	const withFailures =
		failedCount > 0
			? ([...withDestination, `, ${formatCount(failedCount, "failure")}`] as ReceiptPart[])
			: withDestination;

	return receipt.completed(...withFailures);
}

function singleWorkspaceItemParts(
	item: unknown,
	options: {
		successVerb: string;
		typeFromItem?: (item: unknown) => string;
	},
): ReceiptPart[] {
	const type = options.typeFromItem?.(item);
	const nameParts = name(getBaseName(getString(asRecord(item).path)));
	return type
		? [`${options.successVerb} ${type} `, ...nameParts]
		: [`${options.successVerb} `, ...nameParts];
}

function summarizeWorkspaceRename(output: unknown, toolInput: unknown): AiChatToolReceipt {
	const record = asRecord(output);
	const item = asRecord(record.item);
	const failedCount = getArray(record.failed).length;

	if (!record.item && failedCount > 0) {
		return receipt.failed(`Couldn’t rename ${formatCount(failedCount, "item")}`);
	}

	const oldName = getBaseName(getString(item.previousPath));
	const newName = getBaseName(getString(item.path) ?? getString(asRecord(toolInput).name));
	const parts: ReceiptPart[] = ["Renamed ", ...name(oldName), " → ", ...name(newName)];
	if (failedCount > 0) parts.push(`, ${formatCount(failedCount, "failure")}`);
	return receipt.completed(...parts);
}

function summarizeWorkspaceEdit(output: unknown, toolInput: unknown): AiChatToolReceipt {
	const record = asRecord(output);
	const failedCount = getArray(record.failed).length;
	const warningCount = getArray(record.warnings).length;
	const appliedCount = getNumber(record.applied) ?? 0;

	if (appliedCount === 0 && failedCount > 0) {
		return receipt.failed(
			"Couldn’t update ",
			...name(getBaseName(getString(record.path) ?? getPathFromToolInput(toolInput))),
		);
	}

	const nameParts = name(getBaseName(getString(record.path)));
	const suffixPieces: string[] = [];
	if (appliedCount > 1) suffixPieces.push(`with ${formatCount(appliedCount, "edit")}`);
	if (failedCount > 0) suffixPieces.push(formatCount(failedCount, "failure"));
	if (warningCount > 0) suffixPieces.push(formatCount(warningCount, "warning"));
	const suffix = suffixPieces.length > 0 ? ` ${suffixPieces.join(", ")}` : "";

	return receipt.completed("Updated ", ...nameParts, suffix);
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
		return receipt.failed(`Couldn’t read ${formatCount(failedCount, "item")}`);
	}
	if (readyItems.length === 0) {
		const parts: ReceiptPart[] = [
			`Extraction in progress for ${formatCount(pendingItems.length, "item")}`,
		];
		if (failedCount > 0) parts.push(`, ${formatCount(failedCount, "failure")}`);
		return receipt.completed(...parts);
	}

	const base: ReceiptPart[] =
		readyItems.length === 1
			? singleReadParts(readyItems[0])
			: [`Read ${formatCount(readyItems.length, "item")}`];

	const withPending: ReceiptPart[] =
		pendingItems.length > 0
			? [...base, ` · ${formatCount(pendingItems.length, "item")} still processing`]
			: base;
	const withFailures: ReceiptPart[] =
		failedCount > 0 ? [...withPending, `, ${formatCount(failedCount, "failure")}`] : withPending;

	return receipt.completed(...withFailures);
}

function singleReadParts(result: unknown): ReceiptPart[] {
	const record = asRecord(result);
	const basename = getBaseName(getString(record.path));
	const nameParts = name(basename);
	const location = asRecord(record.location);
	if (getString(location.kind) === "pages") {
		const range = formatPageRange(getString(location.requested));
		const total = getNumber(location.total);
		const returned = getArray(location.returned).length;
		if (range) {
			const suffix = total && returned < total ? ` p. ${range} of ${total}` : ` p. ${range}`;
			return ["Read ", ...nameParts, suffix];
		}
	}
	return ["Read ", ...nameParts];
}

function formatPageRange(range: string | undefined) {
	if (!range) return undefined;
	const trimmed = range.trim();
	return trimmed ? trimmed.replace(/\s*-\s*/g, "–") : undefined;
}

function summarizeWebSearch(output: unknown, toolInput: unknown): AiChatToolReceipt {
	const results = getArray(asRecord(output).results);
	const input = asRecord(toolInput);
	const subject = getString(input.query);
	const noun = getString(input.source) === "images" ? "image" : "source";
	const base: ReceiptPart[] = [`Found ${formatCount(results.length, noun)}`];
	return subject
		? receipt.completed(...base, " for ", ...name(subject))
		: receipt.completed(...base);
}

function summarizeWebFetch(output: unknown, toolInput: unknown): AiChatToolReceipt {
	const kind = getString(asRecord(output).kind);
	const target = { name: formatUrlWithPath(getString(asRecord(toolInput).url)) };
	if (kind === "unsupported") return receipt.completed("Couldn’t read ", target);
	return receipt.completed(kind === "image" ? "Inspected " : "Read ", target);
}

function summarizeResearchDiscover(output: unknown, toolInput: unknown): AiChatToolReceipt {
	const record = asRecord(output);
	const total = getArray(record.papers).length + getArray(record.github).length;
	const subject = getString(asRecord(toolInput).query);
	const base: ReceiptPart[] = [`Found ${formatCount(total, "source")}`];
	return subject
		? receipt.completed(...base, " for ", ...name(subject))
		: receipt.completed(...base);
}

function summarizeResearchDeepen(output: unknown, toolInput: unknown): AiChatToolReceipt {
	const record = asRecord(output);
	const input = asRecord(toolInput);
	const paper = getString(input.paper_id);

	if (Array.isArray(record.passages)) {
		return receipt.completed(
			`Read ${formatCount(record.passages.length, "passage")} from `,
			...name(paper),
		);
	}

	if (Array.isArray(record.papers)) {
		return receipt.completed(
			`Found ${formatCount(record.papers.length, "paper")} related to `,
			...name(paper),
		);
	}

	return receipt.completed(summarizeUnknownResult(output, "research_deepen"));
}

function summarizeRunningResearchDeepen(input: Record<string, unknown>): AiChatToolReceipt {
	const paper = getString(input.paper_id);
	const mode = getString(input.mode);

	if (mode === "passages") return receipt.running("Reading passages from ", ...name(paper));
	if (mode === "related") return receipt.running("Finding related papers for ", ...name(paper));
	return receipt.running("Researching ", ...name(paper));
}

/**
 * `orchestrate` and `compute` are the only tools whose arguments carry no noun
 * to build a row from — the input is an opaque blob of code — so the model
 * names the work itself in a leading `title` field and the row shows that
 * instead of the mechanism. The derived summaries below stay as the fallback
 * for a title that has not streamed in yet, or a model that skipped the field.
 *
 * States the title must not mask (a paused approval, a failed run) are settled
 * by their callers before this is consulted.
 */
function activityTitleReceipt(
	status: "completed" | "running",
	toolInput: unknown,
): AiChatToolReceipt | undefined {
	const title = getString(asRecord(toolInput).title)?.trim();
	if (!title) return undefined;

	return status === "running" ? receipt.running(title) : receipt.completed(title);
}

function summarizeCodemode(output: unknown, toolInput: unknown): AiChatToolReceipt {
	const record = asRecord(output);
	const status = getString(record.status);

	if (status === "paused") return receipt.completed("Needs input");
	if (status === "error") return receipt.failed("Couldn’t work through the task");

	const titled = activityTitleReceipt("completed", toolInput);
	if (titled) return titled;

	if (status === "completed")
		return receipt.completed(summarizeUnknownResult(record.result, "orchestrate"));

	return receipt.completed(summarizeUnknownResult(output, "orchestrate"));
}

function summarizeCompute(output: unknown, toolInput: unknown): AiChatToolReceipt {
	const record = asRecord(output);

	if (record.error) return receipt.failed("Couldn’t compute");

	const titled = activityTitleReceipt("completed", toolInput);
	if (titled) return titled;

	const results = getArray(record.results);
	const imageCount = results.filter((result) => {
		const item = asRecord(result);
		return typeof item.png === "string" || typeof item.jpeg === "string";
	}).length;
	if (imageCount > 0) return receipt.completed(`Generated ${formatCount(imageCount, "image")}`);

	const valueCount = results.filter((result) => {
		const item = asRecord(result);
		return typeof item.text === "string" || item.json !== undefined || item.data !== undefined;
	}).length;
	if (valueCount > 0) return receipt.completed(`Returned ${formatCount(valueCount, "value")}`);

	const stdout = getArray(asRecord(record.logs).stdout);
	if (stdout.length > 0)
		return receipt.completed(`Wrote ${formatCount(stdout.length, "log line")}`);

	return receipt.completed(
		results.length > 0 ? `Returned ${formatCount(results.length, "result")}` : "Computed",
	);
}

function summarizeUnknownResult(output: unknown, toolName: string) {
	const record = asRecord(output);

	if (Array.isArray(record.items)) return `Processed ${formatCount(record.items.length, "item")}`;
	if (Array.isArray(record.results)) return `Found ${formatCount(record.results.length, "result")}`;
	if (Array.isArray(record.papers)) return `Found ${formatCount(record.papers.length, "paper")}`;
	if (Array.isArray(record.passages))
		return `Read ${formatCount(record.passages.length, "passage")}`;
	if (typeof record.content === "string") return "Read 1 page";
	return `Ran ${formatToolNameFallback(toolName)}`;
}

function formatToolNameFallback(toolName: string) {
	const words = toolName.split(/[_-]+/).filter(Boolean);
	return words.length > 0 ? words.join(" ") : toolName;
}

function skillGuidanceName(toolInput: Record<string, unknown>): ReceiptPart[] {
	const skill = formatToolNameFallback(getString(toolInput.name) ?? "specialized").replace(
		/ authoring$/,
		"",
	);
	return [{ name: `${skill} guidance` }];
}

function capitalize(value: string) {
	return value.length === 0 ? value : `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function joinNames(items: unknown[], fallbackNoun: string): ReceiptPart[] {
	const collected: ReceiptPart[][] = [];
	for (const item of items.slice(0, 2)) {
		const basename = getBaseName(getString(asRecord(item).path));
		if (basename) collected.push(name(basename));
	}

	if (collected.length === 2) return [...collected[0], " and ", ...collected[1]];
	if (collected.length === 1) return collected[0];
	return [formatCount(items.length, fallbackNoun)];
}

function formatCount(count: number, noun: string) {
	const safeCount = Number.isFinite(count) && count > 0 ? count : 0;
	return `${safeCount} ${noun}${safeCount === 1 ? "" : "s"}`;
}

function getBaseName(path: string | undefined) {
	if (!path) return undefined;
	const segments = path.split("/").filter(Boolean);
	return segments.at(-1) ?? path;
}

function getPathFromToolInput(input: unknown) {
	return getString(asRecord(input).path);
}

function formatUrlWithPath(url: string | undefined) {
	if (!url) return "page";
	try {
		const parsed = new URL(url);
		const hostname = parsed.hostname.replace(/^www\./, "");
		const path = parsed.pathname.replace(/\/$/, "");
		return path ? `${hostname}${path}` : hostname;
	} catch {
		return url;
	}
}

function getDestinationName(path: string | undefined): ReceiptPart[] | undefined {
	if (!path) return undefined;
	if (path === "/") return ["workspace root"];
	const basename = getBaseName(path);
	return basename ? name(basename) : undefined;
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
