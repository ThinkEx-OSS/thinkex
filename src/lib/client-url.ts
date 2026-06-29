export function buildInvitePath(token: string) {
	return `/invite/${token}`;
}

export function getClientOrigin() {
	if (typeof window === "undefined") {
		return "";
	}

	return window.location.origin;
}

export function buildClientAbsoluteUrl(path: string, origin = getClientOrigin()) {
	if (!origin) {
		return path;
	}

	return new URL(path, origin).href;
}
