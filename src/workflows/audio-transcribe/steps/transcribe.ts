import { AssemblyAI } from "assemblyai";

export interface TranscribeResult {
  summary?: string;
  segments: Array<{ speaker: string; timestamp: string; content: string }>;
  duration?: number;
}

/**
 * Step: Transcribe audio using AssemblyAI Universal-3 Pro with speaker diarization.
 */
export async function transcribeWithAssemblyAI(
  audioUrl: string,
): Promise<TranscribeResult> {
  "use step";

  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    throw new Error("ASSEMBLYAI_API_KEY is not set");
  }

  const client = new AssemblyAI({ apiKey });

  const transcript = await client.transcripts.transcribe({
    audio_url: audioUrl,
    speaker_labels: true,
  });

  if (transcript.status === "error") {
    throw new Error(transcript.error ?? "AssemblyAI transcription failed");
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
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
