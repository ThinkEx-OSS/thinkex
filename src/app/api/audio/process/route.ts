import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { start } from "workflow/api";
import { audioTranscribeWorkflow } from "@/workflows/audio-transcribe";

export const dynamic = "force-dynamic";

/**
 * POST /api/audio/process
 * Receives an audio file URL, runs a durable workflow to download, upload to Gemini,
 * and transcribe. Returns structured transcript + summary.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return NextResponse.json(
        { error: "GOOGLE_GENERATIVE_AI_API_KEY is not set" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { fileUrl, filename, mimeType, itemId } = body;

    if (!fileUrl) {
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
    if (process.env.NODE_ENV === "development") {
      allowedHosts.push("localhost"); // local storage in dev
    }

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

    const audioMimeType = mimeType || guessMimeType(filename || fileUrl);

    // Start durable workflow; return immediately for client to poll
    const run = await start(audioTranscribeWorkflow, [
      fileUrl,
      audioMimeType,
    ]);

    return NextResponse.json({
      runId: run.runId,
      itemId,
    });
  } catch (error: unknown) {
    console.error("[AUDIO_PROCESS] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to process audio",
      },
      { status: 500 }
    );
  }
}

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
