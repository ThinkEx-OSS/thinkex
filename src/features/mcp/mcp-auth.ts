import { verifyJwsAccessToken } from "better-auth/oauth2";

type VerifyAccessTokenOptions = Parameters<typeof verifyJwsAccessToken>[1];
type JwksProvider = Exclude<VerifyAccessTokenOptions["jwksFetch"], string>;
export type McpAccessTokenPayload = Awaited<ReturnType<typeof verifyJwsAccessToken>>;

const jwksCacheKey = {};

export async function authenticateMcpRequest(input: {
	getJwks: JwksProvider;
	handle: (request: Request, payload: McpAccessTokenPayload) => Promise<Response>;
	issuer: string;
	request: Request;
	resource: string;
}) {
	const token = readBearerToken(input.request.headers.get("Authorization"));
	if (!token) {
		return unauthorized(input.resource, "Missing bearer token.");
	}

	let payload: McpAccessTokenPayload;
	let jwksError: unknown;
	try {
		payload = await verifyJwsAccessToken(token, {
			jwksCacheKey,
			jwksFetch: async () => {
				try {
					return await input.getJwks();
				} catch (error) {
					jwksError = error;
					throw error;
				}
			},
			verifyOptions: {
				audience: input.resource,
				issuer: input.issuer,
			},
		});
	} catch {
		if (jwksError) {
			throw new Error("Unable to load the MCP token verification keys.", {
				cause: jwksError,
			});
		}

		return unauthorized(input.resource, "Invalid bearer token.");
	}

	return input.handle(input.request, payload);
}

function readBearerToken(authorization: string | null) {
	const match = authorization?.match(/^Bearer\s+(.+)$/i);
	return match?.[1]?.trim() || null;
}

function unauthorized(resource: string, message: string) {
	const resourceUrl = new URL(resource);
	const metadataUrl = new URL(
		`/.well-known/oauth-protected-resource${resourceUrl.pathname}`,
		resourceUrl,
	);

	return new Response(message, {
		status: 401,
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"WWW-Authenticate": `Bearer resource_metadata="${metadataUrl}"`,
		},
	});
}
