import { apiErrorSchema } from "#/lib/api/contracts";

function respond(body: unknown, status: number, requestId: string) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"x-request-id": requestId,
		},
	});
}

export function getRequestId(request: Request) {
	return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export function apiJson(body: unknown, requestId: string, status = 200) {
	return respond(body, status, requestId);
}

export function apiError(
	requestId: string,
	status: number,
	code: string,
	message: string,
	details?: unknown,
) {
	const payload = apiErrorSchema.parse({
		requestId,
		code,
		message,
		details,
	});

	console.error("[api]", payload);

	return respond(payload, status, requestId);
}
