import type { Tool } from "ai";

import { workspaceReadItemsOutputSchema } from "#/features/workspaces/content/workspace-content-contract";
import { createWorkspaceReadItemsModelOutput } from "#/features/workspaces/content/workspace-read-references";
import { getWorkspaceFileSourceObject } from "#/features/workspaces/extraction/workspace-file-source";
import { getWorkspaceKernelFromEnv } from "#/features/workspaces/kernel/workspace-kernel-access";

const maxPendingPdfBytes = 3.5 * 1024 * 1024;
type ModelToolOutput = Awaited<ReturnType<NonNullable<Tool["toModelOutput"]>>>;

export async function createPendingPdfModelOutput(input: {
	env: Cloudflare.Env;
	toolOutput: unknown;
	workspaceId: string;
}): Promise<ModelToolOutput | null> {
	const parsedOutput = workspaceReadItemsOutputSchema.safeParse(input.toolOutput);
	if (!parsedOutput.success) {
		return null;
	}

	const [result] = parsedOutput.data.results;
	if (
		parsedOutput.data.results.length !== 1 ||
		!result ||
		result.status !== "pending" ||
		!result.itemId
	) {
		return null;
	}

	try {
		const kernel = await getWorkspaceKernelFromEnv(input.env, input.workspaceId);
		const { object, source } = await getWorkspaceFileSourceObject({
			env: input.env,
			itemId: result.itemId,
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
					text: `${JSON.stringify(createWorkspaceReadItemsModelOutput(parsedOutput.data))}\n\nThe original PDF is attached temporarily for this response. Do not claim extraction is complete or invent ThinkEx page citations. On a later turn, call workspace_read_items again for extracted, citable content.`,
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
