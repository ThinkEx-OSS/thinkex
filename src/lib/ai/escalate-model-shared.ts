import { z } from "zod";

export const EscalateModelResultSchema = z.object({
  analysis: z.string(),
});

export type EscalateModelResult = z.infer<typeof EscalateModelResultSchema>;
