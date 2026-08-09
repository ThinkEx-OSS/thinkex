import type { Tool } from "ai";

import {
	workspaceReadItemsInputSchema,
	workspaceReadItemsOutputSchema,
} from "#/features/workspaces/content/workspace-content-contract";
import { getWorkspaceFileSourceObject } from "#/features/workspaces/extraction/workspace-file-source";
import { getWorkspaceKernelFromEnv } from "#/features/workspaces/kernel/workspace-kernel-access";
import { resolveWorkspaceFileTypeFromItem } from "#/features/workspaces/model/workspace-file";

const maxPendingPdfBytes = 3.5 * 1024 * 1024;
type ModelToolOutput = Awaited<ReturnType<NonNullable<Tool["toModelOutput"]>>>;

export async function createPendingPdfModelOutput(input: {
	env: Cloudflare.Env;
	toolInput: unknown;
	toolOutput: unknown;
	workspaceId: string;
}): Promise<ModelToolOutput | null> {
	const parsedInput = workspaceReadItemsInputSchema.safeParse(input.toolInput);
	const parsedOutput = workspaceReadItemsOutputSchema.safeParse(input.toolOutput);
	if (!parsedInput.success || !parsedOutput.success) {
		return null;
	}

	const [request] = parsedInput.data.requests;
	const [result] = parsedOutput.data.results;
	if (
		parsedInput.data.requests.length !== 1 ||
		parsedOutput.data.results.length !== 1 ||
		!request ||
		!result ||
		result.status !== "pending" ||
		result.path !== request.path
	) {
		return null;
	}

	try {
		const kernel = await getWorkspaceKernelFromEnv(input.env, input.workspaceId);
		const [resolution] = await kernel.resolvePaths({ paths: [result.path] });
		if (
			resolution?.status !== "item" ||
			resolveWorkspaceFileTypeFromItem(resolution.item)?.assetKind !== "pdf"
		) {
			return null;
		}

		const { object, source } = await getWorkspaceFileSourceObject({
			env: input.env,
			itemId: resolution.item.id,
			kernel,
		});
		if (source.contentType !== "application/pdf" || object.size > maxPendingPdfBytes) {
			return null;
		}

		return {
			type: "content",
			value: [
				{
					type: "text",
					text: `The original PDF at ${result.path} is attached temporarily because its indexed extraction is still running. Use it for this response. Do not claim extraction is complete or invent ThinkEx page citations. Do not read this path again in this response. On a later turn, call workspace_read_items again so extracted content and citations are used when ready. If the raw PDF is not enough, tell the user extraction is still running and ask them to try again in about ${result.retryAfterSeconds} seconds.`,
				},
				{
					type: "file",
					data: {
						data: new Uint8Array(await object.arrayBuffer()),
						type: "data",
					},
					filename: source.fileName,
					mediaType: "application/pdf",
				},
			],
		};
	} catch {
		// This is an optional bridge while extraction runs; preserve the normal pending result on failure.
		return null;
	}
}
