import { PdfiumNative } from "@embedpdf/engines/pdfium";
import { init } from "@embedpdf/pdfium";
import pdfiumWasmModule from "@embedpdf/pdfium/pdfium.wasm";

let pdfiumNativePromise: Promise<PdfiumNative> | null = null;

/**
 * Server-side PDFium init for Workers / Durable Objects.
 *
 * Cloudflare's Vite plugin imports `.wasm` as a precompiled `WebAssembly.Module`.
 * EmbedPDF's Emscripten glue accepts that via `instantiateWasm` — no fetch, no CDN,
 * no broken static ArrayBuffer imports under TanStack Start SSR.
 */
export async function getPdfiumNative() {
	if (!pdfiumNativePromise) {
		pdfiumNativePromise = (async () => {
			const pdfiumModule = await init({
				instantiateWasm: (
					imports: WebAssembly.Imports,
					receiveInstance: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void,
				) => {
					const instance = new WebAssembly.Instance(pdfiumWasmModule, imports);
					receiveInstance(instance, pdfiumWasmModule);
					return instance.exports;
				},
			});

			return new PdfiumNative(pdfiumModule, { fontFallback: null });
		})();
	}

	return pdfiumNativePromise;
}
