export interface WorkspaceReadPages {
	requested: string;
	returned: number[];
	total: number;
}

export const maxWorkspacePageReadCount = 20;

export class WorkspacePageSelectionError extends Error {
	constructor(readonly code: "page_range_out_of_range" | "page_selection_too_large") {
		super(code);
	}
}

export function parseWorkspacePageRange(value: string, totalPages: number) {
	const selected = new Set<number>();
	const parts = value.split(",");

	for (const rawPart of parts) {
		const part = rawPart.trim();

		if (!part) {
			continue;
		}

		const rangeMatch = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);

		if (!rangeMatch) {
			throw new WorkspacePageSelectionError("page_range_out_of_range");
		}

		const start = Number(rangeMatch[1]);
		const end = Number(rangeMatch[2] ?? rangeMatch[1]);

		if (start < 1 || end < start || end > totalPages) {
			throw new WorkspacePageSelectionError("page_range_out_of_range");
		}

		for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
			selected.add(pageNumber);

			if (selected.size > maxWorkspacePageReadCount) {
				throw new WorkspacePageSelectionError("page_selection_too_large");
			}
		}
	}

	if (selected.size === 0) {
		throw new WorkspacePageSelectionError("page_range_out_of_range");
	}

	return Array.from(selected).sort((left, right) => left - right);
}
