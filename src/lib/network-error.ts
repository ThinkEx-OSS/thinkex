// Browsers reject fetch with a bare TypeError when a request gets no response,
// including requests cancelled by a page unload. Messages vary by engine.
const networkErrorMessages = new Set([
	"Failed to fetch",
	"NetworkError when attempting to fetch resource.",
	"Load failed",
	"Network request failed",
]);

export function isNetworkError(error: unknown) {
	return error instanceof TypeError && networkErrorMessages.has(error.message);
}
