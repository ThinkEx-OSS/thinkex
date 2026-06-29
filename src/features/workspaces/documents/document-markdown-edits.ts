import { z } from "zod";

export const documentMarkdownEditSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("replace"),
		oldText: z.string(),
		newText: z.string(),
		replaceAll: z.boolean().optional(),
	}),
	z.object({
		type: z.literal("append"),
		text: z.string(),
	}),
	z.object({
		type: z.literal("prepend"),
		text: z.string(),
	}),
	z.object({
		type: z.literal("overwrite"),
		content: z.string(),
	}),
]);

export const documentMarkdownEditResultStatusSchema = z.enum([
	"applied",
	"partial",
	"failed",
	"rejected",
]);

export type DocumentMarkdownEdit = z.infer<typeof documentMarkdownEditSchema>;
export type DocumentMarkdownEditResultStatus = z.infer<
	typeof documentMarkdownEditResultStatusSchema
>;

export interface DocumentMarkdownEditFailure {
	code: DocumentMarkdownEditFailureCode;
	index: number;
}

export interface DocumentMarkdownEditResult {
	applied: number;
	content: string;
	failed: number;
	failures: DocumentMarkdownEditFailure[];
	status: Exclude<DocumentMarkdownEditResultStatus, "rejected">;
}

type Replacer = (content: string, find: string) => Generator<string>;

type DocumentMarkdownEditFailureCode =
	| "empty_old_text"
	| "identical_text"
	| "multiple_matches"
	| "old_text_not_found";

export function applyDocumentMarkdownEdits(
	content: string,
	edits: DocumentMarkdownEdit[],
): DocumentMarkdownEditResult {
	let nextContent = content;
	const failures: DocumentMarkdownEditFailure[] = [];
	let applied = 0;

	for (const [index, edit] of edits.entries()) {
		const result = applyDocumentMarkdownEdit(nextContent, edit);

		if (result.status === "failed") {
			failures.push({ code: result.code, index });
			continue;
		}

		nextContent = result.content;
		applied++;
	}

	const failed = failures.length;

	return {
		applied,
		content: nextContent,
		failed,
		failures,
		status: applied === 0 ? "failed" : failed > 0 ? "partial" : "applied",
	};
}

function applyDocumentMarkdownEdit(
	content: string,
	edit: DocumentMarkdownEdit,
):
	| { status: "applied"; content: string }
	| { status: "failed"; code: DocumentMarkdownEditFailureCode } {
	switch (edit.type) {
		case "append":
			return { status: "applied", content: `${content}${edit.text}` };
		case "prepend":
			return { status: "applied", content: `${edit.text}${content}` };
		case "overwrite":
			return { status: "applied", content: edit.content };
		case "replace":
			return replaceDocumentMarkdown(content, edit.oldText, edit.newText, {
				replaceAll: edit.replaceAll ?? false,
			});
	}
}

function replaceDocumentMarkdown(
	content: string,
	oldText: string,
	newText: string,
	options: { replaceAll: boolean },
):
	| { status: "applied"; content: string }
	| { status: "failed"; code: DocumentMarkdownEditFailureCode } {
	if (oldText === "") {
		return { status: "failed", code: "empty_old_text" };
	}

	if (oldText === newText) {
		return { status: "failed", code: "identical_text" };
	}

	const candidates = getDocumentMarkdownReplacementCandidates(content, oldText);

	if (candidates.length === 0) {
		return { status: "failed", code: "old_text_not_found" };
	}

	if (options.replaceAll) {
		return {
			status: "applied",
			content: content.replaceAll(candidates[0].search, newText),
		};
	}

	if (candidates.length > 1 || candidates[0].occurrences > 1) {
		return { status: "failed", code: "multiple_matches" };
	}

	const firstIndex = content.indexOf(candidates[0].search);

	return {
		status: "applied",
		content:
			content.slice(0, firstIndex) +
			newText +
			content.slice(firstIndex + candidates[0].search.length),
	};
}

