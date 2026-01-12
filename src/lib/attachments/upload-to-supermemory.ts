import type { UploadedAttachment } from "@/lib/stores/attachment-store";
import { toast } from "sonner";

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

/**
 * Shared utility function to upload a file to Supermemory and track it in the attachment store.
 * This is used by both the AttachmentDialog, paste handler, and BlockNote editor to avoid code duplication.
 * 
 * @param file - The file to upload
 * @param workspaceId - The workspace ID
 * @param addAttachment - Function to add attachment to the store
 * @param options - Optional configuration
 * @param options.showToast - Whether to show toast notifications (default: true)
 */
export async function uploadFileToSupermemory(
  file: File,
  workspaceId: string,
  addAttachment: (workspaceId: string, attachment: UploadedAttachment) => void,
  options: { showToast?: boolean } = {}
): Promise<{ success: boolean; error?: string }> {
  const { showToast = true } = options;

  // Validate file size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const error = `File size exceeds ${MAX_FILE_SIZE_MB}MB limit`;
    if (showToast) {
      toast.error(error, {
        style: { color: '#fff' },
      });
    }
    return { success: false, error };
  }

  const uploadToast = showToast ? toast.loading(`Uploading ${file.name}...`, {
    style: { color: '#fff' },
  }) : undefined;

  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('workspaceId', workspaceId);

    const response = await fetch('/api/upload-attachment', {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();

    if (response.ok) {
      addAttachment(workspaceId, {
        id: result.memoryId,
        fileName: result.fileName,
        fileSize: file.size,
        fileType: file.type,
        status: result.status || 'queued',
        workspaceId: workspaceId,
        uploadedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      if (showToast && uploadToast) {
        toast.success(`${file.name} uploaded successfully`, {
          id: uploadToast,
          style: { color: '#fff' },
        });
      }

      return { success: true };
    } else {
      const error = result.error || 'Upload failed';
      if (showToast && uploadToast) {
        toast.error(error, {
          id: uploadToast,
          style: { color: '#fff' },
        });
      }
      return { success: false, error };
    }
  } catch (error) {
    console.error('Upload error:', error);
    const errorMessage = `Failed to upload ${file.name}`;
    if (showToast && uploadToast) {
      toast.error(errorMessage, {
        id: uploadToast,
        style: { color: '#fff' },
      });
    }
    return { success: false, error: errorMessage };
  }
}

