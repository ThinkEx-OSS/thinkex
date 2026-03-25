import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { ocrPdfFromUrl } from "@/lib/pdf/mistral-ocr";
import { logger } from "@/lib/utils/logger";
import { withServerObservability } from "@/lib/with-server-observability";
import { isAllowedOcrFileUrl } from "@/lib/ocr/url-validation";

export const dynamic = "force-dynamic";

/**
 * POST /api/pdf/ocr
 * Receives a PDF file URL (typically Supabase public URL) and sends it directly to Mistral OCR,
 * returns structured OCR page data.
 */
export const POST = withServerObservability(async function POST(req: NextRequest) {
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

    if (!isAllowedOcrFileUrl(fileUrl)) {
      return NextResponse.json({ error: "Invalid fileUrl" }, { status: 400 });
    }

    let pathname: string;
    try {
      pathname = new URL(fileUrl).pathname;
    } catch {
      return NextResponse.json(
        { error: "Invalid URL" },
        { status: 400 }
      );
    }

    if (!pathname.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { error: "URL does not point to a PDF file" },
        { status: 400 }
      );
    }

    const result = await ocrPdfFromUrl(fileUrl);
    const totalMs = Date.now() - t0;

    logger.info("[PDF_OCR] Complete", {
      pageCount: result.pages.length,
      totalMs,
    });

    return NextResponse.json({
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
}, { routeName: "POST /api/pdf/ocr" });
