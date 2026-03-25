import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import {
  isValidDocumentConversionRequest,
  requestDocumentPdfConversion,
} from "@/lib/uploads/document-conversion";

/**
 * Proxies document-to-PDF conversion to the FastAPI backend.
 * Payload: { file_path: "uploads/...", file_url: publicUrl } — no ?download=, no bucket in path.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { file_path, file_url } = body as { file_path?: string; file_url?: string };

    if (!file_path || typeof file_path !== "string") {
      return NextResponse.json(
        { error: "file_path is required" },
        { status: 400 }
      );
    }

    if (!file_url || typeof file_url !== "string") {
      return NextResponse.json(
        { error: "file_url is required" },
        { status: 400 }
      );
    }

    // SSRF: only our public file URLs (same origin or Supabase bucket) with a strict path shape
    if (!isValidDocumentConversionRequest(file_path, file_url, request.nextUrl.origin)) {
      return NextResponse.json(
        { error: "Invalid conversion source" },
        { status: 400 }
      );
    }

    const result = await requestDocumentPdfConversion(file_path, file_url);

    return NextResponse.json({
      pdf_url: result.pdfUrl,
      pdf_path: result.pdfPath,
    });
  } catch (err) {
    console.error("[convert-to-pdf] Error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Conversion failed",
      },
      { status: 500 }
    );
  }
}
