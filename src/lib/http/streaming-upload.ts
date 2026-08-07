/**
 * Awaits a request whose body is still being pumped into it.
 *
 * An endpoint that answers before draining the body — a 4xx, a redirect, a quota
 * rejection — leaves the writer parked on backpressure that never clears, so awaiting
 * the pump alongside the response hangs until something further up times out. The
 * response decides when the upload is over; a pump failure still surfaces, because it
 * breaks the body and fails the request.
 */
export function awaitUploadResponse<T>(response: Promise<T>, body: Promise<unknown>): Promise<T> {
	return Promise.race([response, body.then(() => response)]);
}
