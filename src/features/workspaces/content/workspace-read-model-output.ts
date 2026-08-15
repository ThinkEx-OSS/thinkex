import type {
	WorkspaceContentReadResult,
	WorkspaceReadItemsOutput,
} from "#/features/workspaces/content/workspace-content-contract";

/**
 * Guidance for read outcomes the model has to react to, keyed by situation.
 *
 * These live here rather than in the tool description because none of them
 * change how a read is issued, and background extraction states are rare enough
 * that every request should not carry the instructions for handling them.
 */
const workspaceReadGuidance = {
	pending:
		"Some paths are still extracting. Never sleep, poll, or otherwise stall waiting for them, including inside compute, sandbox_bash, or orchestrate. If an original file is attached, use it and do not read that path again in this reply. Otherwise, either do other work and read pending paths again later in this reply, or tell the user they are still processing and to ask again in about retryAfterSeconds. Never read the same pending path more than twice in one reply.",
	unrecoverable:
		"Extraction will not finish for some paths. Report the code and any message to the user; do not retry those reads and do not suggest re-uploading the file.",
	transient:
		"Some paths failed on a transient storage problem. One repeat read is reasonable; if it fails again, tell the user.",
	provisional:
		"Some content came from a fast first pass. Pages listed in emptyPages are still extracting, so read them again later rather than reporting them as blank.",
} as const;

/**
 * Collects the handling guidance a set of read results calls for.
 *
 * Emitted once per situation rather than once per result so a batch of pending
 * reads does not repeat the same paragraph for every path.
 */
function createWorkspaceReadGuidance(results: readonly WorkspaceContentReadResult[]): string[] {
	const situations = new Set<keyof typeof workspaceReadGuidance>();

	for (const result of results) {
		if (result.status === "pending") {
			situations.add("pending");
			continue;
		}

		if (result.status === "failed") {
			if (result.code === "extraction_failed" || result.code === "extraction_stalled") {
				situations.add("unrecoverable");
			} else if (result.code === "projection_failed") {
				situations.add("transient");
			}
			continue;
		}

		// Gate on provisional only: emptyPages on a final (non-provisional) read
		// describes genuinely blank pages, which must not be reported as still
		// extracting or the model retries a completed read forever.
		if (result.type === "file" && result.provisional) {
			situations.add("provisional");
		}
	}

	return (Object.keys(workspaceReadGuidance) as Array<keyof typeof workspaceReadGuidance>)
		.filter((situation) => situations.has(situation))
		.map((situation) => workspaceReadGuidance[situation]);
}

/**
 * Projects a rich workspace read result into the model-visible JSON.
 *
 * The results already carry self-describing addresses, so the only work left
 * is dropping the internal item id and attaching guidance for outcomes that
 * need handling.
 */
export function createWorkspaceReadItemsModelOutput(output: WorkspaceReadItemsOutput) {
	const guidance = createWorkspaceReadGuidance(output.results);

	return {
		...(guidance.length > 0 ? { guidance } : {}),
		results: output.results.map(omitWorkspaceReadItemId),
	};
}

function omitWorkspaceReadItemId<T extends object>(result: T): Omit<T, "itemId"> {
	const { itemId: _itemId, ...modelResult } = result as T & { itemId?: string };

	return modelResult;
}
