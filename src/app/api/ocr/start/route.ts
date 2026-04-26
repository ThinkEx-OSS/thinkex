import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { start } from "workflow/api";
import { auth } from "@/lib/auth";
import { verifyWorkspaceAccess } from "@/lib/api/workspace-helpers";
import { withServerObservability } from "@/lib/with-server-observability";
import { filterOcrCandidates } from "@/lib/ocr/dispatch";
import { isAllowedOcrFileUrl } from "@/lib/ocr/url-validation";
import {
  getUnsupportedLocalStorageMessage,
  usesLocalStorage,
} from "@/lib/self-host-config";
import { ocrDispatchWorkflow } from "@/workflows/ocr-dispatch";
import type { OcrCandidate } from "@/lib/ocr/types";

export const dynamic = "force-dynamic";

export const POST = withServerObservability(async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
    const candidates = filterOcrCandidates(
      Array.isArray(body.candidates) ? (body.candidates as OcrCandidate[]) : []
    );

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    if (candidates.length === 0) {
      return NextResponse.json(
        { error: "At least one OCR candidate is required" },
        { status: 400 }
      );
    }

    if (usesLocalStorage()) {
      return NextResponse.json(
        { error: getUnsupportedLocalStorageMessage("OCR") },
        { status: 400 },
      );
    }

    const invalidCandidate = candidates.find(
      (candidate) => !isAllowedOcrFileUrl(candidate.fileUrl)
    );
    if (invalidCandidate) {
      return NextResponse.json(
        {
          error:
            "OCR only accepts provider-reachable storage URLs configured for this deployment.",
        },
        { status: 400 }
      );
    }

    await verifyWorkspaceAccess(workspaceId, session.user.id, "editor");

    const run = await start(ocrDispatchWorkflow, [
      candidates,
      workspaceId,
      session.user.id,
    ]);

    return NextResponse.json({
      runId: run.runId,
      itemIds: candidates.map((candidate) => candidate.itemId),
    });
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to start OCR",
      },
      { status: 500 }
    );
  }
}, { routeName: "POST /api/ocr/start" });
