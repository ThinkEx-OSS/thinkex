import { PdfEngineProvider, usePdfiumEngine } from "@embedpdf/engines/react";
import type { ReactNode } from "react";

import pdfiumWasmUrl from "@embedpdf/pdfium/pdfium.wasm?url";
import { buildClientAbsoluteUrl } from "#/lib/client-url";

export function WorkspacePdfEngineProvider({ children }: { children: ReactNode }) {
	const wasmUrl =
		typeof window === "undefined" ? pdfiumWasmUrl : buildClientAbsoluteUrl(pdfiumWasmUrl);
	const engineState = usePdfiumEngine({
		fontFallback: null,
		wasmUrl,
	});

	return <PdfEngineProvider {...engineState}>{children}</PdfEngineProvider>;
}
