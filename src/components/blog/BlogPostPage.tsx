import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { BlogPost } from "content-collections";

import { BlogShell } from "#/components/blog/BlogShell";
import { BlogTableOfContents } from "#/components/blog/BlogTableOfContents";
import { formatBlogDate } from "#/lib/blog";

type BlogPostPageProps = {
	post: BlogPost;
};

function AllPostsLink() {
	return (
		<Link
			to="/blog"
			className="inline-flex items-center gap-1.5 font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
		>
			<ArrowLeft className="size-4" />
			All posts
		</Link>
	);
}

export function BlogPostPage({ post }: BlogPostPageProps) {
	return (
		<BlogShell>
			<article>
				<div className="mx-auto grid w-full max-w-4xl grid-cols-1 px-6 xl:max-w-[76rem] xl:grid-cols-[minmax(0,56rem)_14rem] xl:gap-10">
					<header className="py-12 sm:py-16 xl:col-start-1">
						<div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
							<AllPostsLink />
							<span aria-hidden="true">/</span>
							<span>{formatBlogDate(post.date)}</span>
							<span aria-hidden="true">/</span>
							<span>{post.readingMinutes} min read</span>
							<span aria-hidden="true">/</span>
							<span>{post.author}</span>
						</div>

						<h1 className="mt-4 text-4xl font-medium tracking-tight text-balance sm:text-5xl">
							{post.title}
						</h1>
						<p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
							{post.description}
						</p>

						{post.image ? (
							<div className="mt-12 overflow-hidden rounded-md border border-border bg-muted">
								<img
									src={post.image}
									alt=""
									className="aspect-[16/9] w-full object-cover"
									loading="eager"
									decoding="async"
								/>
							</div>
						) : null}
					</header>

					<div
						className="blog-prose min-w-0 pb-12 lg:pb-16 xl:col-start-1 xl:row-start-2"
						// Posts are trusted local Markdown from this repository and rendered at build time.
						dangerouslySetInnerHTML={{ __html: post.html }}
					/>

					{post.headings.length > 0 ? (
						<aside className="hidden xl:col-start-2 xl:row-start-2 xl:block">
							<BlogTableOfContents key={post.slug} headings={post.headings} />
						</aside>
					) : null}
				</div>
			</article>
		</BlogShell>
	);
}
