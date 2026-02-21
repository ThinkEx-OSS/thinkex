import { downloadAndUploadToGemini, transcribeWithGemini } from "./steps";

/**
 * Durable workflow for audio transcription.
 * Steps are retriable and survive restarts.
 *
 * @param fileUrl - URL of the audio file (must be from allowed hosts)
 * @param mimeType - MIME type of the audio
 */
export async function audioTranscribeWorkflow(fileUrl: string, mimeType: string) {
  "use workflow";

  const { fileUri, mimeType: geminiMimeType } = await downloadAndUploadToGemini(
    fileUrl,
    mimeType
  );

  const result = await transcribeWithGemini(fileUri, geminiMimeType);

  return result;
}
