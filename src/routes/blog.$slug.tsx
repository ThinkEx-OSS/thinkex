import { createFileRoute, notFound } from "@tanstack/react-router";

import { BlogPostPage } from "#/components/blog/BlogPostPage";
import { getBlogPost, getBlogPostUrl } from "#/lib/blog";
import { buildPublicMeta, getAbsoluteUrl } from "#/lib/seo";

export const Route = createFileRoute("/blog/$slug")({
	loader: ({ params }) => {
		const post = getBlogPost(params.slug);

		if (!post) {
			throw notFound();
		}

		return post;
	},
	head: ({ loaderData }) => {
		if (!loaderData) {
			return {
				meta: buildPublicMeta({ title: "Blog" }),
			};
		}

		return {
			meta: buildPublicMeta({
				title: loaderData.title,
				description: loaderData.description,
				openGraphType: "article",
				openGraphImageAlt: loaderData.title,
			}).concat([
				{
					property: "article:published_time",
					content: `${loaderData.date}T00:00:00.000Z`,
				},
				{
					property: "article:author",
					content: loaderData.author,
				},
				{
					property: "article:section",
					content: loaderData.category,
				},
			]),
			links: [
				{
					rel: "canonical",
					href: getAbsoluteUrl(getBlogPostUrl(loaderData.slug)),
				},
				{
					rel: "alternate",
					type: "application/rss+xml",
					title: "ThinkEx Blog",
					href: getAbsoluteUrl("/blog/rss"),
				},
			],
		};
	},
	component: BlogPostRoute,
});

function BlogPostRoute() {
	const post = Route.useLoaderData();

	return <BlogPostPage post={post} />;
}
