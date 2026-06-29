import { env as workerEnv } from "cloudflare:workers";

import { buildInvitePath } from "#/lib/client-url";

const LOCAL_TRUSTED_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"] as const;

const isProduction = import.meta.env.PROD;

type AuthBaseURL =
	| string
	| {
			allowedHosts: string[];
			protocol: "http" | "https" | "auto";
			fallback?: string;
	  };

export function normalizeAppOrigin(value: string, envName: string) {
	try {
		const url = new URL(value);

		if (url.protocol !== "http:" && url.protocol !== "https:") {
			throw new Error("App URLs must use http or https.");
		}

		return url.origin;
	} catch (error) {
		throw new Error(`${envName} must be a valid absolute http(s) URL.`, {
			cause: error,
		});
	}
}

export function getAppOrigin() {
	const configuredUrl = workerEnv.BETTER_AUTH_URL?.trim();

	if (configuredUrl) {
		const origin = normalizeAppOrigin(configuredUrl, "BETTER_AUTH_URL");

		if (isProduction && !origin.startsWith("https://")) {
			throw new Error("BETTER_AUTH_URL must use https in production.");
		}

		return origin;
	}

	if (isProduction) {
		throw new Error("BETTER_AUTH_URL must be configured in production.");
	}

	throw new Error("BETTER_AUTH_URL is not configured.");
}

function getOptionalEnvString(name: string) {
	const env = workerEnv as unknown as Record<string, string | undefined>;
	return env[name]?.trim() || undefined;
}

function parseCommaList(value: string | undefined) {
	return (
		value
			?.split(",")
			.map((item) => item.trim())
			.filter(Boolean) ?? []
	);
}

export function getAuthBaseURL(): AuthBaseURL {
	const configuredUrl = workerEnv.BETTER_AUTH_URL?.trim();
	const allowedHosts = parseCommaList(getOptionalEnvString("BETTER_AUTH_ALLOWED_HOSTS"));

	if (isProduction) {
		return getAppOrigin();
	}

	if (allowedHosts.length > 0) {
		return {
			allowedHosts,
			protocol: "auto",
			fallback: configuredUrl ? normalizeAppOrigin(configuredUrl, "BETTER_AUTH_URL") : undefined,
		};
	}

	return getAppOrigin();
}

export function getTrustedAppOrigins(appOrigin?: string) {
	const localOrigins = isProduction ? [] : LOCAL_TRUSTED_ORIGINS;
	return Array.from(new Set([...(appOrigin ? [appOrigin] : []), ...localOrigins]));
}

export function buildInviteUrl(token: string, appOrigin = getAppOrigin()) {
	return `${appOrigin}${buildInvitePath(token)}`;
}
