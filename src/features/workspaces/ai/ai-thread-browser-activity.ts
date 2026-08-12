import { asRecord } from "#/lib/record";

export type AIThreadBrowserActivityStatus = "completed" | "failed" | "running";

interface AIThreadBrowserActivityCall {
	args: unknown;
	method: string;
	result?: unknown;
}

interface AIThreadBrowserDestination {
	site: string;
	title?: string;
	url: string;
}

/**
 * Turns low-level CDP traffic into one user-facing destination summary.
 *
 * Only explicit navigations count. Protocol setup such as `attachToTarget`
 * carries no useful destination, and successful traffic without a destination
 * is omitted instead of rendering a generic "Browsed web" row.
 */
export function summarizeAIThreadBrowserActivity(
	calls: readonly AIThreadBrowserActivityCall[],
	status: AIThreadBrowserActivityStatus,
): string | undefined {
	const destinations = getBrowserDestinations(calls);
	const sites = unique(destinations.map((destination) => destination.site));

	if (status === "failed") {
		if (sites.length === 1) {
			return `Browser failed on ${sites[0]}`;
		}
		return sites.length > 1 ? `Browser failed across ${sites.length} sites` : "Browser failed";
	}

	if (sites.length === 0) {
		return undefined;
	}

	const verb = status === "running" ? "Browsing" : "Browsed";
	if (sites.length === 1) {
		const pageCount = unique(destinations.map((destination) => destination.url)).length;
		const pageTitles = unique(
			destinations
				.map((destination) => destination.title)
				.filter((title): title is string => Boolean(title)),
		);
		if (pageCount === 1 && pageTitles.length === 1 && pageTitles[0] !== sites[0]) {
			return `${verb} ${sites[0]} — ${pageTitles[0]}`;
		}
		return pageCount > 1 ? `${verb} ${pageCount} pages on ${sites[0]}` : `${verb} ${sites[0]}`;
	}
	if (sites.length === 2) {
		return `${verb} ${sites[0]} and ${sites[1]}`;
	}
	return `${verb} ${sites.length} sites`;
}

function getBrowserDestinations(calls: readonly AIThreadBrowserActivityCall[]) {
	const destinations = calls.flatMap((call) => {
		if (call.method !== "send") {
			return [];
		}

		const args = asRecord(call.args);
		const method = getString(args.method);
		if (method !== "Target.createTarget" && method !== "Page.navigate") {
			return [];
		}

		const url = getString(asRecord(args.params).url);
		const destination = url ? getBrowserDestination(url) : undefined;
		return destination ? [destination] : [];
	});

	if (unique(destinations.map((destination) => destination.url)).length === 1) {
		const title = getLastEvaluatedPageTitle(calls);
		if (title) {
			for (const destination of destinations) {
				destination.title ??= title;
			}
		}
	}

	return destinations;
}

function getLastEvaluatedPageTitle(calls: readonly AIThreadBrowserActivityCall[]) {
	for (let index = calls.length - 1; index >= 0; index -= 1) {
		const call = calls[index];
		const args = asRecord(call?.args);
		if (call?.method !== "send" || getString(args.method) !== "Runtime.evaluate") {
			continue;
		}

		const params = asRecord(args.params);
		const expression = getString(params.expression);
		if (!expression?.includes("document.title")) {
			continue;
		}

		const value = asRecord(asRecord(call.result).result).value;
		const title =
			typeof value === "string"
				? formatPageTitle(value)
				: formatPageTitle(getString(asRecord(value).title));
		if (title) {
			return title;
		}
	}
	return undefined;
}

function getBrowserDestination(value: string): AIThreadBrowserDestination | undefined {
	try {
		const url = new URL(value);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return undefined;
		}

		url.hash = "";
		const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
		return {
			site: formatBrowserSite(hostname),
			url: url.toString(),
		};
	} catch {
		return undefined;
	}
}

function formatPageTitle(value: string | undefined) {
	const title = value?.replace(/\s+/g, " ").trim();
	if (!title) {
		return undefined;
	}
	return title.length > 80 ? `${title.slice(0, 79).trimEnd()}…` : title;
}

function formatBrowserSite(hostname: string) {
	if (hostname === "instructure.com" || hostname.endsWith(".instructure.com")) {
		const tenant = hostname.slice(0, -".instructure.com".length).split(".").filter(Boolean).at(-1);
		return tenant && tenant !== "canvas" ? `${formatSiteWord(tenant)} Canvas` : "Canvas";
	}
	return hostname;
}

function formatSiteWord(value: string) {
	return value.length <= 5
		? value.toUpperCase()
		: `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function unique<T>(values: readonly T[]) {
	return [...new Set(values)];
}

function getString(value: unknown) {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
