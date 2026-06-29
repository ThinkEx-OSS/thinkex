import { z } from "zod";

export const apiErrorSchema = z.object({
	requestId: z.string(),
	code: z.string(),
	message: z.string(),
	details: z.unknown().optional(),
});
