import {
  submitTranscription,
  pollTranscription,
  persistAudioResult,
  persistAudioFailure,
} from "./steps";

/**
 * Durable workflow for audio transcription via AssemblyAI.
 * Steps: submit → poll (with retries) → persist.
 */
export async function audioTranscribeWorkflow(
  fileUrl: string,
  _mimeType: string,
  workspaceId: string,
  itemId: string,
  userId: string,
) {
  "use workflow";

  try {
    const transcriptId = await submitTranscription(fileUrl);
    const result = await pollTranscription(transcriptId);

    await persistAudioResult(workspaceId, itemId, userId, result);

    return result;
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Processing failed";
    await persistAudioFailure(workspaceId, itemId, userId, errorMessage);
    throw err;
  }
}
