declare module "content-collections" {
	export type BlogPostHeading = {
		id: string;
		text: string;
		level: number;
	};

	export type BlogPost = {
		title: string;
		description: string;
		date: string;
		author: string;
		category: import("#/lib/blog-categories").BlogCategory;
		image?: string;
		draft: boolean;
		content: string;
		slug: string;
		readingMinutes: number;
		html: string;
		headings: BlogPostHeading[];
		_meta: {
			filePath: string;
			fileName: string;
			directory: string;
			path: string;
			extension: string;
		};
	};

	export const allBlogPosts: BlogPost[];
}