const documentMarkdownReplacers: Replacer[] = [
	simpleReplacer,
	lineTrimmedReplacer,
	blockAnchorReplacer,
	whitespaceNormalizedReplacer,
	indentationFlexibleReplacer,
	escapeNormalizedReplacer,
	trimmedBoundaryReplacer,
];

function* simpleReplacer(_content: string, find: string) {
	yield find;
}

function getDocumentMarkdownReplacementCandidates(content: string, oldText: string) {
	const seen = new Set<string>();
	const candidates: { occurrences: number; search: string }[] = [];

	for (const replacer of documentMarkdownReplacers) {
		for (const search of replacer(content, oldText)) {
			if (search === "") {
				continue;
			}

			if (seen.has(search)) {
				continue;
			}

			seen.add(search);

			const occurrences = countOccurrences(content, search);

			if (occurrences > 0) {
				candidates.push({ occurrences, search });
			}
		}
	}

	return candidates;
}

function countOccurrences(content: string, search: string) {
	let count = 0;
	let startIndex = 0;

	while (true) {
		const index = content.indexOf(search, startIndex);

		if (index === -1) {
			return count;
		}

		count++;
		startIndex = index + search.length;
	}
}

function* lineTrimmedReplacer(content: string, find: string) {
	const originalLines = content.split("\n");
	const searchLines = trimTrailingEmptyLine(find.split("\n"));

	for (let i = 0; i <= originalLines.length - searchLines.length; i++) {
		const matches = searchLines.every((line, index) => {
			return originalLines[i + index].trim() === line.trim();
		});

		if (!matches) {
			continue;
		}

		yield originalLines.slice(i, i + searchLines.length).join("\n");
	}
}

function* blockAnchorReplacer(content: string, find: string) {
	const originalLines = content.split("\n");
	const searchLines = trimTrailingEmptyLine(find.split("\n"));

	if (searchLines.length < 3) {
		return;
	}

	const firstLineSearch = searchLines[0].trim();
	const lastLineSearch = searchLines[searchLines.length - 1].trim();
	const maxLineDelta = Math.max(1, Math.floor(searchLines.length * 0.25));
	const candidates: { endLine: number; startLine: number }[] = [];

	for (let startLine = 0; startLine < originalLines.length; startLine++) {
		if (originalLines[startLine].trim() !== firstLineSearch) {
			continue;
		}

		for (let endLine = startLine + 2; endLine < originalLines.length; endLine++) {
			if (originalLines[endLine].trim() !== lastLineSearch) {
				continue;
			}

			if (Math.abs(endLine - startLine + 1 - searchLines.length) <= maxLineDelta) {
				candidates.push({ endLine, startLine });
			}
			break;
		}
	}

	const bestCandidate = candidates
		.map((candidate) => ({
			...candidate,
			similarity: getMiddleLineSimilarity(originalLines, searchLines, candidate),
		}))
		.filter((candidate) => candidate.similarity >= 0.65)
		.sort((left, right) => right.similarity - left.similarity)[0];

	if (bestCandidate) {
		yield originalLines.slice(bestCandidate.startLine, bestCandidate.endLine + 1).join("\n");
	}
}

function* whitespaceNormalizedReplacer(content: string, find: string) {
	const normalizedFind = normalizeWhitespace(find);
	const lines = content.split("\n");

	for (const line of lines) {
		const normalizedLine = normalizeWhitespace(line);

		if (normalizedLine === normalizedFind) {
			yield line;
			continue;
		}

		if (!normalizedLine.includes(normalizedFind)) {
			continue;
		}

		const words = find.trim().split(/\s+/);
		const pattern = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
		const match = line.match(new RegExp(pattern));

		if (match) {
			yield match[0];
		}
	}

	const findLines = find.split("\n");

	if (findLines.length <= 1) {
		return;
	}

	for (let i = 0; i <= lines.length - findLines.length; i++) {
		const block = lines.slice(i, i + findLines.length).join("\n");

		if (normalizeWhitespace(block) === normalizedFind) {
			yield block;
		}
	}
}

