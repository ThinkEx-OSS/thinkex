const maxDocumentChunkCharacters = 64_000;
const minDocumentChunkCharacters = maxDocumentChunkCharacters / 2;

export interface DocumentMarkdownChunk {
	content: string;
	location: {
		endLine: number;
		startLine: number;
		totalLines: number;
	};
	nextOffset?: number;
}

export interface DocumentMarkdownChunkReadInput {
	expectedRevision?: string;
	offset: number;
}

export type DocumentMarkdownChunkReadResult =
	| { status: "content_changed" }
	| { status: "invalid_offset" }
	| ({ revision: string; status: "ready" } & DocumentMarkdownChunk);

export interface DocumentMarkdownSnapshot {
	readChunk(offset: number): DocumentMarkdownChunk | undefined;
}

export function createDocumentMarkdownSnapshot(markdown: string): DocumentMarkdownSnapshot {
	const lineStarts = getLineStarts(markdown);

	return {
		readChunk(offset) {
			if (offset < 0 || (offset !== 0 && offset >= markdown.length)) {
				return undefined;
			}

			const candidateEnd = Math.min(markdown.length, offset + maxDocumentChunkCharacters);
			const hardEnd = splitsSurrogatePair(markdown, candidateEnd) ? candidateEnd - 1 : candidateEnd;
			const newlineEnd = markdown.lastIndexOf("\n", hardEnd);
			const end =
				hardEnd < markdown.length && newlineEnd > offset + minDocumentChunkCharacters
					? newlineEnd + 1
					: hardEnd;
			const content = markdown.slice(offset, end);

			return {
				content,
				location: {
					endLine: content ? findLineNumber(lineStarts, end) : 0,
					startLine: content ? findLineNumber(lineStarts, offset) : 0,
					totalLines: lineStarts.length,
				},
				...(end < markdown.length ? { nextOffset: end } : {}),
			};
		},
	};
}

function splitsSurrogatePair(value: string, offset: number) {
	const previous = value.charCodeAt(offset - 1);
	const next = value.charCodeAt(offset);
	return previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff;
}

function getLineStarts(markdown: string) {
	if (!markdown) {
		return [];
	}

	const lineStarts = [0];
	for (
		let index = markdown.indexOf("\n");
		index !== -1;
		index = markdown.indexOf("\n", index + 1)
	) {
		lineStarts.push(index + 1);
	}
	return lineStarts;
}

function findLineNumber(lineStarts: number[], offset: number) {
	let low = 0;
	let high = lineStarts.length;
	while (low < high) {
		const middle = Math.floor((low + high) / 2);
		if ((lineStarts[middle] ?? 0) <= offset) {
			low = middle + 1;
		} else {
			high = middle;
		}
	}
	return low;
}
