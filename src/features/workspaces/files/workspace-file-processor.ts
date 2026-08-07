import { Container, getRandom } from "@cloudflare/containers";

import { awaitUploadResponse } from "#/lib/http/streaming-upload";

const workspaceFileProcessorPort = 8080;
const workspaceFileProcessorPoolSize = 2;
// Each of these must stay under the workflow step that wraps it, otherwise the step
// dies first and the abort never fires — trading a named error for an opaque timeout.
const processorRequestTimeoutMs = {
	"/parse/pdf": 4 * 60_000,
	"/prepare/pdf": 2 * 60_000,
	"/preview/image": 2 * 60_000,
} as const;

export class WorkspaceFileProcessor extends Container {
	defaultPort = workspaceFileProcessorPort;
	requiredPorts = [workspaceFileProcessorPort];
	sleepAfter = "5m";
	enableInternet = false;
}

export async function requestWorkspaceFileProcessor(
	env: Cloudflare.Env,
	input: {
		body: ReadableStream<Uint8Array>;
		contentType: string;
		fileName?: string;
		path: "/parse/pdf" | "/prepare/pdf" | "/preview/image";
		sizeBytes: number;
	},
) {
	const processor = await getRandom(env.WORKSPACE_FILE_PROCESSOR, workspaceFileProcessorPoolSize);
	await processor.startAndWaitForPorts({
		cancellationOptions: { portReadyTimeoutMS: 60_000 },
	});

	const headers = new Headers({
		"content-type": input.contentType,
		"x-file-size": String(input.sizeBytes),
	});

	if (input.fileName) {
		headers.set("x-file-name", encodeURIComponent(input.fileName));
	}

	const body = new FixedLengthStream(input.sizeBytes);

	return await awaitUploadResponse(
		processor.fetch(
			new Request(`http://workspace-file-processor${input.path}`, {
				body: body.readable,
				duplex: "half",
				headers,
				method: "POST",
				signal: AbortSignal.timeout(processorRequestTimeoutMs[input.path]),
			} as RequestInit & { duplex: "half" }),
		),
		input.body.pipeTo(body.writable),
	);
}
