import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { formatBlogDate, publishedBlogPosts } from "#/lib/blog";

export function LatestBlogSection() {
	const posts = publishedBlogPosts.slice(0, 3);

	if (posts.length === 0) {
		return null;
	}

	return (
		<section className="mt-14 sm:mt-20" aria-label="Latest blog posts">
			<div className="flex items-end justify-between gap-4">
				<h2 className="text-3xl font-medium tracking-tight text-balance sm:text-4xl">Blog</h2>
				<Link
					to="/blog"
					className="hidden items-center gap-1 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:inline-flex"
				>
					View all
					<ArrowRight className="size-3.5" aria-hidden="true" />
				</Link>
			</div>
			<div className="mt-6 grid gap-5 md:grid-cols-3 lg:gap-6">
				{posts.map((post) => (
					<Link
						key={post.slug}
						to="/blog/$slug"
						params={{ slug: post.slug }}
						className="group flex min-h-52 flex-col rounded-md border border-border bg-background p-5 text-foreground no-underline transition-colors hover:border-foreground/25 dark:bg-black"
					>
						<div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
							{post.category}
						</div>
						<h3 className="mt-3 text-xl font-medium tracking-tight text-balance transition-colors group-hover:text-foreground/75">
							{post.title}
						</h3>
						<p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
							{post.description}
						</p>
						<div className="mt-auto flex items-center justify-between gap-3 pt-6 text-sm text-muted-foreground">
							<span>{formatBlogDate(post.date)}</span>
							<span>{post.readingMinutes} min read</span>
						</div>
					</Link>
				))}
			</div>
			<Link
				to="/blog"
				className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:hidden"
			>
				View all
				<ArrowRight className="size-3.5" aria-hidden="true" />
			</Link>
		</section>
	);
}
