import {
  GoogleGenAI,
} from "@google/genai";

const MAX_AUDIO_SIZE = 200 * 1024 * 1024;

/**
 * Step: Download audio from URL and upload to Gemini Files API.
 * Returns the file URI for use in transcription.
 */
export async function downloadAndUploadToGemini(
  fileUrl: string,
  mimeType: string
): Promise<{ fileUri: string; mimeType: string }> {
  "use step";

  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set");
  }

  const audioResponse = await fetch(fileUrl, { redirect: "error" });
  if (!audioResponse.ok) {
    throw new Error("Failed to download audio");
  }

  const contentLength = Number(audioResponse.headers.get("content-length") || "0");
  if (contentLength > MAX_AUDIO_SIZE) {
    throw new Error("Audio file exceeds the 200 MB size limit");
  }

  const audioBuffer = await audioResponse.arrayBuffer();
  if (audioBuffer.byteLength > MAX_AUDIO_SIZE) {
    throw new Error("Audio file exceeds the 200 MB size limit");
  }

  const client = new GoogleGenAI({ apiKey });
  const audioBlob = new Blob([audioBuffer], { type: mimeType });
  const uploadedFile = await client.files.upload({
    file: audioBlob,
    config: { mimeType },
  });

  if (!uploadedFile.uri || !uploadedFile.mimeType) {
    throw new Error("Failed to upload audio to Gemini");
  }

  return {
    fileUri: uploadedFile.uri,
    mimeType: uploadedFile.mimeType,
  };
}
