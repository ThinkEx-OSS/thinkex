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
        { status: 400 }
      );
    }

    const run = getRun(runId);
    const status = await run.status;

    if (status === "completed") {
      const result = (await run.returnValue) as {
        summary: string;
        segments: Array<{ speaker: string; timestamp: string; content: string }>;
        duration?: number;
      };
      return NextResponse.json({
        status: "completed",
        result: {
          summary: result.summary,
          segments: result.segments,
          duration: result.duration,
        },
      });
    }

    if (status === "failed") {
      let errorMessage = "Processing failed";
      try {
        await run.returnValue;
      } catch (err) {
        errorMessage =
          err instanceof Error ? err.message : String(err ?? "Processing failed");
      }
      return NextResponse.json({
        status: "failed",
        error: errorMessage,
      });
    }

    return NextResponse.json({ status: "running" });
  } catch (error: unknown) {
    console.error("[AUDIO_PROCESS_STATUS] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to get status",
      },
      { status: 500 }
    );
  }
}
