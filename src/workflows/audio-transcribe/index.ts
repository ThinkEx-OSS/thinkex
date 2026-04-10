import {
  transcribeWithAssemblyAI,
  persistAudioResult,
  persistAudioFailure,
} from "./steps";

/**
 * Durable workflow for audio transcription using AssemblyAI.
 * Steps are retriable and survive restarts.
 * Persists result to workspace on success or failure.
 */
export async function audioTranscribeWorkflow(
  fileUrl: string,
  mimeType: string,
  workspaceId: string,
  itemId: string,
  userId: string,
) {
  "use workflow";

  try {
    const result = await transcribeWithAssemblyAI(fileUrl, mimeType);
    await persistAudioResult(workspaceId, itemId, userId, result);
    return result;
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Processing failed";
    await persistAudioFailure(workspaceId, itemId, userId, errorMessage);
    throw err;
  }
}
