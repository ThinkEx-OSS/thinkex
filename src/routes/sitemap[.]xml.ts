import { createFileRoute } from "@tanstack/react-router";

import { getBlogPostUrl, publishedBlogPosts } from "#/lib/blog";
import { getAbsoluteUrl } from "#/lib/seo";
import { xmlTextElement } from "#/lib/xml";

type SitemapUrl = {
	loc: string;
	lastmod?: string;
	priority: string;
};

function buildSitemap() {
	const urls: SitemapUrl[] = [
		{ loc: getAbsoluteUrl("/"), priority: "1.0" },
		{ loc: getAbsoluteUrl("/blog"), priority: "0.8" },
		...publishedBlogPosts.map((post) => ({
			loc: getAbsoluteUrl(getBlogPostUrl(post.slug)),
			lastmod: post.date,
			priority: "0.7",
		})),
	];

	const entries = urls
		.map(
			(url) => `<url>
${xmlTextElement("loc", url.loc)}
${url.lastmod ? xmlTextElement("lastmod", url.lastmod) : ""}
${xmlTextElement("priority", url.priority)}
</url>`,
		)
		.join("");

	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`;
}

export const Route = createFileRoute("/sitemap.xml")({
	server: {
		handlers: {
			GET: () =>
				new Response(buildSitemap(), {
					headers: {
						"content-type": "application/xml; charset=utf-8",
						"cache-control": "public, max-age=300",
					},
				}),
		},
	},
});

export { buildSitemap };
