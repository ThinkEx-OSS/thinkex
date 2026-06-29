import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

import { sha256Base64Url } from "#/features/workspaces/extraction/binary";
import {
	joinMarkdownProjectionPages,
	parseMarkdownPagesProjection,
	serializeMarkdownPagesProjection,
} from "#/features/workspaces/extraction/page-markdown-projection";
import { createMarkdownExtractionProvider } from "#/features/workspaces/extraction/providers/index";
import type {
	MarkdownExtractionProviderId,
	MarkdownExtractionProviderMode,
	WorkspaceFileExtractionWorkflowParams,
} from "#/features/workspaces/extraction/types";
import { getWorkspaceKernelFromEnv } from "#/features/workspaces/kernel/workspace-kernel-access";
import { getWorkspaceUploadFamily } from "#/features/workspaces/model/workspace-file";

export class WorkspaceFileExtractionWorkflow extends WorkflowEntrypoint<
	Cloudflare.Env,
	WorkspaceFileExtractionWorkflowParams
> {
	async run(
		event: Readonly<WorkflowEvent<WorkspaceFileExtractionWorkflowParams>>,
		step: WorkflowStep,
	) {
		const params = assertWorkflowParams(event.payload);
		const artifactKey = getExtractionArtifactKey(event.instanceId);

		await step.do("mark extraction processing", async () => {
			const kernel = await getWorkspaceKernelFromEnv(this.env, params.workspaceId);
			await kernel.upsertFileProjection({
				itemId: params.itemId,
				format: "pages",
				status: "processing",
				actorUserId: params.actorUserId,
			});

			return { status: "processing" };
		});

		try {
			const extraction = await step.do(
				"extract page markdown with provider",
				{
					retries: {
						limit: 2,
						delay: "30 seconds",
						backoff: "exponential",
					},
					timeout: "10 minutes",
				},
				async (): Promise<StagedPageExtractionResult> => {
					const kernel = await getWorkspaceKernelFromEnv(this.env, params.workspaceId);
					const source = await kernel.readFileContent({
						itemId: params.itemId,
					});
					const sourceHash = await sha256Base64Url(source.bytes);
					const route = getWorkspaceUploadFamily(params.assetKind).extractionRoute;
					const provider = createMarkdownExtractionProvider(route.provider, this.env);
					const extraction = await provider.extract({
						workspaceId: params.workspaceId,
						itemId: params.itemId,
						bytes: source.bytes,
						fileName: source.fileName,
						contentType: source.contentType,
						sizeBytes: source.sizeBytes,
						sourceHash,
						mode: route.mode,
					});

					const pagesJson = serializeMarkdownPagesProjection(extraction.pages);

					await this.env.WORKSPACE_KERNEL_FILES.put(artifactKey, pagesJson, {
						httpMetadata: { contentType: "application/json" },
					});

					return {
						artifactKey,
						provider: extraction.provider,
						providerMode: extraction.providerMode,
						metadata: extraction.metadata,
						pageCount: extraction.pages.length,
						routeReason: route.reason,
						sourceHash,
					};
				},
			);

			const result = await step.do(
				"write extracted projections",
				{
					retries: {
						limit: 3,
						delay: "10 seconds",
						backoff: "exponential",
					},
					timeout: "5 minutes",
				},
				async () => {
					const kernel = await getWorkspaceKernelFromEnv(this.env, params.workspaceId);
					const artifact = await this.env.WORKSPACE_KERNEL_FILES.get(extraction.artifactKey);

					if (!artifact) {
						throw new Error("Staged page extraction artifact was not found.");
					}

					const pagesJson = await artifact.text();
					const pages = parseMarkdownPagesProjection(pagesJson);
					const metadataJson = {
						...extraction.metadata,
						routeReason: extraction.routeReason,
						pageCount: extraction.pageCount,
						markdownLength: joinMarkdownProjectionPages(pages).length,
					};

					await kernel.upsertFileProjection({
						itemId: params.itemId,
						format: "pages",
						status: "ready",
						content: pagesJson,
						provider: extraction.provider,
						providerMode: extraction.providerMode,
						sourceHash: extraction.sourceHash,
						metadataJson,
						actorUserId: params.actorUserId,
					});

					return {
						status: "ready",
						provider: extraction.provider,
						providerMode: extraction.providerMode,
						pageCount: extraction.pageCount,
					};
				},
			);

			await step.do("delete staged extraction artifact", async () => {
				await this.env.WORKSPACE_KERNEL_FILES.delete(extraction.artifactKey);

				return { deleted: extraction.artifactKey };
			});

			return result;
		} catch (error) {
			await step.do("mark extraction failed", async () => {
				const kernel = await getWorkspaceKernelFromEnv(this.env, params.workspaceId);
				const errorMessage = getErrorMessage(error);
				await kernel.upsertFileProjection({
					itemId: params.itemId,
					format: "pages",
					status: "failed",
					errorMessage,
					actorUserId: params.actorUserId,
				});

				return { status: "failed", errorMessage };
			});

			throw error;
		}
	}
}

interface StagedPageExtractionResult {
	artifactKey: string;
	provider: MarkdownExtractionProviderId;
	providerMode: MarkdownExtractionProviderMode;
	metadata: Record<string, string | number | boolean | null>;
	pageCount: number;
	routeReason: string;
	sourceHash: string;
}

function assertWorkflowParams(
	value: Readonly<WorkspaceFileExtractionWorkflowParams>,
): WorkspaceFileExtractionWorkflowParams {
	if (!value.workspaceId || !value.itemId || !value.assetKind) {
		throw new Error("Invalid workspace file extraction payload.");
	}

	return {
		workspaceId: value.workspaceId,
		itemId: value.itemId,
		actorUserId: value.actorUserId ?? null,
		assetKind: value.assetKind,
	};
}

function getExtractionArtifactKey(instanceId: string) {
	return `workflow-artifacts/page-extraction/${instanceId}/projection.json`;
}

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}
