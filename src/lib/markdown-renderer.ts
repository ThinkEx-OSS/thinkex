import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { toString } from "hast-util-to-string";
import { unified } from "unified";
import { visit } from "unist-util-visit";

export type MarkdownHeading = {
	id: string;
	text: string;
	level: number;
};

export type RenderedMarkdown = {
	html: string;
	headings: MarkdownHeading[];
};

type HastNode = Parameters<typeof toString>[0];

type HastElement = HastNode & {
	tagName: string;
	properties?: Record<string, unknown>;
};

export async function renderMarkdown(markdown: string): Promise<RenderedMarkdown> {
	const headings: MarkdownHeading[] = [];

	const result = await unified()
		.use(remarkParse)
		.use(remarkGfm)
		.use(remarkRehype)
		.use(rehypeSlug)
		.use(rehypeAutolinkHeadings, {
			behavior: "wrap",
			properties: {
				className: ["blog-heading-anchor"],
			},
		})
		.use(() => (tree) => {
			visit(tree, "element", (element: HastElement) => {
				if (!["h2", "h3"].includes(element.tagName)) {
					return;
				}

				const id = typeof element.properties?.id === "string" ? element.properties.id : "";

				if (!id) {
					return;
				}

				headings.push({
					id,
					text: toString(element),
					level: Number(element.tagName.slice(1)),
				});
			});
		})
		.use(rehypeStringify)
		.process(markdown);

	return {
		html: String(result),
		headings,
	};
}
