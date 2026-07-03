import { z } from "zod";

export const workspaceReadPagesSchema = z.object({
	requested: z.string().describe("Requested page range."),
	returned: z.array(z.number().int().min(1)).describe("Page numbers included in content."),
	total: z.number().int().min(1).describe("Total pages available."),
});

export const workspacePageRangeSchema = z
	.string()
	.trim()
	.min(1)
	.regex(/^\d+(?:\s*-\s*\d+)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*$/)
	.describe(
		"1-based pages to read, like 1, 3, 5-7, or 1,4-6. For PDFs, pages are PDF pages. For Markdown-backed items, each page is 1000 Markdown lines. Defaults to 1.",
	);
