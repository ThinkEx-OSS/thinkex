const targetChunkCharacters = 1_800;
const minimumChunkCharacters = 900;
const overlapCharacters = 220;

export interface WorkspaceSearchTextChunk {
	content: string;
	endLine: number;
	startLine: number;
}

export function chunkWorkspaceSearchText(text: string): WorkspaceSearchTextChunk[] {
	const normalized = text.replace(/\r\n?/g, "\n");
	if (normalized.length === 0) {
		return [{ content: "", endLine: 0, startLine: 0 }];
	}

	const chunks: WorkspaceSearchTextChunk[] = [];
	let start = 0;
	let startLine = 1;
	let startLineCursor = 0;

	while (start < normalized.length) {
		const hardEnd = Math.min(normalized.length, start + targetChunkCharacters);
		const end = findChunkEnd(normalized, start, hardEnd);
		const rawContent = normalized.slice(start, end);
		const leadingWhitespace = rawContent.length - rawContent.trimStart().length;
		const trailingWhitespace = rawContent.length - rawContent.trimEnd().length;
		const contentStart = start + leadingWhitespace;
		const contentEnd = Math.max(contentStart, end - trailingWhitespace);
		const content = normalized.slice(contentStart, contentEnd);

		if (content) {
			for (
				let newline = normalized.indexOf("\n", startLineCursor);
				newline !== -1 && newline < contentStart;
				newline = normalized.indexOf("\n", startLineCursor)
			) {
				startLine += 1;
				startLineCursor = newline + 1;
			}
			chunks.push({
				content,
				endLine: startLine + countLineBreaks(normalized, contentStart, contentEnd),
				startLine,
			});
		}

		if (end >= normalized.length) {
			break;
		}

		const overlapStart = Math.max(start + 1, end - overlapCharacters);
		const nextParagraph = normalized.indexOf("\n\n", overlapStart);
		const nextLine = normalized.indexOf("\n", overlapStart);
		const boundary =
			nextParagraph !== -1 && nextParagraph < end
				? nextParagraph + 2
				: nextLine !== -1 && nextLine < end
					? nextLine + 1
					: overlapStart;
		start = Math.min(boundary, end);
	}

	return chunks.length > 0 ? chunks : [{ content: "", endLine: 0, startLine: 0 }];
}

function findChunkEnd(text: string, start: number, hardEnd: number) {
	if (hardEnd === text.length) {
		return hardEnd;
	}

	const minimumEnd = start + minimumChunkCharacters;
	for (const separator of ["\n\n", "\n", ". "]) {
		const boundary = text.lastIndexOf(separator, hardEnd);
		if (boundary >= minimumEnd) {
			return boundary + separator.length;
		}
	}

	return hardEnd;
}

function countLineBreaks(text: string, start: number, end: number) {
	let count = 0;
	for (let index = text.indexOf("\n", start); index !== -1 && index < end;) {
		count += 1;
		index = text.indexOf("\n", index + 1);
	}
	return count;
}
