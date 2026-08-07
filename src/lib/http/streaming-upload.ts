/**
 * Awaits a request whose body is still being pumped into it.
 *
 * An endpoint that answers before draining the body — a 4xx, a redirect, a quota
 * rejection — leaves the writer parked on backpressure that never clears, so awaiting
 * the pump alongside the response hangs until something further up times out. The
 * response decides when the upload is over.
 *
 * While the request is still consuming the body, a pump failure surfaces by breaking
 * the body and failing the request. Once the response has settled, the rest of the
 * pump is abandoned unobserved — safe here because a settled response means the
 * server already decided without the remaining bytes, and retries build fresh
 * streams rather than reusing this one.
 */
export function awaitUploadResponse<T>(response: Promise<T>, body: Promise<unknown>): Promise<T> {
	return Promise.race([response, body.then(() => response)]);
}
