import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { ocrPdfFromBuffer } from "@/lib/pdf/azure-ocr";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
const MAX_PDF_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

/**
 * POST /api/pdf/ocr
 * Receives a PDF file URL (Supabase or local), fetches it, runs Azure Mistral Document AI OCR,
 * returns extracted text and page data.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { fileUrl } = body;

    if (!fileUrl || typeof fileUrl !== "string") {
      return NextResponse.json(
        { error: "fileUrl is required" },
        { status: 400 }
      );
    }

    const t0 = Date.now();
    logger.info("[PDF_OCR] Route fired", {
      fileUrl: fileUrl.slice(0, 80) + (fileUrl.length > 80 ? "…" : ""),
      userId: session.user?.id,
    });

    // Validate URL origin to prevent SSRF
    const allowedHosts: string[] = [];
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      allowedHosts.push(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname);
    }
    if (process.env.NEXT_PUBLIC_APP_URL) {
      allowedHosts.push(new URL(process.env.NEXT_PUBLIC_APP_URL).hostname);
    }
    allowedHosts.push("localhost", "127.0.0.1");

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(fileUrl);
    } catch {
      return NextResponse.json({ error: "Invalid fileUrl" }, { status: 400 });
    }

    if (
      !allowedHosts.some(
        (host) =>
          parsedUrl.hostname === host || parsedUrl.hostname.endsWith(`.${host}`)
      )
    ) {
      return NextResponse.json(
        { error: "fileUrl origin is not allowed" },
        { status: 400 }
      );
    }

    const tFetch = Date.now();
    const res = await fetch(fileUrl);
    logger.info("[PDF_OCR] Fetched from storage", {
      ms: Date.now() - tFetch,
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch PDF: ${res.status} ${res.statusText}` },
        { status: 400 }
      );
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (
      !contentType.includes("application/pdf") &&
      !fileUrl.toLowerCase().includes(".pdf")
    ) {
      return NextResponse.json(
        { error: "URL does not point to a PDF file" },
        { status: 400 }
      );
    }

    const contentLength = res.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_PDF_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: `PDF exceeds ${MAX_PDF_SIZE_BYTES / (1024 * 1024)}MB limit`,
        },
        { status: 400 }
      );
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    logger.info("[PDF_OCR] PDF buffered", {
      sizeBytes: buffer.length,
      sizeMB: (buffer.length / (1024 * 1024)).toFixed(2),
      fetchMs: Date.now() - tFetch,
    });

    if (buffer.length > MAX_PDF_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: `PDF exceeds ${MAX_PDF_SIZE_BYTES / (1024 * 1024)}MB limit`,
        },
        { status: 400 }
      );
    }

    const tOcr = Date.now();
    const result = await ocrPdfFromBuffer(buffer);
    const ocrMs = Date.now() - tOcr;
    const totalMs = Date.now() - t0;

    logger.info("[PDF_OCR] OCR complete", {
      pageCount: result.pages.length,
      textContentLength: result.textContent.length,
      ocrMs,
      totalMs,
    });

    return NextResponse.json({
      textContent: result.textContent,
      ocrPages: result.pages,
    });
  } catch (error: unknown) {
    logger.error("[PDF_OCR] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "OCR processing failed",
      },
      { status: 500 }
    );
  }
}
