import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

export type AttachmentStatus = 'queued' | 'extracting' | 'chunking' | 'embedding' | 'indexing' | 'done' | 'failed';

export interface UploadedAttachment {
  id: string; // Supermemory document ID
  fileName: string;
  fileSize: number;
  fileType: string;
  status: AttachmentStatus;
  workspaceId: string;
  uploadedAt: string;
  updatedAt: string;
  error?: string;
}

interface AttachmentStoreState {
  // Attachments by workspace
  attachmentsByWorkspace: Record<string, UploadedAttachment[]>;
  
  // Actions
  addAttachment: (workspaceId: string, attachment: UploadedAttachment) => void;
  updateAttachmentStatus: (workspaceId: string, id: string, status: AttachmentStatus, error?: string) => void;
  removeAttachment: (workspaceId: string, id: string) => void;
  clearWorkspaceAttachments: (workspaceId: string) => void;
  getWorkspaceAttachments: (workspaceId: string) => UploadedAttachment[];
}

export const useAttachmentStore = create<AttachmentStoreState>()(
  devtools(
    persist(
      (set, get) => ({
        attachmentsByWorkspace: {},
        
        addAttachment: (workspaceId, attachment) => set((state) => ({
          attachmentsByWorkspace: {
            ...state.attachmentsByWorkspace,
            [workspaceId]: [
              ...(state.attachmentsByWorkspace[workspaceId] || []),
              attachment,
            ],
          },
        })),
        
        updateAttachmentStatus: (workspaceId, id, status, error) => set((state) => ({
          attachmentsByWorkspace: {
            ...state.attachmentsByWorkspace,
            [workspaceId]: (state.attachmentsByWorkspace[workspaceId] || []).map((att) =>
              att.id === id
                ? { ...att, status, updatedAt: new Date().toISOString(), error }
                : att
            ),
          },
        })),
        
        removeAttachment: (workspaceId, id) => set((state) => ({
          attachmentsByWorkspace: {
            ...state.attachmentsByWorkspace,
            [workspaceId]: (state.attachmentsByWorkspace[workspaceId] || []).filter(
              (att) => att.id !== id
            ),
          },
        })),
        
        clearWorkspaceAttachments: (workspaceId) => set((state) => ({
          attachmentsByWorkspace: {
            ...state.attachmentsByWorkspace,
            [workspaceId]: [],
          },
        })),
        
        getWorkspaceAttachments: (workspaceId) => {
          return get().attachmentsByWorkspace[workspaceId] || [];
        },
      }),
      {
        name: 'attachment-store',
        // Only persist for current session
        partialize: (state) => ({ attachmentsByWorkspace: state.attachmentsByWorkspace }),
      }
    ),
    { name: 'Attachment Store' }
  )
);
