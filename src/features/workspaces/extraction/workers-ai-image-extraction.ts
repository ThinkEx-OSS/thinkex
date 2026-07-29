import { WORKSPACE_AI_CHAT_ATTACHMENT_POLICY } from "#/features/workspaces/ai/chat-attachment-policy";
import { normalizeChatImageToJpeg } from "#/features/workspaces/conversion/image-normalizer";
import { createSingleMarkdownProjectionPage } from "#/features/workspaces/extraction/page-markdown-projection";

export async function extractImageWithWorkersAi(
	env: Cloudflare.Env,
	input: {
		body: ReadableStream<Uint8Array>;
		fileName: string;
	},
) {
	const conversion = await normalizeChatImageToJpeg(
		env,
		input.body,
		WORKSPACE_AI_CHAT_ATTACHMENT_POLICY.maxNormalizedFileSize,
	);
	const result = await env.AI.toMarkdown(
		{
			name: input.fileName,
			blob: new Blob([conversion.bytes], { type: "image/jpeg" }),
		},
		{
			conversionOptions: {
				image: {
					descriptionLanguage: "en",
				},
			},
		},
	);

	if (result.format === "error") {
		throw new Error(`Workers AI toMarkdown failed: ${result.error}`);
	}

	const pages = createSingleMarkdownProjectionPage(result.data);
	if (pages.length === 0) {
		throw new Error("Workers AI toMarkdown completed without markdown output.");
	}

	return {
		metadata: {
			mimeType: result.mimeType,
			tokens: result.tokens,
		},
		pages,
		provider: "workers_ai_to_markdown" as const,
		providerMode: "default" as const,
	};
}
