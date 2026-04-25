import { z } from "zod";

/**
 * Runtime contract for `POST /api/chat`. Mirrors the body our transport
 * sends in `src/lib/chat/transport.ts` and is parsed at the route boundary
 * with `zod` so we get input validation (not just compile-time types) and
 * never have to touch `as any` again.
 *
 * The wire format is "send only the new message" (à la the Vercel
 * `ai-chatbot` reference): the route hydrates prior turns from
 * `chat_messages` rather than trusting a client-side roster.
 */

const textPartSchema = z.object({
  type: z.literal("text"),
  text: z.string().min(1).max(10_000),
});

const filePartSchema = z.object({
  type: z.literal("file"),
  mediaType: z.string().max(120),
  filename: z.string().max(200).optional(),
  url: z.string().max(8192),
});

const userMessagePartSchema = z.union([textPartSchema, filePartSchema]);

const replySelectionSchema = z.object({
  text: z.string().max(4000),
  title: z.string().max(200).optional(),
  itemId: z.string().max(200).optional(),
  range: z
    .object({ start: z.number(), end: z.number() })
    .partial()
    .optional(),
});

const userMessageMetadataSchema = z
  .object({
    custom: z
      .object({
        replySelections: z.array(replySelectionSchema).optional(),
      })
      .partial()
      .optional(),
  })
  .partial()
  .optional();

/**
 * The single message the client just produced. Always a `user` message in
 * practice — the SDK's `regenerate({ messageId })` path also sends the user
 * message immediately preceding the regenerated assistant turn (the
 * "prompt" of the regeneration).
 */
const newMessageSchema = z.object({
  id: z.string().min(1).max(200),
  role: z.literal("user"),
  parts: z.array(userMessagePartSchema).min(1),
  metadata: userMessageMetadataSchema,
});

export const chatRequestBodySchema = z.object({
  /** SDK chat id (= thread id). Used to upsert `chat_threads.id`. */
  id: z.string().uuid(),
  message: newMessageSchema,

  trigger: z.enum(["submit-message", "regenerate-message"]).optional(),
  messageId: z.string().min(1).max(200).optional(),

  workspaceId: z.string().uuid(),
  modelId: z.string().max(200).nullish(),
  memoryEnabled: z.boolean().nullish(),
  activeFolderId: z.string().max(200).nullish(),
  selectedCardsContext: z.string().max(200_000).nullish(),
  system: z.string().max(200_000).nullish(),
});

export type ChatRequestBody = z.infer<typeof chatRequestBodySchema>;
export type ChatRequestNewMessage = z.infer<typeof newMessageSchema>;
