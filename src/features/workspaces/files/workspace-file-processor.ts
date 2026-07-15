import { Container, getRandom } from "@cloudflare/containers";

const workspaceFileProcessorPort = 8080;
const workspaceFileProcessorPoolSize = 2;
const processorRequestTimeoutMs = {
	"/parse/pdf": 10 * 60_000,
	"/preview/image": 2 * 60_000,
	"/preview/pdf": 2 * 60_000,
	"/validate/pdf": 2 * 60_000,
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
		path: "/parse/pdf" | "/preview/image" | "/preview/pdf" | "/validate/pdf";
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
	const [response] = await Promise.all([
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
	]);

	return response;
}
