export interface OAuthConsentRecord {
	id: string;
	clientId: string;
	userId: string;
	scopes: string[];
	createdAt: string;
	updatedAt: string;
}

export interface OAuthClientRecord {
	client_id: string;
	client_name?: string;
	logo_uri?: string;
	client_uri?: string;
}

interface OAuthConsentResponse {
	redirect: boolean;
	url: string;
}

const signedQueryParameterNameParam = "ba_param";

function getSignedOAuthQueryParameterNames(params: URLSearchParams): Set<string> | undefined {
	const signedParameterNames = params.getAll(signedQueryParameterNameParam);

	if (signedParameterNames.length === 0) {
		return undefined;
	}

	return new Set(signedParameterNames);
}

function buildSignedOAuthQuery(search: string): string | undefined {
	const params = new URLSearchParams(search);

	if (!params.has("sig")) {
		return undefined;
	}

	const signedParameterNames = getSignedOAuthQueryParameterNames(params);

	if (!signedParameterNames) {
		return undefined;
	}

	const signedParams = new URLSearchParams();

	for (const [key, value] of params.entries()) {
		if (key === "sig" || key === signedQueryParameterNameParam || signedParameterNames.has(key)) {
			signedParams.append(key, value);
		}
	}

	return signedParams.toString();
}

async function readAuthJson<T>(response: Response): Promise<T> {
	const rawBody = await response.text();

	let payload: (T & { message?: string }) | undefined;

	if (rawBody) {
		try {
			payload = JSON.parse(rawBody) as T & { message?: string };
		} catch {
			payload = undefined;
		}
	}

	if (!response.ok) {
		throw new Error(
			payload && typeof payload === "object" && "message" in payload && payload.message
				? payload.message
				: "Request failed",
		);
	}

	return payload as T;
}

// These auth endpoints are same-origin and cookie-scoped, so we issue relative
// requests. `fetch` resolves them against the document base in the browser,
// avoiding a hard dependency on `window` (which keeps the helpers testable).
function buildAuthRequestPath(path: string, query?: Record<string, string>): string {
	if (!query) {
		return path;
	}

	const searchParams = new URLSearchParams(query);
	const queryString = searchParams.toString();

	return queryString ? `${path}?${queryString}` : path;
}

async function authGet<T>(path: string, query?: Record<string, string>): Promise<T> {
	const response = await fetch(buildAuthRequestPath(path, query), {
		credentials: "include",
	});

	return readAuthJson<T>(response);
}

async function authPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
	const response = await fetch(path, {
		method: "POST",
		credentials: "include",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});

	return readAuthJson<T>(response);
}

export async function getOAuthConsents(): Promise<OAuthConsentRecord[]> {
	return authGet<OAuthConsentRecord[]>("/api/auth/oauth2/get-consents");
}

export async function getOAuthClient(clientId: string): Promise<OAuthClientRecord> {
	return authGet<OAuthClientRecord>("/api/auth/oauth2/get-client", {
		client_id: clientId,
	});
}

export async function getOAuthClientPublic(clientId: string): Promise<OAuthClientRecord> {
	return authGet<OAuthClientRecord>("/api/auth/oauth2/public-client", {
		client_id: clientId,
	});
}

export async function submitOAuthConsent(input: {
	accept: boolean;
	scope?: string;
}): Promise<OAuthConsentResponse> {
	const oauthQuery =
		typeof window !== "undefined" ? buildSignedOAuthQuery(window.location.search) : undefined;

	return authPost<OAuthConsentResponse>("/api/auth/oauth2/consent", {
		accept: input.accept,
		scope: input.scope,
		...(oauthQuery ? { oauth_query: oauthQuery } : {}),
	});
}
