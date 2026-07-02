import {
	joinMarkdownProjectionPages,
	type MarkdownProjectionPage,
} from "#/features/workspaces/extraction/page-markdown-projection";

export interface WorkspaceCapabilityReadPages {
	requested: string;
	returned: number[];
	total: number;
}

export class WorkspaceCapabilityPageError extends Error {
	constructor(readonly code: "page_range_out_of_range") {
		super(code);
	}
}

export function readWorkspaceCapabilityProjectionPages(
	pages: readonly MarkdownProjectionPage[],
	input: {
		pages?: string;
	},
): { content: string; pages: WorkspaceCapabilityReadPages } {
	const maxPageNumber = pages.reduce((max, page) => Math.max(max, page.pageNumber), 0);
	const requested = input.pages?.trim() || "1";
	const selectedPageNumbers = parseWorkspaceCapabilityPageRange(requested, maxPageNumber);
	const selectedPages = selectedPageNumbers.map((pageNumber) => {
		const page = pages.find((candidate) => candidate.pageNumber === pageNumber);

		if (!page) {
			throw new WorkspaceCapabilityPageError("page_range_out_of_range");
		}

		return page;
	});

	return {
		content: joinMarkdownProjectionPages(selectedPages),
		pages: {
			requested,
			returned: selectedPages.map((page) => page.pageNumber),
			total: maxPageNumber,
		},
	};
}

export function parseWorkspaceCapabilityPageRange(value: string, totalPages: number) {
	const selected = new Set<number>();
	const parts = value.split(",");

	for (const rawPart of parts) {
		const part = rawPart.trim();

		if (!part) {
			continue;
		}

		const rangeMatch = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);

		if (!rangeMatch) {
			throw new WorkspaceCapabilityPageError("page_range_out_of_range");
		}

		const start = Number(rangeMatch[1]);
		const end = Number(rangeMatch[2] ?? rangeMatch[1]);

		if (start < 1 || end < start || end > totalPages) {
			throw new WorkspaceCapabilityPageError("page_range_out_of_range");
		}

		for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
			selected.add(pageNumber);
		}
	}

	if (selected.size === 0) {
		throw new WorkspaceCapabilityPageError("page_range_out_of_range");
	}

	return Array.from(selected).sort((left, right) => left - right);
}
