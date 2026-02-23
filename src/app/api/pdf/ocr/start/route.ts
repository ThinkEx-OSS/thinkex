import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { start } from "workflow/api";
import { pdfOcrWorkflow } from "@/workflows/pdf-ocr";

export const dynamic = "force-dynamic";

/**
 * POST /api/pdf/ocr/start
 * Validates URL, starts durable PDF OCR workflow, returns runId and itemId for polling.
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
    const { fileUrl, itemId } = body;

    if (!fileUrl || typeof fileUrl !== "string") {
      return NextResponse.json(
        { error: "fileUrl is required" },
        { status: 400 }
      );
    }

    if (!itemId || typeof itemId !== "string") {
      return NextResponse.json(
        { error: "itemId is required for polling" },
        { status: 400 }
      );
    }

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

    // Start durable workflow; return immediately for client to poll
    const run = await start(pdfOcrWorkflow, [fileUrl]);

    return NextResponse.json({
      runId: run.runId,
      itemId,
    });
  } catch (error: unknown) {
    console.error("[PDF_OCR_START] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to start PDF OCR",
      },
      { status: 500 }
    );
  }
}
