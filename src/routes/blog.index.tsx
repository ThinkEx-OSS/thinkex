import { createFileRoute } from "@tanstack/react-router";

import { BlogIndexPage } from "#/components/blog/BlogIndexPage";
import { buildPublicMeta, getAbsoluteUrl } from "#/lib/seo";

export const Route = createFileRoute("/blog/")({
	head: () => ({
		meta: buildPublicMeta({
			title: "Blog",
			description:
				"Product thinking, research workflows, and practical updates from the team building ThinkEx.",
		}),
		links: [
			{
				rel: "canonical",
				href: getAbsoluteUrl("/blog"),
			},
		],
	}),
	component: BlogIndexPage,
});
