const BLOCKED_HOSTNAMES = new Set(["localhost"]);
const BLOCKED_HOSTNAME_SUFFIXES = [".localhost", ".local", ".internal"];

export function assertPublicHttpUrl(input: string) {
	const url = new URL(input);

	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error("Only http: and https: URLs are supported.");
	}

	if (url.username || url.password) {
		throw new Error("URLs with embedded credentials are not allowed.");
	}

	const hostname = normalizeHostname(url.hostname);

	if (
		isSingleLabelHostname(hostname) ||
		isBlockedHostname(hostname) ||
		isIpLiteralHostname(hostname)
	) {
		throw new Error("Only public domain-name URLs are supported.");
	}

	url.hash = "";
	return url;
}

function normalizeHostname(hostname: string) {
	return hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "").replace(/\.$/, "");
}

function isSingleLabelHostname(hostname: string) {
	return !hostname.includes(".");
}

function isBlockedHostname(hostname: string) {
	return (
		BLOCKED_HOSTNAMES.has(hostname) ||
		BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
	);
}

function isIpLiteralHostname(hostname: string) {
	return isIpv6Literal(hostname) || isIpv4Literal(hostname);
}

function isIpv6Literal(hostname: string) {
	return hostname.includes(":");
}

function isIpv4Literal(hostname: string) {
	const parts = hostname.split(".");

	if (parts.length === 4 && parts.every(isDecimalOctet)) {
		return true;
	}

	// Reject legacy numeric IPv4 forms such as 2130706433 or 0177.0.0.1.
	return /^[0-9.]+$/.test(hostname);
}

function isDecimalOctet(part: string) {
	if (!/^(0|[1-9][0-9]{0,2})$/.test(part)) {
		return false;
	}

	const octet = Number(part);
	return Number.isInteger(octet) && octet >= 0 && octet <= 255;
}
