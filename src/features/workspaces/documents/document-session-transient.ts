// Cloudflare resets a Durable Object when a storage operation outlives its
// deadline, and surfaces that as an RPC error whose message ends with "caused
// object to be reset". The reset drops the in-flight turn, not the persisted
// state, so the same call succeeds on a fresh isolate. The sandbox runtime's
// `isPlatformTransientError` only matches the startup variant of this message,
// so the document-session RPC path needs its own classifier.
const durableObjectResetPattern = /caused object to be reset/i;
const maximumDocumentSessionRetries = 3;

export function isTransientDocumentSessionError(error: unknown): boolean {
	for (let current: unknown = error, depth = 0; current != null && depth < 8; depth += 1) {
		const message =
			current instanceof Error ? current.message : typeof current === "string" ? current : "";
		if (durableObjectResetPattern.test(message)) {
			return true;
		}
		current = typeof current === "object" ? (current as { cause?: unknown }).cause : undefined;
	}
	return false;
}

/**
 * Retry `run` when the document session Durable Object is reset mid-turn. The
 * caller must make `run` idempotent — document edits are, because the operation
 * id makes a repeated `applyEdits` return the first attempt's receipt.
 */
export async function retryOnTransientDocumentSessionReset<T>(run: () => Promise<T>): Promise<T> {
	let lastError: unknown;
	for (let attempt = 0; attempt < maximumDocumentSessionRetries; attempt += 1) {
		try {
			return await run();
		} catch (error) {
			if (!isTransientDocumentSessionError(error)) {
				throw error;
			}
			lastError = error;
		}
	}
	throw lastError;
}
