const mcpCorsRequestHeaders = "authorization, content-type, mcp-protocol-version, mcp-session-id";
const mcpCorsResponseHeaders = "mcp-session-id, www-authenticate";

export function isMcpOAuthPath(pathname: string) {
	return pathname === `${mcpAuthPath}/jwks` || pathname.startsWith(`${mcpAuthPath}/oauth2/`);
}

export function withMcpCors(response: Response) {
	const headers = new Headers(response.headers);
	headers.set("Access-Control-Allow-Origin", "*");
	headers.set("Access-Control-Expose-Headers", mcpCorsResponseHeaders);

	return new Response(response.body, {
		headers,
		status: response.status,
		statusText: response.statusText,
	});
}

export function mcpCorsPreflightResponse() {
	return new Response(null, {
		status: 204,
		headers: {
			"Access-Control-Allow-Headers": mcpCorsRequestHeaders,
			"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Max-Age": "86400",
		},
	});
}
import { mcpAuthPath } from "#/features/mcp/mcp-config";
