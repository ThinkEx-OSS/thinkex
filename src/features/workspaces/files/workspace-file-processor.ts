import { Container, getRandom } from "@cloudflare/containers";

const workspaceFileProcessorPort = 8080;
const workspaceFileProcessorPoolSize = 2;
const processorRequestTimeoutMs = {
	"/parse/pdf": 10 * 60_000,
	"/preview/image": 2 * 60_000,
	"/preview/pdf": 2 * 60_000,
	"/validate/pdf": 2 * 60_000,
} as const;

// The Containers runtime throws when no instance is available to back the durable
// object (e.g. provisioning lag right after a deploy, or every instance in the pool
// busy). This is transient, so we retry acquisition with backoff instead of failing
// the caller on the first miss.
const provisioningRetryAttempts = 4;
const provisioningRetryBaseDelayMs = 1_000;

export class WorkspaceFileProcessor extends Container {
	defaultPort = workspaceFileProcessorPort;
	requiredPorts = [workspaceFileProcessorPort];
	sleepAfter = "5m";
	enableInternet = false;
}

function isContainerProvisioningError(error: unknown): boolean {
	return error instanceof Error && error.message.includes("no container instance");
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireWorkspaceFileProcessor(env: Cloudflare.Env) {
	let lastError: unknown;

	for (let attempt = 0; attempt < provisioningRetryAttempts; attempt++) {
		try {
			const processor = await getRandom(
				env.WORKSPACE_FILE_PROCESSOR,
				workspaceFileProcessorPoolSize,
			);
			await processor.startAndWaitForPorts({
				cancellationOptions: { portReadyTimeoutMS: 60_000 },
			});
			return processor;
		} catch (error) {
			if (!isContainerProvisioningError(error)) {
				throw error;
			}

			lastError = error;

			if (attempt < provisioningRetryAttempts - 1) {
				await sleep(provisioningRetryBaseDelayMs * 2 ** attempt);
			}
		}
	}

	throw lastError;
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
	const processor = await acquireWorkspaceFileProcessor(env);

	const headers = new Headers({
		"content-type": input.contentType,
		"x-file-size": String(input.sizeBytes),
	});

	if (input.fileName) {
		headers.set("x-file-name", encodeURIComponent(input.fileName));
	}

	return processor.fetch(
		new Request(`http://workspace-file-processor${input.path}`, {
			body: input.body,
			duplex: "half",
			headers,
			method: "POST",
			signal: AbortSignal.timeout(processorRequestTimeoutMs[input.path]),
		} as RequestInit & { duplex: "half" }),
	);
}
