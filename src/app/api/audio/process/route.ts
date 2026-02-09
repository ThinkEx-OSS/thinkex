import { GoogleGenAI, Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export const maxDuration = 60;
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

    // Determine MIME type
    const audioMimeType = mimeType || guessMimeType(filename || fileUrl);

    // Download the audio file from storage
    const audioResponse = await fetch(fileUrl);
    if (!audioResponse.ok) {
      return NextResponse.json(
        { error: `Failed to download audio: ${audioResponse.statusText}` },
        { status: 500 }
      );
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString("base64");

    const client = new GoogleGenAI({ apiKey });

    const prompt = `Process this audio file and generate a detailed transcription and summary.

Requirements:
1. Provide a brief summary of the entire audio content.
2. Identify distinct speakers (e.g., Speaker 1, Speaker 2, or names if context allows).
3. Provide accurate timestamps for each segment (Format: MM:SS).
4. Detect the primary language of each segment.
5. If the segment is in a language different than English, also provide the English translation.
6. Identify the primary emotion of the speaker in this segment. You MUST choose exactly one of the following: happy, sad, angry, neutral.
7. Provide the full plain-text transcript combining all segments.`;

    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: audioMimeType,
                data: base64Audio,
              },
            },
            { text: prompt },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description: "A concise summary of the audio content.",
            },
            transcript: {
              type: Type.STRING,
              description:
                "Full plain-text transcript of the audio, combining all segments.",
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
                  language: { type: Type.STRING },
                  language_code: { type: Type.STRING },
                  translation: { type: Type.STRING },
                  emotion: {
                    type: Type.STRING,
                    enum: ["happy", "sad", "angry", "neutral"],
                  },
                },
                required: [
                  "speaker",
                  "timestamp",
                  "content",
                  "language",
                  "language_code",
                  "emotion",
                ],
              },
            },
          },
          required: ["summary", "transcript", "segments"],
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
      transcript: result.transcript,
      segments: result.segments,
    });
  } catch (error: any) {
    console.error("[AUDIO_PROCESS] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to process audio" },
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
