import { getAiToolPresentation } from "#/features/workspaces/ai/ai-tool-registry";
import { asRecord } from "#/lib/record";

export type AiChatToolSummaryStatus = "completed" | "failed" | "interrupted" | "running";
type AiChatFinishedToolSummaryStatus = Exclude<AiChatToolSummaryStatus, "interrupted" | "running">;

/**
 * A summary segment is one visual chunk of the summary that either has fixed
 * width (`text`, rendered `shrink-0 whitespace-pre` in the tool row) or holds
 * a variable-width label that should shrink first (`name`, rendered
 * `min-w-0 truncate`). The row-level flex layout then handles all dynamic
 * truncation for free — no measurement, no ResizeObserver, no hard-coded
 * character caps — while status icons, favicons, and prefix/suffix words
 * stay visible.
 */
export type AiChatToolSummarySegment =
	| { kind: "text"; value: string }
	| { kind: "name"; value: string };

export interface AiChatToolSummary {
	status: AiChatToolSummaryStatus;
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
	segments?: AiChatToolSummarySegment[];
}

type SummaryPart = string | { name: string };

function toSegments(parts: readonly SummaryPart[]): AiChatToolSummarySegment[] {
	const out: AiChatToolSummarySegment[] = [];
	for (const part of parts) {
		const next: AiChatToolSummarySegment =
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

function toSummary(segments: readonly AiChatToolSummarySegment[]): string {
	return segments.map((segment) => segment.value).join("");
}

function build(status: AiChatToolSummaryStatus, parts: readonly SummaryPart[]): AiChatToolSummary {
	if (parts.length === 1 && typeof parts[0] === "string") {
		return { status, summary: parts[0] };
	}
	const segments = toSegments(parts);
	return { status, summary: toSummary(segments), segments };
}

/**
 * Summary factory. Pass strings and `{ name }` parts positionally and the
 * builder assembles a summary string plus a matching segments array.
 *
 * @example
 *   summary.running("Editing ", ...name(basename))
 *   summary.completed("Updated ", ...name(basename), " with ", formatCount(count, "edit"))
 */
export const summary = {
	running: (...parts: SummaryPart[]) => build("running", parts),
	completed: (...parts: SummaryPart[]) => build("completed", parts),
	failed: (...parts: SummaryPart[]) => build("failed", parts),
};

/**
 * Emits a truncatable name wrapped in curly quotes as three summary parts:
 * the opening quote (fixed), the name (truncates), the closing quote (fixed).
 * The quotes stay visible even when the middle gets ellipsized.
 */
export function name(value: string | undefined): SummaryPart[] {
	const trimmed = value?.trim();
	if (!trimmed) return ["item"];
	return ["“", { name: trimmed }, "”"];
}

export function getRunningToolSummary(input: {
	toolInput: unknown;
	toolName: string;
}): AiChatToolSummary {
	const toolInput = asRecord(input.toolInput);

	switch (input.toolName) {
		case "activate_skill":
			return summary.running("Using ", ...skillGuidanceName(toolInput));
		case "orchestrate":
			// The model authors the label (schema: short plain-language title,
			// streamed ahead of the code) — surface it verbatim.
			return summary.running(getString(toolInput.title) ?? "Working through steps");
		case "workspace_create_items":
			return summary.running(`Creating ${formatCount(getArray(toolInput.items).length, "item")}`);
		case "workspace_delete_items":
			return summary.running(`Deleting ${formatCount(getArray(toolInput.paths).length, "item")}`);
		case "workspace_edit_item":
			return summary.running("Editing ", ...name(getBaseName(getString(toolInput.path))));
		case "workspace_move_items": {
			const count = getArray(toolInput.paths).length;
			const destinationName = getDestinationName(getString(toolInput.destinationPath));
			const target = formatCount(count, "item");
			return destinationName
				? summary.running(`Moving ${target} to `, ...destinationName)
				: summary.running(`Moving ${target}`);
		}
		case "workspace_read_items": {
			const requests = getArray(toolInput.requests).map((request) => asRecord(request));
			const paths = requests.map((request) => getString(request.path)).filter(Boolean) as string[];
			if (requests.length === 1 && paths[0]) {
				const range = formatPageRange(getString(requests[0]?.range));
				return range
					? summary.running("Reading ", ...name(getBaseName(paths[0])), ` p. ${range}`)
					: summary.running("Reading ", ...name(getBaseName(paths[0])));
			}
			return summary.running(`Reading ${formatCount(paths.length, "item")}`);
		}
		case "workspace_search_items":
			return summary.running("Searching for ", ...name(getFirstSearchPattern(toolInput)));
		case "workspace_rename_item": {
			const oldName = getBaseName(getString(toolInput.path));
			const newName = getString(toolInput.name);
			return newName
				? summary.running("Renaming ", ...name(oldName), " → ", ...name(newName))
				: summary.running("Renaming ", ...name(oldName));
		}
		case "web_fetch":
			return summary.running("Reading ", {
				name: formatUrlWithPath(getString(toolInput.url)),
			});
		case "web_search":
			return summary.running("Searching for ", ...name(getString(toolInput.query)));
		case "research_deepen":
			return summarizeRunningResearchDeepen(toolInput);
		case "research_discover":
			return summary.running("Finding sources for ", ...name(getString(toolInput.query)));
		default:
			return summary.running(`Running ${formatToolNameFallback(input.toolName)}`);
	}
}

export function getFinishedToolSummary(input: {
	baseStatus: AiChatFinishedToolSummaryStatus;
	output: unknown;
	toolInput: unknown;
	toolName: string;
}): AiChatToolSummary {
	if (input.baseStatus === "failed") {
		return summarizeFailedTool(input.toolName, input.output, input.toolInput);
	}

	switch (input.toolName) {
		case "activate_skill":
			return summary.completed("Used ", ...skillGuidanceName(asRecord(input.toolInput)));
		case "orchestrate":
			return summarizeOrchestrate(input.output, input.toolInput);
		case "workspace_create_items":
			return summarizeWorkspaceBatch(input.output, {
				failureVerb: "create",
				successVerb: "Created",
				typeFromItem: (item) => {
					const type = getString(asRecord(item).type);
					return type === "folder"
						? "folder"
						: type === "flashcard"
							? "flashcard set"
							: type === "quiz"
								? "quiz"
								: "document";
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
		case "workspace_search_items":
			return summarizeWorkspaceSearch(input.output, input.toolInput);
		case "web_search":
			return summarizeWebSearch(input.output, input.toolInput);
		case "web_fetch":
			return summarizeWebFetch(input.output, input.toolInput);
		case "research_discover":
			return summarizeResearchDiscover(input.output, input.toolInput);
		case "research_deepen":
			return summarizeResearchDeepen(input.output, input.toolInput);
		default:
			return summary.completed(summarizeUnknownResult(input.output, input.toolName));
	}
}

function summarizeFailedTool(
	toolName: string,
	output: unknown,
	toolInput: unknown,
): AiChatToolSummary {
	const outputRecord = asRecord(output);
	const failedCount = getArray(outputRecord.failed).length;

	switch (toolName) {
		case "activate_skill":
			return summary.failed("Couldn’t load ", ...skillGuidanceName(asRecord(toolInput)));
		case "orchestrate":
			return summary.failed(orchestrateFailureSummary(toolInput));
		case "workspace_create_items":
			return failedCount > 0
				? summary.failed(`Couldn’t create ${formatCount(failedCount, "item")}`)
				: summary.failed("Couldn’t update workspace");
		case "workspace_delete_items":
			return failedCount > 0
				? summary.failed(`Couldn’t delete ${formatCount(failedCount, "item")}`)
				: summary.failed("Couldn’t update workspace");
		case "workspace_move_items":
			return failedCount > 0
				? summary.failed(`Couldn’t move ${formatCount(failedCount, "item")}`)
				: summary.failed("Couldn’t update workspace");
		case "workspace_rename_item":
			return failedCount > 0
				? summary.failed(`Couldn’t rename ${formatCount(failedCount, "item")}`)
				: summary.failed("Couldn’t update workspace");
		case "workspace_edit_item":
			return summary.failed(
				"Couldn’t update ",
				...name(getBaseName(getString(outputRecord.path) ?? getPathFromToolInput(toolInput))),
			);
		case "workspace_read_items":
			return failedCount > 0
				? summary.failed(`Couldn’t read ${formatCount(failedCount, "item")}`)
				: summary.failed("Couldn’t read workspace");
		case "workspace_search_items":
			return summary.failed("Couldn’t search workspace");
		default:
			return summary.failed(`${capitalize(formatToolNameFallback(toolName))} failed`);
	}
}

// The orchestrate tool reports failures as a successful output with
// status "error" (so calls and logs survive), which is why the completed
// branch also has to map to a failed summary.
function summarizeOrchestrate(output: unknown, toolInput: unknown): AiChatToolSummary {
	const record = asRecord(output);
	const title = getString(asRecord(toolInput).title);

	if (getString(record.status) === "error") {
		return summary.failed(orchestrateFailureSummary(toolInput));
	}

	// Count only the calls the expanded step list will show: registry-hidden
	// tools (list workspace, time checks) stay invisible here too, so the
	// number always matches the rows.
	const stepCount = getVisibleOrchestrateCallCount(record.calls);
	const base = title ?? "Worked through steps";
	return stepCount > 0
		? summary.completed(base, ` · ${formatCount(stepCount, "step")}`)
		: summary.completed(base);
}

/** Recorded orchestrate calls whose tools have visible chat rows. */
export function isVisibleOrchestrateCallTool(toolName: string) {
	return getAiToolPresentation(toolName).visibility === "visible";
}

function getVisibleOrchestrateCallCount(calls: unknown) {
	return getArray(calls).filter((call) => {
		const toolName = getString(asRecord(call).toolName);
		return toolName !== undefined && isVisibleOrchestrateCallTool(toolName);
	}).length;
}

function orchestrateFailureSummary(toolInput: unknown) {
	const title = getString(asRecord(toolInput).title);
	return title ? `Couldn’t finish ${lowercaseFirst(title)}` : "Couldn’t finish the steps";
}

function lowercaseFirst(value: string) {
	return value.length === 0 ? value : `${value.charAt(0).toLowerCase()}${value.slice(1)}`;
}

function getFirstSearchPattern(toolInput: Record<string, unknown>) {
	const { patterns } = toolInput;
	return typeof patterns === "string" ? patterns : getString(getArray(patterns)[0]);
}

function summarizeWorkspaceSearch(output: unknown, toolInput: unknown): AiChatToolSummary {
	const hits = getArray(asRecord(output).hits).length;
	const pattern = name(getFirstSearchPattern(asRecord(toolInput)));

	return hits === 0
		? summary.completed("No results for ", ...pattern)
		: summary.completed(`Found ${formatCount(hits, "result")} for `, ...pattern);
}

function summarizeWorkspaceBatch(
	output: unknown,
	options: {
		failureVerb: string;
		successVerb: string;
		destination?: SummaryPart[];
		typeFromItem?: (item: unknown) => string;
	},
): AiChatToolSummary {
	const record = asRecord(output);
	const items = getArray(record.items);
	const failedCount = getArray(record.failed).length;

	if (items.length === 0 && failedCount > 0) {
		return summary.failed(`Couldn’t ${options.failureVerb} ${formatCount(failedCount, "item")}`);
	}

	const base: SummaryPart[] =
		items.length === 1
			? singleWorkspaceItemParts(items[0], options)
			: items.length === 2
				? [`${options.successVerb} `, ...joinNames(items, "item")]
				: [`${options.successVerb} ${formatCount(items.length, "item")}`];

	const withDestination = options.destination
		? ([...base, " to ", ...options.destination] as SummaryPart[])
		: base;
	const withFailures =
		failedCount > 0
			? ([...withDestination, `, ${formatCount(failedCount, "failure")}`] as SummaryPart[])
			: withDestination;

	return summary.completed(...withFailures);
}

function singleWorkspaceItemParts(
	item: unknown,
	options: {
		successVerb: string;
		typeFromItem?: (item: unknown) => string;
	},
): SummaryPart[] {
	const type = options.typeFromItem?.(item);
	const nameParts = name(getBaseName(getString(asRecord(item).path)));
	return type
		? [`${options.successVerb} ${type} `, ...nameParts]
		: [`${options.successVerb} `, ...nameParts];
}

function summarizeWorkspaceRename(output: unknown, toolInput: unknown): AiChatToolSummary {
	const record = asRecord(output);
	const item = asRecord(record.item);
	const failedCount = getArray(record.failed).length;

	if (!record.item && failedCount > 0) {
		return summary.failed(`Couldn’t rename ${formatCount(failedCount, "item")}`);
	}

	const oldName = getBaseName(getString(item.previousPath));
	const newName = getBaseName(getString(item.path) ?? getString(asRecord(toolInput).name));
	const parts: SummaryPart[] = ["Renamed ", ...name(oldName), " → ", ...name(newName)];
	if (failedCount > 0) parts.push(`, ${formatCount(failedCount, "failure")}`);
	return summary.completed(...parts);
}

function summarizeWorkspaceEdit(output: unknown, toolInput: unknown): AiChatToolSummary {
	const record = asRecord(output);
	const failedCount = getArray(record.failed).length;
	const warningCount = getArray(record.warnings).length;
	const appliedCount = getNumber(record.applied) ?? 0;

	if (appliedCount === 0 && failedCount > 0) {
		return summary.failed(
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

	return summary.completed("Updated ", ...nameParts, suffix);
}

function summarizeWorkspaceRead(output: unknown): AiChatToolSummary {
	const record = asRecord(output);
	const results = getArray(record.results);
	const failedCount = results.filter(
		(result) => getString(asRecord(result).status) === "failed",
	).length;
	const readyItems = results.filter((item) => getString(asRecord(item).status) === "ready");
	const pendingItems = results.filter((item) => getString(asRecord(item).status) === "pending");

	if (readyItems.length === 0 && pendingItems.length === 0 && failedCount > 0) {
		return summary.failed(`Couldn’t read ${formatCount(failedCount, "item")}`);
	}
	if (readyItems.length === 0) {
		const parts: SummaryPart[] = [
			`Extraction in progress for ${formatCount(pendingItems.length, "item")}`,
		];
		if (failedCount > 0) parts.push(`, ${formatCount(failedCount, "failure")}`);
		return summary.completed(...parts);
	}

	const base: SummaryPart[] =
		readyItems.length === 1
			? singleReadParts(readyItems[0])
			: [`Read ${formatCount(readyItems.length, "item")}`];

	const withPending: SummaryPart[] =
		pendingItems.length > 0
			? [...base, ` · ${formatCount(pendingItems.length, "item")} still processing`]
			: base;
	const withFailures: SummaryPart[] =
		failedCount > 0 ? [...withPending, `, ${formatCount(failedCount, "failure")}`] : withPending;

	return summary.completed(...withFailures);
}

function singleReadParts(result: unknown): SummaryPart[] {
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

function summarizeWebSearch(output: unknown, toolInput: unknown): AiChatToolSummary {
	const results = getArray(asRecord(output).results);
	const input = asRecord(toolInput);
	const subject = getString(input.query);
	const noun = getString(input.source) === "images" ? "image" : "source";
	const base: SummaryPart[] = [`Found ${formatCount(results.length, noun)}`];
	return subject
		? summary.completed(...base, " for ", ...name(subject))
		: summary.completed(...base);
}

function summarizeWebFetch(output: unknown, toolInput: unknown): AiChatToolSummary {
	const kind = getString(asRecord(output).kind);
	const target = { name: formatUrlWithPath(getString(asRecord(toolInput).url)) };
	if (kind === "unsupported") return summary.completed("Couldn’t read ", target);
	return summary.completed(kind === "image" ? "Inspected " : "Read ", target);
}

function summarizeResearchDiscover(output: unknown, toolInput: unknown): AiChatToolSummary {
	const record = asRecord(output);
	const total = getArray(record.papers).length + getArray(record.github).length;
	const subject = getString(asRecord(toolInput).query);
	const base: SummaryPart[] = [`Found ${formatCount(total, "source")}`];
	return subject
		? summary.completed(...base, " for ", ...name(subject))
		: summary.completed(...base);
}

function summarizeResearchDeepen(output: unknown, toolInput: unknown): AiChatToolSummary {
	const record = asRecord(output);
	const input = asRecord(toolInput);
	const paper = getString(input.paper_id);

	if (Array.isArray(record.passages)) {
		return summary.completed(
			`Read ${formatCount(record.passages.length, "passage")} from `,
			...name(paper),
		);
	}

	if (Array.isArray(record.papers)) {
		return summary.completed(
			`Found ${formatCount(record.papers.length, "paper")} related to `,
			...name(paper),
		);
	}

	return summary.completed(summarizeUnknownResult(output, "research_deepen"));
}

function summarizeRunningResearchDeepen(input: Record<string, unknown>): AiChatToolSummary {
	const paper = getString(input.paper_id);
	const mode = getString(input.mode);

	if (mode === "passages") return summary.running("Reading passages from ", ...name(paper));
	if (mode === "related") return summary.running("Finding related papers for ", ...name(paper));
	return summary.running("Researching ", ...name(paper));
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

function skillGuidanceName(toolInput: Record<string, unknown>): SummaryPart[] {
	const skill = formatToolNameFallback(getString(toolInput.name) ?? "specialized").replace(
		/ authoring$/,
		"",
	);
	return [{ name: `${skill} guidance` }];
}

function capitalize(value: string) {
	return value.length === 0 ? value : `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function joinNames(items: unknown[], fallbackNoun: string): SummaryPart[] {
	const collected: SummaryPart[][] = [];
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

function getDestinationName(path: string | undefined): SummaryPart[] | undefined {
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
