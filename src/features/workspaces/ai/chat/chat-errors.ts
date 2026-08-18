// Typed request errors for the chat surface (OpenCode's tagged-error pattern:
// domain code throws, the transport edge owns the one place errors become
// Responses). `userMessage` is safe to show; internals stay in logs.
export class ChatRequestError extends Error {
	constructor(
		readonly status: number,
		readonly userMessage: string,
	) {
		super(userMessage);
		this.name = "ChatRequestError";
	}
}

export function chatErrorResponse(error: unknown): Response | null {
	if (error instanceof ChatRequestError) {
		// The status rides in the body too. The AI SDK's transport turns a non-2xx
		// into `new Error(await response.text())`, so the code is gone by the time
		// useChat sees it — and a usage limit has to be tellable from a crash.
		return Response.json(
			{ error: error.userMessage, status: error.status },
			{ status: error.status },
		);
	}

	return null;
}
