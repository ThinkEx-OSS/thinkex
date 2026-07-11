import type { WorkflowStep } from "cloudflare:workers";

import { sha256Base64Url } from "#/features/workspaces/extraction/binary";
import {
	joinMarkdownProjectionPages,
	serializeMarkdownPagesProjection,
} from "#/features/workspaces/extraction/page-markdown-projection";
import { extractPdfWithLiteParse } from "#/features/workspaces/extraction/providers/liteparse";
import type {
	LiteParseStageOutcome,
	WorkspaceFileExtractionWorkflowParams,
} from "#/features/workspaces/extraction/types";
import { getWorkspaceKernelFromEnv } from "#/features/workspaces/kernel/workspace-kernel-access";

export async function publishLiteParseProjection(
	env: Cloudflare.Env,
	step: WorkflowStep,
	params: WorkspaceFileExtractionWorkflowParams,
): Promise<LiteParseStageOutcome> {
	if (params.assetKind !== "pdf") {
		return { durationMs: 0, outcome: "skipped" };
	}

	const startedAt = Date.now();

	try {
		return await step.do(
			"publish fast LiteParse projection",
			{
				retries: { limit: 1, delay: "5 seconds", backoff: "constant" },
				timeout: "2 minutes",
			},
			async () => {
				const kernel = await getWorkspaceKernelFromEnv(env, params.workspaceId);
				const source = await kernel.readFileContent({ itemId: params.itemId });
				const sourceHash = await sha256Base64Url(source.bytes);
				const pages = await extractPdfWithLiteParse(env, {
					bytes: source.bytes,
					fileName: source.fileName,
				});
				const content = serializeMarkdownPagesProjection(pages);
				const markdownLength = joinMarkdownProjectionPages(pages).length;

				await kernel.upsertFileProjection({
					itemId: params.itemId,
					format: "pages",
					status: "ready",
					content,
					provider: "liteparse",
					providerMode: "fast",
					sourceHash,
					metadataJson: {
						markdownLength,
						pageCount: pages.length,
						provisional: true,
					},
					actorUserId: params.actorUserId,
				});

				return {
					durationMs: Date.now() - startedAt,
					markdownLength,
					outcome: "success" as const,
					pageCount: pages.length,
				};
			},
		);
	} catch (error) {
		return {
			durationMs: Date.now() - startedAt,
			errorType: error instanceof Error ? error.name : "UnknownError",
			outcome: "error",
		};
	}
}
