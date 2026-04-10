import { z } from "zod";

export const CodeComposeTraceSchema = z.object({
  externalCalls: z
    .array(
      z.object({
        functionName: z.string(),
        canonicalTool: z.string(),
        durationMs: z.number(),
        error: z.string().optional(),
      }),
    )
    .optional(),
  totalDurationMs: z.number(),
});

export const CodeComposeResultSchema = z.object({
  success: z.boolean(),
  result: z.unknown().optional(),
  error: z.string().optional(),
  trace: CodeComposeTraceSchema.optional(),
});

export type CodeComposeResult = z.infer<typeof CodeComposeResultSchema>;

export function normalizeCodeComposeResult(
  input: unknown,
): CodeComposeResult | null {
  const direct = CodeComposeResultSchema.safeParse(input);
  if (direct.success) {
    return direct.data;
  }

  if (typeof input !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(input);
    const normalized = CodeComposeResultSchema.safeParse(parsed);
    return normalized.success ? normalized.data : null;
  } catch {
    return null;
  }
}
