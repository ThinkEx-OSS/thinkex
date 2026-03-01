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
      // Workflow persists to DB before returning; we prefer run.returnValue for immediate data.
      // If Vercel API returns invalid response (e.g. missing "key" field), fall back to empty result —
      // client invalidates workspace and refetches real data from DB.
      let result: { textContent: string; ocrPages: Array<{ index: number; markdown: string; [key: string]: unknown }> } = { textContent: "", ocrPages: [] };
      try {
        const r = (await run.returnValue) as typeof result;
        if (r?.textContent !== undefined) result.textContent = r.textContent ?? "";
        if (r?.ocrPages) result.ocrPages = r.ocrPages ?? [];
      } catch (_) {
        // Vercel Workflow API can throw "Invalid response from Vercel API, missing key field"
        // when polling for return value in production. Result is already persisted to workspace.
      }
      return NextResponse.json({
        status: "completed",
        result: { textContent: result.textContent, ocrPages: result.ocrPages },
      });
    }

    if (status === "failed") {
      let errorMessage = "OCR failed";
      try {
        await run.returnValue;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err ?? "OCR failed");
        // Vercel API can return "Invalid response from Vercel API, missing key field"
        // when fetching failure details; workflow already persisted failure to DB
        errorMessage = msg.includes("Vercel API") ? "OCR failed" : msg;
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
