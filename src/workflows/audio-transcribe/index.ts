import {
  downloadAndUploadToGemini,
  transcribeWithGemini,
  persistAudioResult,
  persistAudioFailure,
} from "./steps";

/**
 * Durable workflow for audio transcription.
 * Steps are retriable and survive restarts.
 * Persists result to workspace on success or failure.
 *
 * @param fileUrl - URL of the audio file (must be from allowed hosts)
 * @param mimeType - MIME type of the audio
 * @param workspaceId - Workspace to update
 * @param itemId - Audio card item ID
 * @param userId - User ID for event attribution
 */
export async function audioTranscribeWorkflow(
  fileUrl: string,
  mimeType: string,
  workspaceId: string,
  itemId: string,
  userId: string
) {
  "use workflow";

  try {
    const { fileUri, mimeType: geminiMimeType } = await downloadAndUploadToGemini(
      fileUrl,
      mimeType
    );

    const result = await transcribeWithGemini(fileUri, geminiMimeType);

    await persistAudioResult(workspaceId, itemId, userId, result);

    return result;
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Processing failed";
    await persistAudioFailure(workspaceId, itemId, userId, errorMessage);
    throw err;
  }
}
