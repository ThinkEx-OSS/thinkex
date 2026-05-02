import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";
import { audioTranscribeWorkflow } from "@/workflows/audio-transcribe";
import {
  requireAuth,
  verifyWorkspaceAccess,
  withErrorHandling,
} from "@/lib/api/workspace-helpers";
import {
  getUnsupportedLocalStorageMessage,
  usesLocalStorage,
} from "@/lib/self-host-config";
import { isAllowedAssetUrl } from "@/lib/tasks/validate-asset-url";

export const dynamic = "force-dynamic";

/**
 * POST /api/audio/process
 * Receives an audio file URL, runs a durable workflow to transcribe it with
 * AssemblyAI, and returns a workflow run ID for polling.
 */
async function handlePOST(req: NextRequest) {
  const userId = await requireAuth();

  if (usesLocalStorage()) {
    return NextResponse.json(
      {
        error: getUnsupportedLocalStorageMessage("Audio transcription"),
      },
      { status: 400 },
    );
  }

  if (!process.env.ASSEMBLYAI_API_KEY) {
    return NextResponse.json(
      { error: "ASSEMBLYAI_API_KEY is not set" },
      { status: 500 },
    );
  }

  const body = await req.json();
  const { fileUrl, filename, mimeType, itemId, workspaceId } = body;

  if (!fileUrl || typeof fileUrl !== "string") {
    return NextResponse.json(
      { error: "fileUrl is required" },
      { status: 400 },
    );
  }

  if (!itemId || typeof itemId !== "string") {
    return NextResponse.json(
      { error: "itemId is required for polling" },
      { status: 400 },
    );
  }

  if (!workspaceId || typeof workspaceId !== "string") {
    return NextResponse.json(
      { error: "workspaceId is required" },
      { status: 400 },
    );
  }

  if (!isAllowedAssetUrl(fileUrl)) {
    return NextResponse.json(
      {
        error:
          "Audio transcription only accepts provider-reachable storage URLs configured for this deployment.",
      },
      { status: 400 },
    );
  }

  await verifyWorkspaceAccess(workspaceId, userId, "editor");

  const audioMimeType = mimeType || guessMimeType(filename || fileUrl);

  const run = await start(audioTranscribeWorkflow, [
    fileUrl,
    audioMimeType,
    workspaceId,
    itemId,
    userId,
  ]);

  return NextResponse.json({
    runId: run.runId,
    itemId,
  });
}

export const POST = withErrorHandling(
  handlePOST,
  "POST /api/audio/process",
);

function guessMimeType(filenameOrUrl: string): string {
  const lower = filenameOrUrl.toLowerCase();
  if (lower.endsWith(".mp3")) return "audio/mp3";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  if (lower.endsWith(".aac")) return "audio/aac";
  if (lower.endsWith(".flac")) return "audio/flac";
  if (lower.endsWith(".aiff")) return "audio/aiff";
  if (lower.endsWith(".webm")) return "audio/webm";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  return "audio/mp3";
}
