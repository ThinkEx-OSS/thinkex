import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { ocrPdfFromUrl } from "@/lib/pdf/mistral-ocr";
import { logger } from "@/lib/utils/logger";
import { withServerObservability } from "@/lib/with-server-observability";

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

    if (!fileUrl.toLowerCase().includes(".pdf")) {
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
