import { create } from "zustand";

/**
 * Tracks which composer attachment IDs are currently uploading.
 * Used by SupabaseAttachmentAdapter to show skeleton/loading states
 * similar to the home input's HomeAttachmentCards.
 */
interface AttachmentUploadState {
  uploadingIds: Set<string>;
  addUploading: (id: string) => void;
  removeUploading: (id: string) => void;
  isUploading: (id: string) => boolean;
  hasUploading: () => boolean;
}

export const useAttachmentUploadStore = create<AttachmentUploadState>((set, get) => ({
  uploadingIds: new Set(),
  addUploading: (id) =>
    set((s) => {
      const next = new Set(s.uploadingIds);
      next.add(id);
      return { uploadingIds: next };
    }),
  removeUploading: (id) =>
    set((s) => {
      const next = new Set(s.uploadingIds);
      next.delete(id);
      return { uploadingIds: next };
    }),
  isUploading: (id) => get().uploadingIds.has(id),
  hasUploading: () => get().uploadingIds.size > 0,
}));
