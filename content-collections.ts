import { defineCollection, defineConfig } from "@content-collections/core";
import { z } from "zod";

import { blogCategories } from "./src/lib/blog-categories";
import { renderMarkdown } from "./src/lib/markdown-renderer";

function getReadingMinutes(content: string) {
	const words = content.trim().split(/\s+/).filter(Boolean).length;
	return Math.max(1, Math.round(words / 220));
}

const blogPosts = defineCollection({
	name: "blogPosts",
	directory: "src/content/blog",
	include: "**/*.md",
	schema: z.object({
		title: z.string(),
		description: z.string(),
		date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
		author: z.string().default("ThinkEx"),
		category: z.enum(blogCategories),
		image: z.string().optional(),
		draft: z.boolean().default(false),
		content: z.string(),
	}),
	transform: async (post) => {
		const rendered = await renderMarkdown(post.content);

		return {
			...post,
			slug: post._meta.path,
			readingMinutes: getReadingMinutes(post.content),
			html: rendered.html,
			headings: rendered.headings,
		};
	},
});

export default defineConfig({
	content: [blogPosts],
});
