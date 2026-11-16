import { isRecord } from "#/lib/record";

/**
 * Cloudflare marks some Durable Object failures as safe to retry. A storage
 * reset or a memory-limit reset can arrive without `retryable`, so they are
 * matched on their own flag or message. Overloaded objects are never retried:
 * a retry adds to the load.
 */
export function isTransientDurableObjectError(error: unknown) {
	if (!isRecord(error) || error.overloaded === true) {
		return false;
	}
	return (
		error.retryable === true ||
		error.durableObjectReset === true ||
		(typeof error.message === "string" &&
			(error.message.includes("caused object to be reset") ||
				error.message.includes("exceeded its memory limit and was reset")))
	);
}
