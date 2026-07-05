import { Outlet, createFileRoute } from "@tanstack/react-router";
import { getAbsoluteUrl } from "#/lib/seo";

export const Route = createFileRoute("/blog")({
	head: () => ({
		links: [
			{
				rel: "alternate",
				type: "application/rss+xml",
				title: "ThinkEx Blog",
				href: getAbsoluteUrl("/blog/rss"),
			},
		],
	}),
	component: Outlet,
});
