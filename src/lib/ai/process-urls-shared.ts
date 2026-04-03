import { z } from "zod";

export const MAX_PROCESS_URLS = 20;

export const ProcessUrlsInputSchema = z.object({
  urls: z
    .array(z.string().min(1))
    .min(1)
    .max(MAX_PROCESS_URLS)
    .describe("Web URLs to fetch. Pass them directly as an array of strings."),
});

export type ProcessUrlsInput = z.infer<typeof ProcessUrlsInputSchema>;

export const ProcessUrlsOutputSchema = z.object({
  text: z.string(),
  metadata: z
    .object({
      urlMetadata: z
        .array(
          z.object({
            retrievedUrl: z.string(),
            urlRetrievalStatus: z.string(),
          }),
        )
        .nullable()
        .optional(),
      sources: z
        .array(
          z.object({
            uri: z.string(),
            title: z.string(),
          }),
        )
        .nullable()
        .optional(),
    })
    .optional(),
});

export type ProcessUrlsOutput = z.infer<typeof ProcessUrlsOutputSchema>;

export function normalizeProcessUrlsArgs(
  input: unknown,
): ProcessUrlsInput | null {
  const direct = ProcessUrlsInputSchema.safeParse(input);
  if (direct.success) {
    return direct.data;
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const legacy = input as { jsonInput?: string };

  if (typeof legacy?.jsonInput === "string") {
    try {
      const parsed = JSON.parse(legacy.jsonInput);
      const normalized = ProcessUrlsInputSchema.safeParse(parsed);
      return normalized.success ? normalized.data : null;
    } catch {
      return null;
    }
  }
  return null;
}
