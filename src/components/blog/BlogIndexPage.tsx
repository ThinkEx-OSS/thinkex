import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { BlogShell } from "#/components/blog/BlogShell";
import { blogCategories, type BlogCategory } from "#/lib/blog-categories";
import { formatBlogDate, publishedBlogPosts } from "#/lib/blog";

type CategoryFilter = "All" | BlogCategory;

export function BlogIndexPage() {
	const categories: CategoryFilter[] = ["All", ...blogCategories];
	const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>("All");
	const posts =
		selectedCategory === "All"
			? publishedBlogPosts
			: publishedBlogPosts.filter((post) => post.category === selectedCategory);

	return (
		<BlogShell>
			<section>
				<div className="mx-auto w-full max-w-7xl px-6 py-10 sm:py-14">
					<h1 className="text-4xl font-medium tracking-tight text-balance sm:text-5xl">Blog</h1>
					<div className="mt-8 flex flex-wrap gap-3 border-b border-border pb-5 text-sm">
						{categories.map((category) => (
							<button
								key={category}
								type="button"
								onClick={() => setSelectedCategory(category)}
								className={
									category === selectedCategory
										? "h-10 rounded-full bg-foreground px-5 font-medium text-background transition-colors"
										: "h-10 rounded-full bg-muted px-5 font-medium text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
								}
							>
								{category}
							</button>
						))}
					</div>

					<div className="divide-y divide-border">
						{posts.map((post) => (
							<Link
								key={post.slug}
								to="/blog/$slug"
								params={{ slug: post.slug }}
								className="group grid gap-4 py-8 text-foreground no-underline md:grid-cols-[8rem_minmax(0,1fr)_12rem] md:items-start md:gap-8 lg:grid-cols-[9rem_minmax(0,1fr)_16rem]"
							>
								<div className="text-sm text-muted-foreground">{formatBlogDate(post.date)}</div>
								<div className="min-w-0 lg:max-w-3xl">
									<div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
										<span>{post.category}</span>
									</div>
									<h2 className="mt-2 text-2xl font-medium tracking-tight text-balance transition-colors group-hover:text-foreground/75">
										{post.title}
									</h2>
									<p className="mt-3 text-sm leading-6 text-muted-foreground">{post.description}</p>
									<div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
										<span>{post.author}</span>
										<span aria-hidden="true">/</span>
										<span>{post.readingMinutes} min read</span>
									</div>
								</div>
								<div className="md:justify-self-end">
									{post.image ? (
										<div className="aspect-[16/10] overflow-hidden rounded-md border border-border bg-muted md:w-48 lg:w-64">
											<img
												src={post.image}
												alt=""
												className="h-full w-full object-cover"
												loading="lazy"
												decoding="async"
											/>
										</div>
									) : (
										<ArrowRight className="mt-1 hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground md:block" />
									)}
								</div>
							</Link>
						))}
					</div>

					{posts.length === 0 ? (
						<div className="py-16 text-center text-muted-foreground">
							No posts in this category yet.
						</div>
					) : null}
				</div>
			</section>
		</BlogShell>
	);
}
