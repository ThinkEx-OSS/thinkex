import { execSync } from "node:child_process";

import type posthogPlugin from "@posthog/rollup-plugin";

const REQUIRED_POSTHOG_BUILD_ENV = [
	"VITE_POSTHOG_PROJECT_TOKEN",
	"VITE_POSTHOG_HOST",
	"POSTHOG_API_KEY",
	"POSTHOG_PROJECT_ID",
] as const;

const REQUIRED_PRODUCTION_POSTHOG_BUILD_ENV = [
	...REQUIRED_POSTHOG_BUILD_ENV,
	"VITE_POSTHOG_FEEDBACK_SURVEY_ID",
] as const;

export function assertRequiredPostHogBuildEnv(command: string) {
	const cloudflareEnv = process.env.CLOUDFLARE_ENV?.trim();

	if (command !== "build" || (cloudflareEnv !== "staging" && cloudflareEnv !== "production")) {
		return;
	}

	const requiredEnv =
		cloudflareEnv === "production"
			? REQUIRED_PRODUCTION_POSTHOG_BUILD_ENV
			: REQUIRED_POSTHOG_BUILD_ENV;

	const missing = requiredEnv.filter((name) => {
		const value = process.env[name];
		return typeof value !== "string" || value.trim().length === 0;
	});

	if (missing.length > 0) {
		throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
	}
}

function resolvePostHogReleaseVersion() {
	const explicitReleaseVersion = process.env.POSTHOG_RELEASE_VERSION?.trim();

	if (explicitReleaseVersion) {
		return explicitReleaseVersion;
	}

	const githubSha = process.env.GITHUB_SHA?.trim();

	if (githubSha) {
		return githubSha;
	}

	try {
		return execSync("git rev-parse HEAD", {
			stdio: ["ignore", "pipe", "ignore"],
		})
			.toString()
			.trim();
	} catch {
		return undefined;
	}
}

export function createPostHogBuildPlugin(plugin: typeof posthogPlugin) {
	const personalApiKey = process.env.POSTHOG_API_KEY?.trim();
	const projectId = process.env.POSTHOG_PROJECT_ID?.trim();

	if (!personalApiKey || !projectId) {
		return null;
	}

	const releaseName = process.env.POSTHOG_RELEASE_NAME?.trim() || "thinkex-web";

	return plugin({
		personalApiKey,
		projectId,
		sourcemaps: {
			enabled: true,
			releaseName,
			releaseVersion: resolvePostHogReleaseVersion(),
			deleteAfterUpload: true,
		},
	});
}
