import { z } from "zod";

export const MAX_WEB_MAP_LIMIT = 50;
export const MAX_WEB_MAP_LIMIT_HARD_CAP = 200;

export const WebMapInputSchema = z.object({
  url: z
    .string()
    .min(1)
    .describe(
      "The base URL of the site to map. Discovers URLs reachable from this page (sitemap + link discovery). Provide the canonical entry point (e.g. https://docs.python.org/3/ rather than a deep page) when you want a broad map.",
    ),
  search: z
    .string()
    .optional()
    .describe(
      "Optional keyword filter applied server-side. Only URLs whose path/title/description match are returned. Use this to narrow large sites.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_WEB_MAP_LIMIT_HARD_CAP)
    .optional()
    .describe(
      `Maximum URLs to return. Defaults to ${MAX_WEB_MAP_LIMIT}. Hard cap ${MAX_WEB_MAP_LIMIT_HARD_CAP} to keep tool responses small.`,
    ),
  includeSubdomains: z
    .boolean()
    .optional()
    .describe(
      "Whether to include URLs on subdomains of the given host. Defaults to false.",
    ),
  sitemap: z
    .enum(["include", "skip", "only"])
    .optional()
    .describe(
      "How to use the site's sitemap.xml. 'include' (default) merges sitemap + link discovery, 'skip' ignores sitemap, 'only' uses sitemap only.",
    ),
});

export type WebMapInput = z.infer<typeof WebMapInputSchema>;

export const WebMapLinkSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
});

export type WebMapLink = z.infer<typeof WebMapLinkSchema>;

export const WebMapOutputSchema = z.object({
  text: z
    .string()
    .describe(
      "Human-readable summary of the mapped URLs, used by the model to reason over results without re-shaping the array.",
    ),
  links: z.array(WebMapLinkSchema),
  metadata: z.object({
    sourceUrl: z.string(),
    total: z.number(),
    truncated: z.boolean(),
    error: z.string().nullable().optional(),
  }),
});

export type WebMapOutput = z.infer<typeof WebMapOutputSchema>;

export function normalizeWebMapArgs(input: unknown): WebMapInput | null {
  const direct = WebMapInputSchema.safeParse(input);
  if (direct.success) return direct.data;

  if (!input || typeof input !== "object" || Array.isArray(input)) return null;

  const legacy = input as { jsonInput?: string };
  if (typeof legacy?.jsonInput === "string") {
    try {
      const parsed = JSON.parse(legacy.jsonInput);
      const normalized = WebMapInputSchema.safeParse(parsed);
      return normalized.success ? normalized.data : null;
    } catch {
      return null;
    }
  }
  return null;
}
