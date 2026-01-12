import { toast } from "sonner";
import { useAttachmentStore } from "@/lib/stores/attachment-store";
import { uploadFileToSupermemory } from "@/lib/attachments/upload-to-supermemory";

/**
 * Uploads a file to Supermemory in the background (fire and forget).
 * This does not block the editor and runs separately from the Supabase upload.
 * Uses the shared upload utility for consistency.
 * 
 * @param file - The file to upload to Supermemory
 * @param workspaceId - The workspace ID to associate with the upload
 * @param cardName - Optional card name for attachment naming (currently not used in shared utility)
 */
async function uploadToSupermemory(file: File, workspaceId: string | null, cardName: string | undefined = undefined): Promise<void> {
  // Only upload if workspaceId is available
  if (!workspaceId) {
    return;
  }

  try {
    // Use shared utility function for consistency
    // Suppress toast notifications since BlockNote already shows toasts for Supabase upload
    // The shared utility will still add to attachment store for processing UI
    const store = useAttachmentStore.getState();
    await uploadFileToSupermemory(file, workspaceId, store.addAttachment, { showToast: false });
  } catch (error) {
    // Silently log errors - don't interrupt user experience
    console.error('Error uploading to Supermemory (background):', error);
  }
}

/**
 * Uploads a file to Supabase storage via API route and returns the public URL.
 * Also uploads to Supermemory in the background if workspaceId is provided.
 * This function is used by BlockNote editor for file/image uploads.
 * Uses server-side API route for proper Better Auth authentication.
 * 
 * @param file - The file to upload
 * @param showToast - Whether to show toast notifications (default: true)
 * @param workspaceId - Optional workspace ID for Supermemory upload (default: null)
 * @param cardName - Optional card name for attachment naming (default: null)
 * @returns Promise resolving to the public URL of the uploaded file
 * @throws Error if upload fails
 */
export async function uploadFile(
  file: File, 
  showToast: boolean = true,
  workspaceId: string | null = null,
  cardName: string | undefined = undefined
): Promise<string> {
  // Show loading toast if not already shown (for paste handler)
  const toastId = showToast ? toast.loading('Uploading image...') : undefined;

  // Create FormData to send file
  const formData = new FormData();
  formData.append('file', file);

  try {
    // Upload via API route (uses Better Auth server-side)
    const response = await fetch('/api/upload-file', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      const errorMessage = errorData.error || `Failed to upload file: ${response.statusText}`;
      
      console.error('Error uploading file:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData.error,
      });
      
      // Show error toast
      if (showToast && toastId) {
        toast.error(errorMessage, { id: toastId });
      }
      
      throw new Error(errorMessage);
    }

    const data = await response.json();
    
    if (!data.success || !data.url) {
      const errorMessage = data.error || 'Failed to get upload URL';
      
      // Show error toast
      if (showToast && toastId) {
        toast.error(errorMessage, { id: toastId });
      }
      
      throw new Error(errorMessage);
    }

    // Show success toast
    if (showToast && toastId) {
      toast.success('Image uploaded successfully!', { id: toastId });
    }
    
    // Upload to Supermemory in the background (fire and forget)
    // This doesn't block the editor - it runs separately
    uploadToSupermemory(file, workspaceId, cardName).catch((error) => {
      // Silently handle errors - don't interrupt user experience
      console.error('Background Supermemory upload failed:', error);
    });
    
    return data.url;
  } catch (error) {
    // Re-throw error if it's already been handled
    if (error instanceof Error) {
      throw error;
    }
    // Handle unexpected errors
    const errorMessage = 'Failed to upload image';
    if (showToast && toastId) {
      toast.error(errorMessage, { id: toastId });
    }
    throw new Error(errorMessage);
  }
}

