export type WorkspaceSelectedQuote = {
	id: string;
	label: string;
	source:
		| {
				kind: "assistant-response";
		  }
		| {
				kind: "document-selection";
				itemId: string;
		  }
		| {
				kind: "pdf-selection";
				itemId: string;
				pageNumbers: number[];
		  };
	text: string;
};

export function createWorkspaceSelectedQuoteId(prefix: string) {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return `${prefix}:${crypto.randomUUID()}`;
	}

	return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

export function getPdfSelectedQuoteLabel(pageNumbers: number[]) {
	if (pageNumbers.length === 0) {
		return "PDF selection";
	}

	if (pageNumbers.length === 1) {
		return `PDF p. ${pageNumbers[0]}`;
	}

	return `PDF pp. ${pageNumbers.join(", ")}`;
}

export function createAssistantResponseSelectedQuote(input: {
	text: string;
}): WorkspaceSelectedQuote {
	return {
		id: createWorkspaceSelectedQuoteId("assistant-response"),
		label: "AI response",
		source: {
			kind: "assistant-response",
		},
		text: input.text,
	};
}

export function createDocumentSelectedQuote(input: {
	itemId: string;
	text: string;
}): WorkspaceSelectedQuote {
	return {
		id: createWorkspaceSelectedQuoteId("document-selection"),
		label: "Document selection",
		source: {
			kind: "document-selection",
			itemId: input.itemId,
		},
		text: input.text,
	};
}

export function createPdfSelectedQuote(input: {
	itemId: string;
	pageNumbers: number[];
	text: string;
}): WorkspaceSelectedQuote {
	return {
		id: createWorkspaceSelectedQuoteId("pdf-selection"),
		label: getPdfSelectedQuoteLabel(input.pageNumbers),
		source: {
			kind: "pdf-selection",
			itemId: input.itemId,
			pageNumbers: input.pageNumbers,
		},
		text: input.text,
	};
}

export function normalizeWorkspaceSelectedQuote(quote: unknown): WorkspaceSelectedQuote | null {
	if (!isRecord(quote) || !isWorkspaceSelectedQuoteSource(quote.source)) {
		return null;
	}

	if (
		typeof quote.id !== "string" ||
		typeof quote.label !== "string" ||
		typeof quote.text !== "string"
	) {
		return null;
	}

	const id = quote.id.trim();
	const label = quote.label.trim();
	const text = quote.text.trim();

	if (!id || !label || !text) {
		return null;
	}

	return {
		id,
		label,
		source: quote.source,
		text,
	};
}

function isWorkspaceSelectedQuoteSource(
	source: unknown,
): source is WorkspaceSelectedQuote["source"] {
	if (!isRecord(source) || typeof source.kind !== "string") {
		return false;
	}

	if (source.kind === "assistant-response") {
		return true;
	}

	if (source.kind === "document-selection") {
		return typeof source.itemId === "string" && Boolean(source.itemId.trim());
	}

	return (
		source.kind === "pdf-selection" &&
		typeof source.itemId === "string" &&
		Boolean(source.itemId.trim()) &&
		Array.isArray(source.pageNumbers) &&
		source.pageNumbers.every((pageNumber) => Number.isInteger(pageNumber) && pageNumber > 0)
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
