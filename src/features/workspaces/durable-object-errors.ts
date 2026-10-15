/**
 * Cloudflare marks some Durable Object failures as safe to retry. A storage
 * reset can arrive without `retryable`, so it is matched on its own flag or
 * message. Overloaded objects are never retried: a retry adds to the load.
 */
export function isTransientDurableObjectError(error: unknown) {
	if (typeof error !== "object" || error === null) {
		return false;
	}
	const record = error as Record<string, unknown>;
	if (record.overloaded === true) {
		return false;
	}
	return (
		record.retryable === true ||
		record.durableObjectReset === true ||
		(typeof record.message === "string" && record.message.includes("caused object to be reset"))
	);
}
