import type { JSONValue, ToolSet } from "ai";
import { z } from "zod";

import type { AIThreadContext } from "#/features/workspaces/ai/ai-thread-metadata";
import { defineAIThreadTool } from "#/features/workspaces/ai/ai-thread-tool";
import {
	fetchPublicWebImage,
	webImageFetchOutputSchema,
	type FreshWebImage,
} from "#/features/workspaces/ai/web-fetch";
import { viewWorkspaceImageOperation } from "#/features/workspaces/operations/view-image";
import { createWorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";

const viewImageInputSchema = z
	.object({
		url: z.string().trim().min(1).optional().describe("Public HTTP(S) URL of a web image."),
		path: z
			.string()
			.trim()
			.min(1)
			.optional()
			.describe("Absolute workspace path of an image file, like /Biology/Krebs cycle.png."),
		ref: z
			.string()
			.trim()
			.min(1)
			.optional()
			.describe("Durable ref of a workspace image file item, like aB3xK9pQ."),
	})
	.superRefine((value, context) => {
		const targets = [value.url, value.path, value.ref].filter((target) => target !== undefined);
		if (targets.length !== 1) {
			context.addIssue({
				code: "custom",
				message: "Pass exactly one of url, path, or ref.",
			});
		}
	});

const viewImageInputExamples = [
	{ input: { path: "/Biology/Krebs cycle.png" } },
	{ input: { ref: "aB3xK9pQ" } },
	{ input: { url: "https://example.com/diagram.png" } },
];

export function createAIThreadImageTools(input: {
	env: Cloudflare.Env;
	threadContext: AIThreadContext;
}): ToolSet {
	const freshImages = new Map<string, FreshWebImage>();

	return {
		view_image: defineAIThreadTool({
			description:
				"Look at an image's actual pixels when its stored description is not enough — exact wording, labels, layout, or fine visual detail. Workspace image files already have a text description that workspace_read_items returns; prefer that first. Pass exactly one of url (public web image), path, or ref (workspace image file). The pixels attach temporarily for this model step only; call again if you need another look.",
			inputSchema: viewImageInputSchema,
			inputExamples: viewImageInputExamples,
			outputSchema: webImageFetchOutputSchema,
			toModelOutput: ({ output, toolCallId }) => {
				const image = freshImages.get(toolCallId);
				freshImages.delete(toolCallId);
				if (!image) {
					return { type: "json" as const, value: output as JSONValue };
				}

				return {
					type: "content" as const,
					value: [
						{ type: "text" as const, text: JSON.stringify(output) },
						{
							type: "file" as const,
							mediaType: image.mediaType,
							data: { type: "data" as const, data: new Uint8Array(image.bytes) },
						},
					],
				};
			},
			execute: async ({ url, path, ref }, context) => {
				if (url) {
					const result = await fetchPublicWebImage({
						abortSignal: context.abortSignal,
						env: input.env,
						url,
					});
					if (result.image) {
						freshImages.set(context.invocationId, result.image);
					}
					return result.output;
				}

				const pixels = await viewWorkspaceImageOperation(
					createWorkspaceAccessContext({
						operationId: context.invocationId,
						scopes: ["workspace:read"],
						userId: input.threadContext.userId,
						workspaceId: input.threadContext.workspaceId,
					}),
					{ ...(path ? { path } : {}), ...(ref ? { ref } : {}) },
				);
				freshImages.set(context.invocationId, {
					bytes: pixels.bytes,
					mediaType: pixels.mediaType,
				});
				return {
					kind: "image" as const,
					source: pixels.path,
					mediaType: pixels.mediaType,
					sizeBytes: pixels.sizeBytes,
				};
			},
		}),
	};
}
