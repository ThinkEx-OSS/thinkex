import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getRun } from "workflow/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/audio/process/status?runId=xxx
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
        { status: 400 },
      );
    }

    const run = getRun(runId);
    if (!(await run.exists)) {
      return NextResponse.json(
        { status: "not_found", error: "Run not found or expired" },
        { status: 404 },
      );
    }
    const status = await run.status;

    if (status === "completed") {
      let result: {
        summary?: string;
        segments: Array<{ speaker: string; timestamp: string; content: string }>;
        duration?: number;
      } = { segments: [] };
      try {
        const r = (await run.returnValue) as typeof result;
        if (r?.summary) result.summary = r.summary;
        if (r?.segments) result.segments = r.segments ?? [];
        if (typeof r?.duration === "number") result.duration = r.duration;
      } catch (_) {
        // Vercel Workflow API can throw when polling returnValue in production;
        // fall through so the client gets an empty result and refetches from DB.
      }
      return NextResponse.json({
        status: "completed",
        result: {
          ...(result.summary ? { summary: result.summary } : {}),
          segments: result.segments,
          duration: result.duration,
        },
      });
    }

    if (status === "failed" || status === "cancelled") {
      let errorMessage = "Processing failed";
      if (status === "cancelled") {
        errorMessage = "Processing cancelled";
      } else {
        try {
          await run.returnValue;
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : String(err ?? "Processing failed");
          errorMessage = msg.includes("Vercel API") ? "Processing failed" : msg;
        }
      }
      return NextResponse.json({
        status,
        error: errorMessage,
      });
    }

    return NextResponse.json({ status });
  } catch (error: unknown) {
    console.error("[AUDIO_PROCESS_STATUS] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to get status",
      },
      { status: 500 },
    );
  }
}
