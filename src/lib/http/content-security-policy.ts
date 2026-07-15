interface ContentSecurityPolicyOptions {
	applicationOrigin?: string;
	isProduction: boolean;
	posthogHostOrigin?: string;
	posthogReportUrl?: string;
	r2AccountId?: string;
}

const cloudflareInsightsScriptOrigin = "https://static.cloudflareinsights.com";
const cloudflareInsightsConnectOrigin = "https://cloudflareinsights.com";
const cloudflareAccountIdPattern = /^[a-f\d]{32}$/i;

export function buildContentSecurityPolicy(options: ContentSecurityPolicyOptions) {
	const scriptSrc = [
		"'self'",
		"'unsafe-inline'",
		"'wasm-unsafe-eval'",
		cloudflareInsightsScriptOrigin,
	];
	const connectSrc = ["'self'", cloudflareInsightsConnectOrigin];
	const websocketOrigin = getWebSocketOrigin(options.applicationOrigin);

	if (websocketOrigin) {
		connectSrc.push(websocketOrigin);
	}

	if (options.posthogHostOrigin) {
		scriptSrc.push(options.posthogHostOrigin);
		connectSrc.push(options.posthogHostOrigin);
	}

	const r2Origin = getR2Origin(options.r2AccountId);

	if (r2Origin) {
		connectSrc.push(r2Origin);
	}

	if (!options.isProduction) {
		scriptSrc.push("'unsafe-eval'");
		connectSrc.push("ws:", "http://localhost:*", "http://127.0.0.1:*");
	}

	const directives = [
		"default-src 'self'",
		"base-uri 'self'",
		"object-src 'none'",
		"frame-ancestors 'none'",
		"frame-src 'none'",
		"form-action 'self'",
		"manifest-src 'self'",
		"img-src 'self' data: blob: https:",
		"font-src 'self' data:",
		"style-src 'self' 'unsafe-inline'",
		`script-src ${scriptSrc.join(" ")}`,
		`connect-src ${connectSrc.join(" ")}`,
		"media-src 'self' data: blob:",
		"worker-src 'self' blob:",
	];

	if (options.posthogReportUrl) {
		directives.push(`report-uri ${options.posthogReportUrl}`);
	}

	return directives.join("; ");
}

function getR2Origin(accountId: string | undefined) {
	const normalizedAccountId = accountId?.trim();

	if (!normalizedAccountId || !cloudflareAccountIdPattern.test(normalizedAccountId)) {
		return undefined;
	}

	return `https://${normalizedAccountId}.r2.cloudflarestorage.com`;
}

function getWebSocketOrigin(applicationOrigin: string | undefined) {
	if (!applicationOrigin) {
		return undefined;
	}

	try {
		const url = new URL(applicationOrigin);

		if (url.protocol !== "https:" && url.protocol !== "http:") {
			return undefined;
		}

		url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
		return url.origin;
	} catch {
		return undefined;
	}
}
