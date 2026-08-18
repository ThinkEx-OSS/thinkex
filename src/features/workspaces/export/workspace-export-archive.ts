import { Zip, ZipPassThrough } from "fflate";

import {
	type WorkspaceItem,
	getWorkspaceItemContentKind,
	isWorkspaceItemContainer,
} from "#/features/workspaces/contracts";
import { serializeTiptapDocumentToMarkdown } from "#/features/workspaces/documents/document-markdown";
import type { TiptapDocumentJson } from "#/features/workspaces/documents/tiptap-document";
import { buildWorkspaceItemPathIndex } from "#/features/workspaces/model/workspace-paths";

const emptyBytes = new Uint8Array();
const textEncoder = new TextEncoder();

interface WorkspaceExportReaders {
	readDocument: (item: WorkspaceItem) => TiptapDocumentJson;
	/** Pre-rendered Markdown for structured items (flashcard sets, quizzes). */
	readStructuredMarkdown: (item: WorkspaceItem) => string;
	readFile: (item: WorkspaceItem) => Promise<ReadableStream<Uint8Array>>;
}

export function createWorkspaceExportStream(
	items: readonly WorkspaceItem[],
	readers: WorkspaceExportReaders,
) {
	const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
	void writeWorkspaceExport(writable, items, readers);
	return readable;
}

async function writeWorkspaceExport(
	writable: WritableStream<Uint8Array>,
	items: readonly WorkspaceItem[],
	readers: WorkspaceExportReaders,
) {
	const writer = writable.getWriter();
	let output = Promise.resolve();
	const zip = new Zip((error, data, final) => {
		if (error) {
			output = output.then(() => writer.abort(error));
			return;
		}

		output = output.then(() => writer.write(data));
		if (final) {
			output = output.then(() => writer.close());
		}
	});

	try {
		const paths = buildWorkspaceItemPathIndex([...items]);
		const archivePaths = buildArchivePathIndex(items, paths);
		for (const item of items) {
			const path = archivePaths.get(item.id);
			if (!path) {
				continue;
			}

			if (isWorkspaceItemContainer(item.type)) {
				await addZipBytes(zip, `${path}/`, emptyBytes, () => output);
				continue;
			}
			if (getWorkspaceItemContentKind(item.type) === "document") {
				const markdown = rewriteMarkdownImageLinks(
					serializeTiptapDocumentToMarkdown(readers.readDocument(item)),
					path,
					archivePaths,
				);
				await addZipBytes(zip, path, textEncoder.encode(`${markdown}\n`), () => output);
				continue;
			}
			if (getWorkspaceItemContentKind(item.type) === "structured") {
				const markdown = rewriteMarkdownImageLinks(
					readers.readStructuredMarkdown(item),
					path,
					archivePaths,
				);
				await addZipBytes(zip, path, textEncoder.encode(markdown), () => output);
				continue;
			}
			if (getWorkspaceItemContentKind(item.type) === "file") {
				await addZipStream(zip, path, await readers.readFile(item), () => output);
			}
		}

		zip.end();
		await output;
	} catch (error) {
		zip.terminate();
		await writer.abort(error).catch(() => undefined);
	}
}

function buildArchivePathIndex(
	items: readonly WorkspaceItem[],
	workspacePaths: ReadonlyMap<string, string>,
) {
	const archivePaths = new Map<string, string>();
	const reservedPaths = new Set<string>();

	for (const item of items) {
		if (!isWorkspaceItemContainer(item.type) && getWorkspaceItemContentKind(item.type) !== "file") {
			continue;
		}
		const path = workspacePaths.get(item.id)?.slice(1);
		if (path) {
			archivePaths.set(item.id, path);
			reservedPaths.add(path.toLowerCase());
		}
	}

	for (const item of items) {
		const contentKind = getWorkspaceItemContentKind(item.type);
		if (contentKind !== "document" && contentKind !== "structured") {
			continue;
		}
		const workspacePath = workspacePaths.get(item.id)?.slice(1);
		if (!workspacePath) {
			continue;
		}

		const markdownPath = workspacePath.toLowerCase().endsWith(".md")
			? workspacePath
			: `${workspacePath}.md`;
		const path = reserveArchivePath(markdownPath, reservedPaths);
		archivePaths.set(item.id, path);
		reservedPaths.add(path.toLowerCase());
	}

	return archivePaths;
}

/**
 * Serialized markdown links images by item id (the only stable in-document
 * handle); the archive is where those ids resolve to real files, so rewrite
 * them into relative links a markdown viewer can follow. Unknown ids stay put.
 */
export function rewriteMarkdownImageLinks(
	markdown: string,
	fromPath: string,
	archivePaths: ReadonlyMap<string, string>,
) {
	return markdown.replace(
		/!\[([^\]]*)\]\(([0-9a-fA-F-]{36})\)/g,
		(match, alt: string, itemId: string) => {
			const target = archivePaths.get(itemId);
			if (!target) return match;
			const relative = relativeArchivePath(fromPath, target);
			return `![${alt}](${/\s/.test(relative) ? `<${relative}>` : relative})`;
		},
	);
}

function relativeArchivePath(fromPath: string, toPath: string) {
	const fromSegments = fromPath.split("/").slice(0, -1);
	const toSegments = toPath.split("/");
	let common = 0;
	while (
		common < fromSegments.length &&
		common < toSegments.length - 1 &&
		fromSegments[common] === toSegments[common]
	) {
		common += 1;
	}
	return [...fromSegments.slice(common).map(() => ".."), ...toSegments.slice(common)].join("/");
}

function reserveArchivePath(path: string, reservedPaths: ReadonlySet<string>) {
	if (!reservedPaths.has(path.toLowerCase())) {
		return path;
	}

	const base = path.slice(0, -3);
	for (let suffix = 2; ; suffix += 1) {
		const candidate = `${base} (${suffix}).md`;
		if (!reservedPaths.has(candidate.toLowerCase())) {
			return candidate;
		}
	}
}

async function addZipBytes(
	zip: Zip,
	path: string,
	bytes: Uint8Array,
	getOutput: () => Promise<void>,
) {
	const file = new ZipPassThrough(path);
	zip.add(file);
	file.push(bytes, true);
	await getOutput();
}

async function addZipStream(
	zip: Zip,
	path: string,
	stream: ReadableStream<Uint8Array>,
	getOutput: () => Promise<void>,
) {
	const file = new ZipPassThrough(path);
	zip.add(file);
	const reader = stream.getReader();

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				file.push(emptyBytes, true);
				await getOutput();
				return;
			}

			file.push(value);
			await getOutput();
		}
	} catch (error) {
		await reader.cancel(error).catch(() => undefined);
		throw error;
	} finally {
		reader.releaseLock();
	}
}
