/**
 * WorkspaceKernel runs inside a Cloudflare Durable Object whose isolate has a
 * ~128MB memory ceiling. File ingest and read fully materialize the file body in
 * that isolate — `@cloudflare/shell` only exposes whole-buffer `readFileBytes` /
 * `writeFileBytes`, so there is no streaming path to fall back on. A single large
 * file can therefore blow the memory limit, or hold the SQL storage output gate
 * past its timeout, and reset the Durable Object mid-operation.
 *
 * These caps bound the in-memory path well under the isolate budget so an oversized
 * file fails cleanly (a handled error) instead of resetting the object. They are
 * intentionally lower than the product-level upload limit (`maxBytesPerSelection`):
 * files above these thresholds already fail today, just catastrophically.
 */

/**
 * Largest file the kernel will materialize in the DO isolate (upload ingest and
 * content reads). Kept well under the ~128MB isolate ceiling to leave headroom for
 * the storage write copy and RPC framing.
 */
export const WORKSPACE_KERNEL_MAX_IN_MEMORY_BYTES = 64 * 1024 * 1024;

/**
 * Preview generation (pdfium / photon-wasm) decodes the source into raw RGBA and
 * allocates several multiples of the file size on the wasm heap, so it is capped
 * more tightly than the content path. Files above this simply skip the
 * best-effort preview rather than risking the isolate.
 */
export const WORKSPACE_KERNEL_MAX_PREVIEW_SOURCE_BYTES = 16 * 1024 * 1024;

export function formatWorkspaceKernelByteLimit(bytes: number) {
	return `${Math.floor(bytes / (1024 * 1024))} MB`;
}
