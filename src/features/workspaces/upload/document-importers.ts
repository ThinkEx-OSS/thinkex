import Papa from "papaparse";

import type { JsonValue } from "#/features/workspaces/contracts";
import {
	resolveCodeLanguageFromFileName,
	supportedCodeFileExtensions,
	supportedCodeFileNames,
	type SupportedCodeLanguage,
} from "#/features/workspaces/documents/code-block-shiki/code-languages";
import { parseMarkdownToTiptapDocumentProjection } from "#/features/workspaces/documents/document-markdown";
import { plainTextToTiptapDocument } from "#/features/workspaces/documents/plain-text-document";
import {
	type TiptapDocumentJson,
	stringifyTiptapDocumentJson,
} from "#/features/workspaces/documents/tiptap-document";

export interface WorkspaceDocumentCreateContent {
	initialContent: string;
	metadataJson: Record<string, JsonValue>;
	name: string;
}

export interface WorkspaceDocumentImportFormat {
	id: "csv" | "tsv" | "markdown" | "plain_text" | "code";
	label: string;
	extensions: readonly string[];
	fileNames: readonly string[];
	mimes: readonly string[];
	importFile(file: File): Promise<WorkspaceDocumentCreateContent>;
	matchesFileName?(fileName: string): boolean;
}

export const workspaceDocumentImportFormats: readonly WorkspaceDocumentImportFormat[] = [
	createDelimitedTableImporter({
		id: "csv",
		label: "CSV",
		extensions: ["csv"],
		mimes: ["text/csv"],
	}),
	createDelimitedTableImporter({
		id: "tsv",
		label: "TSV",
		delimiter: "\t",
		extensions: ["tsv"],
		mimes: ["text/tab-separated-values"],
	}),
	{
		id: "markdown",
		label: "Markdown",
		extensions: ["md", "markdown"],
		fileNames: [],
		mimes: ["text/markdown", "text/x-markdown"],
		importFile: importMarkdownFile,
	},
	{
		id: "code",
		label: "code",
		extensions: supportedCodeFileExtensions,
		fileNames: supportedCodeFileNames,
		mimes: [],
		importFile: importCodeFile,
		matchesFileName: (fileName) => resolveCodeLanguageFromFileName(fileName) !== null,
	},
	{
		id: "plain_text",
		label: "text",
		extensions: ["txt"],
		fileNames: [],
		mimes: ["text/plain"],
		importFile: importPlainTextFile,
	},
];

function createDelimitedTableImporter(input: {
	id: "csv" | "tsv";
	label: string;
	delimiter?: string;
	extensions: readonly string[];
	mimes: readonly string[];
}): WorkspaceDocumentImportFormat {
	return {
		id: input.id,
		label: input.label,
		extensions: input.extensions,
		fileNames: [],
		mimes: input.mimes,
		async importFile(file) {
			const bytes = new Uint8Array(await file.arrayBuffer());
			const table = parseDelimitedTable(bytes, { delimiter: input.delimiter });
			const markdown = serializeDelimitedRowsToMarkdown(table.rows, table.totalColumns);
			const projection = parseMarkdownToTiptapDocumentProjection(markdown);

			return {
				initialContent: stringifyTiptapDocumentJson(projection.document),
				metadataJson: {
					convertedFromContentType: file.type || input.mimes[0],
					convertedFromFileName: file.name,
					importFormat: input.id,
					tableColumns: table.totalColumns,
					tableRows: table.rows.length,
				},
				name: getImportedDocumentName(file.name),
			};
		},
	};
}

async function importCodeFile(file: File): Promise<WorkspaceDocumentCreateContent> {
	const language = resolveCodeLanguageFromFileName(file.name);

	if (!language) {
		throw new Error("Code file language is not supported.");
	}

	return {
		initialContent: stringifyTiptapDocumentJson(
			codeTextToTiptapDocument(await file.text(), language),
		),
		metadataJson: {
			codeLanguage: language,
			convertedFromContentType: file.type || "text/plain",
			convertedFromFileName: file.name,
			importFormat: "code",
		},
		name: getImportedDocumentName(file.name),
	};
}

async function importMarkdownFile(file: File): Promise<WorkspaceDocumentCreateContent> {
	const markdown = await file.text();
	const projection = parseMarkdownToTiptapDocumentProjection(markdown);

	return {
		initialContent: stringifyTiptapDocumentJson(projection.document),
		metadataJson: {
			convertedFromContentType: file.type || "text/markdown",
			convertedFromFileName: file.name,
			importFormat: "markdown",
			importWarnings: projection.warnings.length,
		},
		name: getImportedDocumentName(file.name),
	};
}

async function importPlainTextFile(file: File): Promise<WorkspaceDocumentCreateContent> {
	const text = await file.text();

	return {
		initialContent: stringifyTiptapDocumentJson(plainTextToTiptapDocument(text)),
		metadataJson: {
			convertedFromContentType: file.type || "text/plain",
			convertedFromFileName: file.name,
			importFormat: "plain_text",
		},
		name: getImportedDocumentName(file.name),
	};
}

function codeTextToTiptapDocument(
	text: string,
	language: SupportedCodeLanguage,
): TiptapDocumentJson {
	const normalizedText = text.replace(/\r\n?/g, "\n");

	return {
		type: "doc",
		content: [
			{
				type: "codeBlock",
				attrs: { language },
				...(normalizedText ? { content: [{ type: "text", text: normalizedText }] } : {}),
			},
		],
	};
}

function parseDelimitedTable(bytes: Uint8Array, options: { delimiter?: string }) {
	const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
	const rows: string[][] = [];
	let totalColumns = 0;
	let parseError: string | null = null;

	Papa.parse<string[]>(text, {
		...(options.delimiter ? { delimiter: options.delimiter } : {}),
		skipEmptyLines: "greedy",
		step: (result, parser) => {
			if (result.errors.length > 0) {
				parseError = result.errors[0]?.message ?? "Unable to parse delimited text row.";
				parser.abort();
				return;
			}

			const row = result.data.map((cell) => (typeof cell === "string" ? cell : String(cell ?? "")));

			totalColumns = Math.max(totalColumns, row.length);
			rows.push(row);
		},
	});

	if (parseError) {
		throw new Error(parseError);
	}

	if (rows.length === 0) {
		throw new Error("Imported table did not contain any rows.");
	}

	return { rows, totalColumns };
}

function serializeDelimitedRowsToMarkdown(rows: string[][], totalColumns: number) {
	const columnCount = Math.max(1, totalColumns);
	const [headerRow = [], ...bodyRows] = rows;
	const header = normalizeMarkdownRow(headerRow, columnCount);
	const body = bodyRows.map((row) => normalizeMarkdownRow(row, columnCount));

	return [
		`| ${header.join(" | ")} |`,
		`| ${Array.from({ length: columnCount }, () => "---").join(" | ")} |`,
		...body.map((row) => `| ${row.join(" | ")} |`),
	].join("\n");
}

function normalizeMarkdownRow(row: string[], columnCount: number) {
	return Array.from({ length: columnCount }, (_, index) =>
		escapeMarkdownTableCell(row[index]?.trim() ?? ""),
	);
}

function escapeMarkdownTableCell(value: string) {
	return value.replace(/\r?\n/g, "<br>").replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

function getImportedDocumentName(fileName: string) {
	const name = fileName.trim().split(/[\\/]/).at(-1) || "Imported document";

	if (name.startsWith(".")) {
		return name;
	}

	const lastDot = name.lastIndexOf(".");

	if (lastDot <= 0) {
		return name;
	}

	return name.slice(0, lastDot) || "Imported document";
}
