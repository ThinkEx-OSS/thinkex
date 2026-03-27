import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getRun } from "workflow/api";
import { auth } from "@/lib/auth";
import { withServerObservability } from "@/lib/with-server-observability";

export const dynamic = "force-dynamic";

export const GET = withServerObservability(async function GET(req: NextRequest) {
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
    if (!(await run.exists)) {
      return NextResponse.json(
        { status: "not_found", error: "Run not found or expired" },
        { status: 404 }
      );
    }
    const status = await run.status;

    if (status === "completed") {
      return NextResponse.json({ status: "completed" });
    }

    if (status === "failed" || status === "cancelled") {
      let errorMessage = "OCR failed";
      if (status === "cancelled") {
        errorMessage = "OCR cancelled";
      } else {
        try {
          await run.returnValue;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error ?? "OCR failed");
          errorMessage = message.includes("Vercel API") ? "OCR failed" : message;
        }
      }

      return NextResponse.json({
        status,
        error: errorMessage,
      });
    }

    return NextResponse.json({ status });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to get OCR status",
      },
      { status: 500 }
    );
  }
}, { routeName: "GET /api/ocr/status" });
