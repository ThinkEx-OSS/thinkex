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

const researchDeepenInputSchema = z.discriminatedUnion("mode", [
	z.object({
		mode: z.literal("passages"),
		paper_id: z.string().trim().min(1).describe("Paper identifier."),
		question: z.string().trim().min(1).describe("Question to answer from the paper."),
		limit: z.number().int().min(1).max(40).optional().describe("Maximum passages to return."),
	}),
	z.object({
		mode: z.literal("related"),
		paper_id: z.string().trim().min(1).describe("Paper identifier."),
		relation: z
			.enum(["similar", "citers", "references"])
			.describe("Which related papers to return."),
		intent: z.string().trim().min(1).describe("What kind of related work to prioritize."),
		limit: z.number().int().min(1).max(50).optional().describe("Maximum papers to return."),
	}),
]);

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
					return deepenResearchWithPassages({
						env,
						paperId: input.paper_id,
						question: input.question,
						limit: input.limit ?? 6,
					});
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
