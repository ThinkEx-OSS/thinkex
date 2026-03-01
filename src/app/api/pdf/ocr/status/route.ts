import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getRun } from "workflow/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/pdf/ocr/status?runId=xxx
 * Poll workflow status. Returns { status, result? } when completed or { status, error? } when failed.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const runId = req.nextUrl.searchParams.get("runId");
    if (!runId) {
      return NextResponse.json(
        { error: "runId is required" },
        { status: 400 }
      );
    }

    const run = getRun(runId);
    if (!run) {
      return NextResponse.json(
        { status: "not_found", error: "Run not found or expired" },
        { status: 404 }
      );
    }
    const status = await run.status;

    if (status === "completed") {
      const result = (await run.returnValue) as {
        textContent: string;
        ocrPages: Array<{
          index: number;
          markdown: string;
          [key: string]: unknown;
        }>;
      };
      return NextResponse.json({
        status: "completed",
        result: {
          textContent: result.textContent ?? "",
          ocrPages: result.ocrPages ?? [],
        },
      });
    }

    if (status === "failed") {
      let errorMessage = "OCR failed";
      try {
        await run.returnValue;
      } catch (err) {
        errorMessage =
          err instanceof Error ? err.message : String(err ?? "OCR failed");
      }
      return NextResponse.json({
        status: "failed",
        error: errorMessage,
      });
    }

    return NextResponse.json({ status: "running" });
  } catch (error: unknown) {
    console.error("[PDF_OCR_STATUS] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to get status",
      },
      { status: 500 }
    );
  }
}
