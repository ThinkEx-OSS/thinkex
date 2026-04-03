import { z } from "zod";

export const WebSearchSourceSchema = z.object({
  title: z.string(),
  url: z.string(),
});

export const GroundingChunkSchema = z
  .object({
    web: z
      .object({
        uri: z.string().optional(),
        title: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

export const WebSearchGroundingMetadataSchema = z
  .object({
    webSearchQueries: z.array(z.string()).optional(),
    groundingChunks: z.array(GroundingChunkSchema).optional(),
  })
  .passthrough();

export const WebSearchResultSchema = z.object({
  text: z.string(),
  sources: z.array(WebSearchSourceSchema),
  groundingMetadata: WebSearchGroundingMetadataSchema.optional(),
});

export type WebSearchSource = z.infer<typeof WebSearchSourceSchema>;
export type GroundingChunk = z.infer<typeof GroundingChunkSchema>;
export type WebSearchGroundingMetadata = z.infer<
  typeof WebSearchGroundingMetadataSchema
>;
export type WebSearchResult = z.infer<typeof WebSearchResultSchema>;

export function normalizeWebSearchResult(
  input: unknown,
): WebSearchResult | null {
  const direct = WebSearchResultSchema.safeParse(input);
  if (direct.success) {
    return direct.data;
  }

  if (typeof input !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(input);
    const normalized = WebSearchResultSchema.safeParse(parsed);
    return normalized.success ? normalized.data : null;
  } catch {
    return null;
  }
}
