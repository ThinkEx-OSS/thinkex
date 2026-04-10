import { AssemblyAI, type TranscribeParams } from "assemblyai";

export interface TranscribeResult {
  summary: string;
  segments: Array<{ speaker: string; timestamp: string; content: string }>;
  duration?: number;
}

const MAX_AUDIO_SIZE = 200 * 1024 * 1024;

function formatTimestamp(startMs: number): string {
  const totalSeconds = Math.floor(startMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export async function transcribeWithAssemblyAI(
  fileUrl: string,
  mimeType: string,
): Promise<TranscribeResult> {
  "use step";

  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    throw new Error("ASSEMBLYAI_API_KEY is not set");
  }

  const audioResponse = await fetch(fileUrl, { redirect: "error" });
  if (!audioResponse.ok) {
    throw new Error("Failed to download audio");
  }

  const contentLength = Number(
    audioResponse.headers.get("content-length") || "0",
  );
  if (contentLength > MAX_AUDIO_SIZE) {
    throw new Error("Audio file exceeds the 200 MB size limit");
  }

  const audioBuffer = await audioResponse.arrayBuffer();
  if (audioBuffer.byteLength > MAX_AUDIO_SIZE) {
    throw new Error("Audio file exceeds the 200 MB size limit");
  }

  const client = new AssemblyAI({ apiKey });
  const audioFile = new Blob([audioBuffer], {
    type:
      mimeType ||
      audioResponse.headers.get("content-type") ||
      "application/octet-stream",
  });
  const audioUrl = await client.files.upload(audioFile);

  const transcriptParams = {
    audio_url: audioUrl,
    speech_models: ["universal-3-pro", "universal-2"],
    language_detection: true,
    speaker_labels: true,
    summarization: true,
    summary_model: "informative",
    summary_type: "paragraph",
  } as unknown as TranscribeParams;

  const transcript = await client.transcripts.transcribe(transcriptParams);

  if (transcript.status === "error") {
    throw new Error(transcript.error || "AssemblyAI transcription failed");
  }

  if (transcript.status !== "completed") {
    throw new Error(
      `AssemblyAI transcription did not complete: ${transcript.status}`,
    );
  }

  const speakerMap = new Map<string, string>();
  let speakerCount = 0;

  const segments = (transcript.utterances ?? []).map((utterance) => {
    const sourceSpeaker =
      typeof utterance.speaker === "string" && utterance.speaker.length > 0
        ? utterance.speaker
        : "unknown";

    if (!speakerMap.has(sourceSpeaker)) {
      speakerCount += 1;
      speakerMap.set(sourceSpeaker, `Speaker ${speakerCount}`);
    }

    return {
      speaker: speakerMap.get(sourceSpeaker) ?? sourceSpeaker,
      timestamp: formatTimestamp(utterance.start ?? 0),
      content: utterance.text,
    };
  });

  return {
    summary: transcript.summary ?? "",
    segments,
    duration:
      typeof transcript.audio_duration === "number" &&
      transcript.audio_duration > 0
        ? transcript.audio_duration
        : undefined,
  };
}