function* indentationFlexibleReplacer(content: string, find: string) {
	const normalizedFind = removeCommonIndentation(find);
	const contentLines = content.split("\n");
	const findLineCount = find.split("\n").length;

	for (let i = 0; i <= contentLines.length - findLineCount; i++) {
		const block = contentLines.slice(i, i + findLineCount).join("\n");

		if (removeCommonIndentation(block) === normalizedFind) {
			yield block;
		}
	}
}

function* escapeNormalizedReplacer(content: string, find: string) {
	const unescapedFind = unescapeString(find);

	if (content.includes(unescapedFind)) {
		yield unescapedFind;
	}

	const lines = content.split("\n");
	const findLines = unescapedFind.split("\n");

	for (let i = 0; i <= lines.length - findLines.length; i++) {
		const block = lines.slice(i, i + findLines.length).join("\n");

		if (unescapeString(block) === unescapedFind) {
			yield block;
		}
	}
}

function* trimmedBoundaryReplacer(content: string, find: string) {
	const trimmedFind = find.trim();

	if (trimmedFind === find) {
		return;
	}

	if (content.includes(trimmedFind)) {
		yield trimmedFind;
	}

	const lines = content.split("\n");
	const findLines = find.split("\n");

	for (let i = 0; i <= lines.length - findLines.length; i++) {
		const block = lines.slice(i, i + findLines.length).join("\n");

		if (block.trim() === trimmedFind) {
			yield block;
		}
	}
}

function getMiddleLineSimilarity(
	originalLines: string[],
	searchLines: string[],
	candidate: { endLine: number; startLine: number },
) {
	const linesToCheck = Math.min(
		searchLines.length - 2,
		candidate.endLine - candidate.startLine - 1,
	);

	if (linesToCheck <= 0) {
		return 1;
	}

	let similarity = 0;

	for (let i = 1; i <= linesToCheck; i++) {
		const originalLine = originalLines[candidate.startLine + i].trim();
		const searchLine = searchLines[i].trim();
		const maxLength = Math.max(originalLine.length, searchLine.length);

		if (maxLength === 0) {
			continue;
		}

		similarity += 1 - levenshtein(originalLine, searchLine) / maxLength;
	}

	return similarity / linesToCheck;
}

function levenshtein(left: string, right: string) {
	if (left === "" || right === "") {
		return Math.max(left.length, right.length);
	}

	const matrix = Array.from({ length: left.length + 1 }, (_, i) =>
		Array.from({ length: right.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
	);

	for (let i = 1; i <= left.length; i++) {
		for (let j = 1; j <= right.length; j++) {
			const cost = left[i - 1] === right[j - 1] ? 0 : 1;
			matrix[i][j] = Math.min(
				matrix[i - 1][j] + 1,
				matrix[i][j - 1] + 1,
				matrix[i - 1][j - 1] + cost,
			);
		}
	}

	return matrix[left.length][right.length];
}

function trimTrailingEmptyLine(lines: string[]) {
	if (lines[lines.length - 1] === "") {
		return lines.slice(0, -1);
	}

	return lines;
}

function normalizeWhitespace(text: string) {
	return text.replace(/\s+/g, " ").trim();
}

function removeCommonIndentation(text: string) {
	const lines = text.split("\n");
	const nonEmptyLines = lines.filter((line) => line.trim().length > 0);

	if (nonEmptyLines.length === 0) {
		return text;
	}

	const minIndent = Math.min(...nonEmptyLines.map((line) => line.match(/^(\s*)/)?.[1].length ?? 0));

	return lines.map((line) => (line.trim().length === 0 ? line : line.slice(minIndent))).join("\n");
}

function unescapeString(value: string) {
	return value.replace(/\\(n|t|r|'|"|`|\\|\n|\$)/g, (match, captured) => {
		switch (captured) {
			case "n":
				return "\n";
			case "t":
				return "\t";
			case "r":
				return "\r";
			case "'":
				return "'";
			case '"':
				return '"';
			case "`":
				return "`";
			case "\\":
				return "\\";
			case "\n":
				return "\n";
			case "$":
				return "$";
			default:
				return match;
		}
	});
}
