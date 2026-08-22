import { createFileRoute } from "@tanstack/react-router";

import { PublicHeader } from "#/components/PublicHeader";
import SiteFooter from "#/components/SiteFooter";
import { buildPublicMeta, getAbsoluteUrl } from "#/lib/seo";

const resources = [
	{
		title: "ThinkEx MCP server",
		description: "Connect compatible AI clients to ThinkEx workspaces with browser-based OAuth.",
		href: "https://docs.thinkex.app/guides/mcp",
	},
	{
		title: "ThinkEx documentation",
		description: "Read product, architecture, local development, and deployment documentation.",
		href: "https://docs.thinkex.app",
	},
	{
		title: "ThinkEx source code",
		description: "Inspect, self-host, or contribute to the open-source ThinkEx application.",
		href: "https://github.com/ThinkEx-OSS/thinkex",
	},
] as const;

export const Route = createFileRoute("/developers")({
	head: () => ({
		meta: buildPublicMeta({
			title: "Developer Resources",
			description: "ThinkEx developer resources for agents, MCP integrations, and self-hosting.",
		}),
		links: [{ rel: "canonical", href: getAbsoluteUrl("/developers") }],
	}),
	component: DeveloperResourcesPage,
});

function DeveloperResourcesPage() {
	return (
		<div
			data-app-shell
			className="flex min-h-screen flex-col bg-background text-foreground dark:bg-black"
		>
			<PublicHeader />
			<main className="flex-1">
				<article className="mx-auto w-full max-w-3xl px-6 py-12 sm:py-16">
					<h1 className="text-4xl font-medium tracking-tight text-balance sm:text-5xl">
						ThinkEx developer resources
					</h1>
					<p className="mt-5 text-base leading-7 text-muted-foreground sm:text-lg">
						ThinkEx supports agent integrations through its remote MCP server. It does not currently
						publish a general-purpose REST API, OpenAPI specification, or webhooks.
					</p>
					<div className="mt-10 space-y-9">
						{resources.map((resource) => (
							<section key={resource.title} className="space-y-3">
								<h2 className="text-xl font-medium tracking-tight">
									<a className="underline underline-offset-4" href={resource.href}>
										{resource.title}
									</a>
								</h2>
								<p className="text-sm leading-7 text-muted-foreground">{resource.description}</p>
							</section>
						))}
					</div>
				</article>
			</main>
			<SiteFooter />
		</div>
	);
}
