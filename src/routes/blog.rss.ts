import { createFileRoute } from "@tanstack/react-router";

import { getBlogPostUrl, publishedBlogPosts } from "#/lib/blog";
import { getAbsoluteUrl, seo } from "#/lib/seo";
import { escapeXml, xmlTextElement } from "#/lib/xml";

function buildRssFeed() {
	const items = publishedBlogPosts
		.map((post) => {
			const url = getAbsoluteUrl(getBlogPostUrl(post.slug));

			return [
				"<item>",
				xmlTextElement("title", post.title),
				xmlTextElement("link", url),
				`<guid isPermaLink="true">${escapeXml(url)}</guid>`,
				xmlTextElement("description", post.description),
				xmlTextElement("pubDate", new Date(`${post.date}T00:00:00.000Z`).toUTCString()),
				xmlTextElement("dc:creator", post.author),
				"</item>",
			].join("");
		})
		.join("");

	return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
<title>ThinkEx Blog</title>
<link>${seo.siteUrl}/blog</link>
<description>Product thinking, research workflows, and practical updates from ThinkEx.</description>
<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
</channel>
</rss>`;
}

export const Route = createFileRoute("/blog/rss")({
	server: {
		handlers: {
			GET: () =>
				new Response(buildRssFeed(), {
					headers: {
						"content-type": "application/rss+xml; charset=utf-8",
						"cache-control": "public, max-age=300",
					},
				}),
		},
	},
});

export { buildRssFeed };
