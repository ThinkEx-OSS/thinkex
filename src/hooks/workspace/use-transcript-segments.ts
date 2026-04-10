import { useQuery } from "@tanstack/react-query";
import type { AudioSegment } from "@/lib/workspace-state/types";

interface TranscriptData {
  segments: AudioSegment[];
  transcript: string | null;
}

export function transcriptSegmentsQueryKey(
  workspaceId: string | null,
  itemId: string | null,
) {
  return ["transcript-segments", workspaceId, itemId] as const;
}

export function useTranscriptSegments(
  workspaceId: string | null,
  itemId: string | null,
  enabled: boolean,
) {
  return useQuery<TranscriptData>({
    queryKey: transcriptSegmentsQueryKey(workspaceId, itemId),
    queryFn: async () => {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/items/${itemId}/transcript`,
      );

      if (!response.ok) {
        throw new Error("Failed to fetch transcript");
      }

      return (await response.json()) as TranscriptData;
    },
    enabled: !!workspaceId && !!itemId && enabled,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}
