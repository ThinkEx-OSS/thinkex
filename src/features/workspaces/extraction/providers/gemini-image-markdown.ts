import { generateText } from "ai";

import { WORKSPACE_AI_CHAT_ATTACHMENT_POLICY } from "#/features/workspaces/ai/chat-attachment-policy";
import { getWorkspaceImageExtractionGatewayRoutingOptions } from "#/features/workspaces/ai/ai-gateway-routing";
import {
	getWorkspaceAiGatewayTransportOptions,
	getWorkspaceAiLanguageModelForGatewayModel,
} from "#/features/workspaces/ai/gateway";
import { normalizeChatImageToJpeg } from "#/features/workspaces/conversion/image-normalizer";
import { createSingleMarkdownProjectionPage } from "#/features/workspaces/extraction/page-markdown-projection";
import type {
	MarkdownExtractionProvider,
	MarkdownExtractionResult,
} from "#/features/workspaces/extraction/types";

const IMAGE_EXTRACTION_GATEWAY_MODEL = "google/gemini-2.5-flash";
const jpegMediaType = "image/jpeg";

// Transcription, not interpretation: the markdown feeds search and chat context,
// so a guessed word or a solved equation becomes a fact the user never wrote.
const IMAGE_EXTRACTION_INSTRUCTIONS = `Describe this image in Markdown. Output only the description.

A reader who cannot see the image should know what is in it.
- Transcribe visible text exactly. Do not paraphrase, solve, or finish cut-off lines.
- Math and symbols → LaTeX
- Describe diagrams, charts, photos, and layout in enough detail to reconstruct them:
  what things are, where they sit, what connects to what, labels, arrows, axes.
- Unreadable text → [illegible]. Do not guess.
- Do not add facts that are not visible.`;

export function createGeminiImageMarkdownProvider(env: Env): MarkdownExtractionProvider {
	return {
		id: "gemini_image_markdown",
		async extract(input) {
			const conversion = await normalizeChatImageToJpeg(
				env,
				input.body,
				WORKSPACE_AI_CHAT_ATTACHMENT_POLICY.maxNormalizedFileSize,
			);
			const result = await generateText({
				model: getWorkspaceAiLanguageModelForGatewayModel(IMAGE_EXTRACTION_GATEWAY_MODEL, env),
				providerOptions: {
					gateway: {
						...getWorkspaceAiGatewayTransportOptions(),
						...getWorkspaceImageExtractionGatewayRoutingOptions(),
						tags: [
							"app:thinkex",
							"feature:workspace-extraction",
							"task:image-to-markdown",
							`model:${IMAGE_EXTRACTION_GATEWAY_MODEL}`,
						],
					},
					// The 2.5-series rejects `thinkingLevel` outright, which 400s every
					// Google leg; budget is its knob. Reading what is on the page needs
					// no reasoning, and the fallbacks bill for it if it is left on.
					google: {
						thinkingConfig: { thinkingBudget: 0 },
					},
					vertex: {
						thinkingConfig: { thinkingBudget: 0 },
					},
					openai: {
						reasoningEffort: "none",
					},
				},
				instructions: IMAGE_EXTRACTION_INSTRUCTIONS,
				messages: [
					{
						role: "user",
						content: [
							{
								type: "file",
								data: conversion.bytes,
								mediaType: jpegMediaType,
								filename: input.fileName,
							},
						],
					},
				],
			});

			const markdown = result.text.trim();

			if (!markdown) {
				throw new Error("Gemini image extraction completed without markdown output.");
			}

			return {
				pages: createSingleMarkdownProjectionPage(markdown),
				provider: "gemini_image_markdown",
				providerMode: "default",
				metadata: {
					gatewayModel: IMAGE_EXTRACTION_GATEWAY_MODEL,
					mimeType: jpegMediaType,
					tokens: result.totalUsage.totalTokens ?? 0,
				},
			} satisfies MarkdownExtractionResult;
		},
	};
}
