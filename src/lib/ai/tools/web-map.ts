import { tool, zodSchema } from "ai";
import { logger } from "@/lib/utils/logger";
import {
  WebMapInputSchema,
  WebMapOutputSchema,
  MAX_WEB_MAP_LIMIT,
  type WebMapOutput,
} from "@/lib/ai/web-map-shared";
import { FirecrawlClient } from "@/lib/ai/utils/firecrawl";

/**
 * Create the web_map tool for discovering URLs on a website.
 */
export function createWebMapTool() {
  return tool({
    description:
      "Discover URLs on a website (sibling pages, sub-pages, related docs) without fetching their content. Use to map out the structure of a site before deciding which specific pages to fetch with web_fetch. Useful when the user pastes a single docs URL and you want to know what other pages live on the same site, or when finding a specific page on a known domain. Returns up to ~50 URLs with title and description. Cheap and fast; safe to call when in doubt about site structure.",
    inputSchema: zodSchema(WebMapInputSchema),
    outputSchema: zodSchema(WebMapOutputSchema),
    strict: true,
    execute: async ({
      url,
      search,
      limit,
      includeSubdomains,
      sitemap,
    }): Promise<WebMapOutput | string> => {
      const effectiveLimit = limit ?? MAX_WEB_MAP_LIMIT;
      logger.debug("🗺️ [WEB_MAP] Mapping site", {
        url,
        search,
        limit: effectiveLimit,
        includeSubdomains,
        sitemap,
      });

      try {
        const client = new FirecrawlClient();
        const result = await client.mapUrl(url, {
          search,
          limit: effectiveLimit,
          includeSubdomains,
          sitemap,
        });

        if (!result.success) {
          logger.warn("🗺️ [WEB_MAP] Map failed", {
            url,
            error: result.error,
          });
          return {
            text: `Failed to map ${url}: ${result.error ?? "Unknown error"}`,
            links: [],
            metadata: {
              sourceUrl: url,
              total: 0,
              truncated: false,
              error: result.error ?? "Unknown error",
            },
          };
        }

        const truncated = result.links.length >= effectiveLimit;
        const summary =
          result.links.length === 0
            ? `No URLs found at ${url}.`
            : `Found ${result.links.length} URL(s) on ${url}${truncated ? " (limit reached — increase `limit` or narrow with `search` for more)" : ""}.`;

        const text = [
          summary,
          "",
          ...result.links.map((link) => {
            const titlePart = link.title ? ` — ${link.title}` : "";
            const descPart = link.description ? `\n  ${link.description}` : "";
            return `- ${link.url}${titlePart}${descPart}`;
          }),
        ].join("\n");

        return {
          text,
          links: result.links,
          metadata: {
            sourceUrl: url,
            total: result.links.length,
            truncated,
            error: null,
          },
        };
      } catch (error) {
        logger.error("🗺️ [WEB_MAP] Error mapping site", {
          url,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          text: `Error mapping ${url}: ${error instanceof Error ? error.message : String(error)}`,
          links: [],
          metadata: {
            sourceUrl: url,
            total: 0,
            truncated: false,
            error: error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
  });
}
