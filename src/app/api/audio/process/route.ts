import {
  GoogleGenAI,
  Type,
  createPartFromUri,
  createUserContent,
} from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

/**
 * POST /api/audio/process
 * Receives an audio file URL, downloads it, uploads to Gemini Files API,
 * and returns a structured transcript + summary.
 */
export async function POST(req: NextRequest) {
  try {
    // Auth check
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: "GOOGLE_GENERATIVE_AI_API_KEY is not set" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { fileUrl, filename, mimeType } = body;

    if (!fileUrl) {
      return NextResponse.json(
        { error: "fileUrl is required" },
        { status: 400 }
      );
    }

    // Validate URL origin to prevent SSRF
    const allowedHosts = [
      process.env.NEXT_PUBLIC_SUPABASE_URL
        ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
        : null,
    ].filter(Boolean) as string[];

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(fileUrl);
    } catch {
      return NextResponse.json(
        { error: "Invalid fileUrl" },
        { status: 400 }
      );
    }

    if (
      !allowedHosts.some((host) => parsedUrl.hostname === host || parsedUrl.hostname.endsWith(`.${host}`))
    ) {
      return NextResponse.json(
        { error: "fileUrl origin is not allowed" },
        { status: 400 }
      );
    }

    // Determine MIME type
    const audioMimeType = mimeType || guessMimeType(filename || fileUrl);

    // Download the audio file from storage
    const audioResponse = await fetch(fileUrl, { redirect: "error" });
    if (!audioResponse.ok) {
      return NextResponse.json(
        { error: "Failed to download audio" },
        { status: 500 }
      );
    }

    // Enforce a 200 MB size limit before buffering into memory
    const MAX_AUDIO_SIZE = 200 * 1024 * 1024;
    const contentLength = Number(audioResponse.headers.get("content-length") || "0");
    if (contentLength > MAX_AUDIO_SIZE) {
      return NextResponse.json(
        { error: "Audio file exceeds the 200 MB size limit" },
        { status: 400 }
      );
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    if (audioBuffer.byteLength > MAX_AUDIO_SIZE) {
      return NextResponse.json(
        { error: "Audio file exceeds the 200 MB size limit" },
        { status: 400 }
      );
    }

    const client = new GoogleGenAI({ apiKey });

    // Upload audio to Gemini Files API (supports up to 2 GB, avoids 20 MB inline limit)
    const audioBlob = new Blob([audioBuffer], { type: audioMimeType });
    const uploadedFile = await client.files.upload({
      file: audioBlob,
      config: { mimeType: audioMimeType },
    });

    if (!uploadedFile.uri || !uploadedFile.mimeType) {
      return NextResponse.json(
        { error: "Failed to upload audio to Gemini" },
        { status: 500 }
      );
    }

    const prompt = `Process this audio file and generate a detailed transcription and summary.

Requirements:
1. Provide a comprehensive summary of the entire audio content.
2. Identify distinct speakers (e.g., Speaker 1, Speaker 2, or names if context allows).
3. Provide accurate timestamps for each segment (Format: MM:SS).
4. Provide the total duration of the audio in seconds (a single number, e.g. 180.5 for 3 minutes).`;

    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: createUserContent([
        createPartFromUri(uploadedFile.uri, uploadedFile.mimeType),
        prompt,
      ]),
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description: "A concise summary of the audio content.",
            },
            duration: {
              type: Type.NUMBER,
              description: "Total duration of the audio in seconds.",
            },
            segments: {
              type: Type.ARRAY,
              description:
                "List of transcribed segments with speaker and timestamp.",
              items: {
                type: Type.OBJECT,
                properties: {
                  speaker: { type: Type.STRING },
                  timestamp: { type: Type.STRING },
                  content: { type: Type.STRING },
                },
                required: [
                  "speaker",
                  "timestamp",
                  "content",
                ],
              },
            },
          },
          required: ["summary", "segments"],
        },
      },
    });

    const resultText = response.text;
    if (!resultText) {
      return NextResponse.json(
        { error: "No response from Gemini" },
        { status: 500 }
      );
    }

    const result = JSON.parse(resultText);

    return NextResponse.json({
      success: true,
      summary: result.summary,
      segments: result.segments,
      duration: typeof result.duration === "number" && result.duration > 0 ? result.duration : undefined,
    });
  } catch (error: unknown) {
    console.error("[AUDIO_PROCESS] Error:", error);
    return NextResponse.json(
      { error: "Failed to process audio" },
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
  return "audio/mp3"; // Default fallback
}
