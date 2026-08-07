import { describe, expect, it } from "vitest";

import { createStreamingMultipartFile } from "#/lib/http/streaming-multipart";

function createMultipart(body: ReadableStream<Uint8Array>) {
	return createStreamingMultipartFile({
		body,
		contentType: "application/pdf",
		fileName: "source.pdf",
		formFieldName: "file",
		sizeBytes: 1024,
	});
}

describe("createStreamingMultipartFile", () => {
	it("resolves from the response when the body pump never finishes", async () => {
		// Nothing ever drains multipart.body, so the pump parks forever — the shape of a
		// server that answers with a 4xx before it has read the upload. Awaiting the pump
		// alongside the response here used to hang until the workflow step timed out.
		const multipart = createMultipart(
			new ReadableStream({
				pull: () => new Promise<never>(() => {}),
			}),
		);

		await expect(multipart.awaitResponse(Promise.resolve("quota exceeded"))).resolves.toBe(
			"quota exceeded",
		);
	});

	it("surfaces a body pump failure even when the response never settles", async () => {
		const multipart = createMultipart(
			new ReadableStream({
				pull: (controller) => controller.error(new Error("source stream failed")),
			}),
		);

		await expect(multipart.awaitResponse(new Promise<never>(() => {}))).rejects.toThrow(
			"source stream failed",
		);
	});
});
