/**
 * Cloudflare can evict or reset a Durable Object mid-query — a transient
 * platform event. When it happens `ctx.storage.sql.exec` throws
 * "Internal error in Durable Object storage caused object to be reset", which
 * the `agents` runtime rewraps as a `SqlError` ("SQL query failed: …"). These
 * resets are not query defects, so we recognise them and retry rather than let
 * them surface as unhandled failures in error tracking.
 *
 * `@cloudflare/sandbox`'s `isPlatformTransientError` covers the neighbouring
 * cases (superseded isolates, lost connections, the *startup* storage reset),
 * but not this mid-query reset variant — and importing it here would pull the
 * worker-only sandbox runtime into unrelated code. So we match the transient
 * signatures we care about directly.
 */
const TRANSIENT_STORAGE_PATTERNS = [
	// Durable Object evicted/reset mid-query, including the startup variant.
	/caused object to be reset/i,
	// Isolate superseded by a code update.
	/reset because its code was updated/i,
	/this script has been upgraded/i,
	// Storage connection dropped underneath the query.
	/network connection lost/i,
];

const KERNEL_SQL_MAX_ATTEMPTS = 3;

export function isTransientStorageError(error: unknown): boolean {
	for (const candidate of errorAndCauses(error)) {
		if (!(candidate instanceof Error)) {
			continue;
		}

		if (TRANSIENT_STORAGE_PATTERNS.some((pattern) => pattern.test(candidate.message))) {
			return true;
		}
	}

	return false;
}

/**
 * Runs a Durable Object SQL operation, retrying a bounded number of times when
 * it fails with a transient storage reset. Storage ops are cheap and the reset
 * is momentary, so an immediate retry usually succeeds. Non-transient errors
 * (real query defects) are rethrown on the first attempt.
 */
export function runKernelSqlWithRetry<T>(run: () => T): T {
	let lastError: unknown;

	for (let attempt = 1; attempt <= KERNEL_SQL_MAX_ATTEMPTS; attempt += 1) {
		try {
			return run();
		} catch (error) {
			if (!isTransientStorageError(error)) {
				throw error;
			}

			lastError = error;
		}
	}

	throw lastError;
}

function* errorAndCauses(error: unknown): Iterable<unknown> {
	const seen = new Set<unknown>();
	let current: unknown = error;

	while (current && !seen.has(current)) {
		seen.add(current);
		yield current;
		current = current instanceof Error ? current.cause : undefined;
	}
}
