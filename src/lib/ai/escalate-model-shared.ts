import { z } from "zod";

export const EscalateModelResultSchema = z.object({
  escalated: z.boolean(),
  reason: z.string(),
});

export type EscalateModelResult = z.infer<typeof EscalateModelResultSchema>;
