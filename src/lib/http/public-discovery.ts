const serviceDocumentationLink = '<https://docs.thinkex.app/guides/mcp>; rel="service-doc"';

export function addPublicDiscoveryHeaders(headers: Headers, request: Request) {
	if (new URL(request.url).pathname === "/") {
		headers.append("Link", serviceDocumentationLink);
	}
}
