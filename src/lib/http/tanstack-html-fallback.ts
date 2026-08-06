type FetchApplication = (request: Request) => Response | Promise<Response>;

const htmlOnlyError = '{"error":"Only HTML requests are supported here"}';

function canRetryAsHtml(request: Request, response: Response) {
	return (
		(request.method === "GET" || request.method === "HEAD") &&
		response.status === 500 &&
		response.headers.get("content-type")?.includes("application/json")
	);
}

export async function fetchWithHtmlFallback(request: Request, fetchApplication: FetchApplication) {
	const response = await fetchApplication(request);

	if (!canRetryAsHtml(request, response)) {
		return response;
	}

	if ((await response.clone().text()) !== htmlOnlyError) {
		return response;
	}

	const headers = new Headers(request.headers);
	headers.set("Accept", "text/html");

	return await fetchApplication(new Request(request, { headers }));
}
