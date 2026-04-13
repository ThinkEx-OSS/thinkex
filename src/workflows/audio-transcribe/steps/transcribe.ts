import { AssemblyAI } from "assemblyai";
import { RetryableError } from "@workflow/errors";

export interface TranscribeResult {
  summary?: string;
  segments: Array<{ speaker: string; timestamp: string; content: string }>;
  duration?: number;
}

/**
 * Step 1: Submit audio to AssemblyAI for transcription.
 * Fast (<5s) — just queues the job and returns the transcript ID.
 */
export async function submitTranscription(
  audioUrl: string,
): Promise<string> {
  "use step";

  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    throw new Error("ASSEMBLYAI_API_KEY is not set");
  }

  const client = new AssemblyAI({ apiKey });

  const transcript = await client.transcripts.submit({
    audio_url: audioUrl,
    speaker_labels: true,
  });

  return transcript.id;
}

/**
 * Step 2: Poll AssemblyAI for the completed transcript.
 * Throws RetryableError if still processing so the workflow runtime can sleep and retry.
 */
export async function pollTranscription(
  transcriptId: string,
): Promise<TranscribeResult> {
  "use step";

  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    throw new Error("ASSEMBLYAI_API_KEY is not set");
  }

  const client = new AssemblyAI({ apiKey });
  const transcript = await client.transcripts.get(transcriptId);

  if (transcript.status === "error") {
    throw new Error(transcript.error ?? "AssemblyAI transcription failed");
  }

  if (transcript.status !== "completed") {
    throw new RetryableError("Transcription still processing", {
      retryAfter: 30_000,
    });
  }

  const segments = (transcript.utterances ?? []).map((utterance) => ({
    speaker: utterance.speaker ?? "Speaker",
    timestamp: formatMillisToTimestamp(utterance.start),
    content: utterance.text,
  }));

  return {
    segments,
    duration: transcript.audio_duration ?? undefined,
  };
}

function formatMillisToTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
