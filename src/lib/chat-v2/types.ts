import type { UIMessage } from "ai";
import { z } from "zod";

export type ChatMessage = UIMessage;

export const postRequestBodySchema = z.object({
  id: z.string().uuid(),
  message: z.object({
    id: z.string().uuid(),
    role: z.literal("user"),
    parts: z.array(
      z.object({
        type: z.literal("text"),
        text: z.string().min(1).max(10000),
      }),
    ),
  }),
});

export type PostRequestBody = z.infer<typeof postRequestBodySchema>;
