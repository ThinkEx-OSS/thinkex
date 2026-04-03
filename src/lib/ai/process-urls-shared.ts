import { z } from "zod";

export const MAX_PROCESS_URLS = 20;

export const ProcessUrlsInputSchema = z.object({
  urls: z
    .array(z.string().min(1))
    .min(1)
    .max(MAX_PROCESS_URLS)
    .describe("Web URLs to analyze. Pass them directly as an array of strings."),
  instruction: z
    .string()
    .trim()
    .min(1)
    .max(1000)
    .optional()
    .describe("Optional extra instruction describing what to extract from the URLs."),
});

export type ProcessUrlsInput = z.infer<typeof ProcessUrlsInputSchema>;

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
