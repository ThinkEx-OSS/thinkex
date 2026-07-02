import type { ToolSet } from "ai";
import { tool, zodSchema } from "ai";
import { z } from "zod";
import {
	deepenResearchWithPassages,
	deepenResearchWithRelated,
	discoverResearch,
} from "#/integrations/firecrawl/research";

const researchDiscoverInputSchema = z.object({
	query: z.string().trim().min(1).describe("Research topic or question."),
	limit: z.number().int().min(1).max(25).optional().describe("Maximum results to return."),
	include_github: z
		.boolean()
		.optional()
		.describe("Whether to include related implementation discussions and repositories."),
});

const researchDeepenInputSchema = z.object({
	mode: z.enum(["passages", "related"]).describe("Whether to read passages or find related work."),
	paper_id: z.string().trim().min(1).describe("Paper identifier."),
	question: z
		.string()
		.trim()
		.min(1)
		.optional()
		.describe("Required when mode is passages. Question to answer from the paper."),
	relation: z
		.enum(["similar", "citers", "references"])
		.optional()
		.describe("Required when mode is related. Which related papers to return."),
	intent: z
		.string()
		.trim()
		.min(1)
		.optional()
		.describe("Required when mode is related. What kind of related work to prioritize."),
	limit: z.number().int().min(1).max(50).optional().describe("Maximum results to return."),
});

const researchDiscoverInputExamples = [
	{
		input: {
			query: "efficient transformers for long context",
		},
	},
	{
		input: {
			query: "vision-language model implementation bugs",
			include_github: true,
			limit: 3,
		},
	},
];

export function createAIThreadResearchTools(env: Cloudflare.Env): ToolSet {
	return {
		research_discover: tool({
			description:
				"Find relevant research papers for a topic or question. Optionally include related implementation discussions and repositories.",
			inputSchema: researchDiscoverInputSchema,
			inputExamples: researchDiscoverInputExamples,
			strict: true,
			execute: async ({ query, limit, include_github }) =>
				discoverResearch({
					env,
					query,
					limit: limit ?? 8,
					includeGithub: include_github ?? false,
				}),
		}),
		research_deepen: tool({
			description: "Go deeper on one paper by reading relevant passages or finding related work.",
			inputSchema: zodSchema(researchDeepenInputSchema),
			strict: true,
			execute: async (input: z.infer<typeof researchDeepenInputSchema>) => {
				if (input.mode === "passages") {
					if (!input.question) {
						throw new Error("question is required when mode is passages.");
					}

					return deepenResearchWithPassages({
						env,
						paperId: input.paper_id,
						question: input.question,
						limit: Math.min(input.limit ?? 6, 40),
					});
				}

				if (!input.relation) {
					throw new Error("relation is required when mode is related.");
				}

				if (!input.intent) {
					throw new Error("intent is required when mode is related.");
				}

				return deepenResearchWithRelated({
					env,
					paperId: input.paper_id,
					relation: input.relation,
					intent: input.intent,
					limit: input.limit ?? 10,
				});
			},
		}),
	};
}
