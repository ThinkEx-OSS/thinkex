import { z } from "zod";

export const CodeExecuteStepSchema = z.object({
  language: z.string().optional(),
  code: z.string().optional(),
  outcome: z.string().optional(),
  output: z.string().optional(),
});

export const CodeExecuteResultSchema = z.object({
  answer: z.string(),
  steps: z.array(CodeExecuteStepSchema).optional(),
  charts: z
    .array(
      z.object({
        type: z.string(),
        data: z.string(),
      }),
    )
    .optional(),
  error: z.boolean().optional(),
});

export type CodeExecuteStep = z.infer<typeof CodeExecuteStepSchema>;
export type CodeExecuteResult = z.infer<typeof CodeExecuteResultSchema>;

export function normalizeCodeExecuteResult(
  input: unknown,
): CodeExecuteResult | null {
  const direct = CodeExecuteResultSchema.safeParse(input);
  if (direct.success) {
    return direct.data;
  }

  if (typeof input !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(input);
    const normalized = CodeExecuteResultSchema.safeParse(parsed);
    return normalized.success ? normalized.data : null;
  } catch {
    return null;
  }
}
