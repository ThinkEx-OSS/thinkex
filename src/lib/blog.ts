import { allBlogPosts } from "content-collections";

export const blogBasePath = "/blog";

const blogDateFormatter = new Intl.DateTimeFormat("en", {
	month: "long",
	day: "numeric",
	year: "numeric",
	timeZone: "UTC",
});

export const publishedBlogPosts = allBlogPosts
	.filter((post) => !post.draft)
	.sort((a, b) => b.date.localeCompare(a.date));

export function getBlogPost(slug: string) {
	return publishedBlogPosts.find((post) => post.slug === slug);
}

export function getBlogPostUrl(slug: string) {
	return `${blogBasePath}/${slug}`;
}

export function formatBlogDate(date: string) {
	return blogDateFormatter.format(new Date(`${date}T00:00:00.000Z`));
}
