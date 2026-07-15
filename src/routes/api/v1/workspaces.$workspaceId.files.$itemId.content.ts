import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";

import { readWorkspaceKernelFileSource } from "#/features/workspaces/kernel/workspace-kernel-access";
import { WorkspaceForbiddenError } from "#/features/workspaces/server/permissions";
import { apiError, getRequestId } from "#/lib/api/http";
import { getSessionFromRequest } from "#/lib/auth-queries.server";
import { ByteRangeNotSatisfiableError, parseByteRange } from "#/lib/http/byte-range";

async function handleWorkspaceFileContent(request: Request, workspaceId: string, itemId: string) {
	const requestId = getRequestId(request);

	try {
		const session = await getSessionFromRequest(request);

		if (!session) {
			return apiError(
				requestId,
				401,
				"UNAUTHORIZED",
				"You must be signed in to view workspace files.",
			);
		}

		const source = await readWorkspaceKernelFileSource({
			workspaceId,
			userId: session.user.id,
			itemId,
		});
		const range = parseByteRange(request.headers.get("range"), source.sizeBytes);
		const object = await env.WORKSPACE_KERNEL_FILES.get(
			source.objectKey,
			range ? { range } : undefined,
		);

		if (!object) {
			throw new Error("Workspace file object was not found.");
		}

		const headers = new Headers({
			"accept-ranges": "bytes",
			"cache-control": "private, max-age=60",
			"content-disposition": `inline; filename="${sanitizeHeaderFileName(source.fileName)}"`,
			"content-length": String(getRangeLength(range) ?? object.size),
			"content-type": source.contentType,
			etag: object.httpEtag,
			"x-request-id": requestId,
		});

		if (range) {
			const { offset, length } = resolveRange(range, source.sizeBytes);
			headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${source.sizeBytes}`);
		}

		return new Response(object.body, {
			headers,
			status: range ? 206 : 200,
		});
	} catch (error) {
		if (error instanceof ByteRangeNotSatisfiableError) {
			return new Response(null, {
				headers: {
					"accept-ranges": "bytes",
					"content-range": `bytes */${error.sizeBytes}`,
					"x-request-id": requestId,
				},
				status: 416,
			});
		}

		if (error instanceof WorkspaceForbiddenError) {
			return apiError(
				requestId,
				403,
				"FORBIDDEN",
				"You do not have permission to view files in this workspace.",
			);
		}

		return apiError(
			requestId,
			404,
			"FILE_NOT_FOUND",
			"Unable to load this workspace file.",
			error instanceof Error ? { message: error.message } : undefined,
		);
	}
}

export const Route = createFileRoute("/api/v1/workspaces/$workspaceId/files/$itemId/content")({
	server: {
		handlers: {
			GET: ({ params, request }) =>
				handleWorkspaceFileContent(request, params.workspaceId, params.itemId),
		},
	},
});

function sanitizeHeaderFileName(fileName: string) {
	return fileName.replace(/["\r\n\\]/g, "_");
}

function getRangeLength(range: R2Range | null) {
	if (!range) {
		return undefined;
	}
	return "suffix" in range ? range.suffix : range.length;
}

function resolveRange(range: R2Range, sizeBytes: number) {
	if ("suffix" in range) {
		return { offset: sizeBytes - range.suffix, length: range.suffix };
	}
	return { offset: range.offset ?? 0, length: range.length ?? sizeBytes };
}

export { handleWorkspaceFileContent };
