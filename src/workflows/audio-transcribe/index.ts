import {
  transcribeWithAssemblyAI,
  persistAudioResult,
  persistAudioFailure,
} from "./steps";

/**
 * Durable workflow for audio transcription via AssemblyAI.
 * Steps: transcribe → persist.
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
    const result = await transcribeWithAssemblyAI(fileUrl);

    await persistAudioResult(workspaceId, itemId, userId, result);

    return result;
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Processing failed";
    await persistAudioFailure(workspaceId, itemId, userId, errorMessage);
    throw err;
  }
}
