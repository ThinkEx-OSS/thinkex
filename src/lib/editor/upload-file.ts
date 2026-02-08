import { toast } from "sonner";
import { uploadFileDirect } from "@/lib/uploads/client-upload";

/**
 * Uploads a file to Supabase storage and returns the public URL.
 * This function is used by BlockNote editor for file/image uploads.
 * Uses direct client-to-Supabase upload to bypass Vercel's 4.5MB body limit.
 * 
 * @param file - The file to upload
 * @param showToast - Whether to show toast notifications (default: true)
 * @param workspaceId - Optional workspace ID (reserved for future use)
 * @param cardName - Optional card name (reserved for future use)
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

  try {
    const result = await uploadFileDirect(file);

    // Show success toast
    if (showToast && toastId) {
      toast.success('Image uploaded successfully!', { id: toastId });
    }

    return result.url;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to upload image';

    console.error('Error uploading file:', errorMessage);

    // Show error toast
    if (showToast && toastId) {
      toast.error(errorMessage, { id: toastId });
    }

    throw error instanceof Error ? error : new Error(errorMessage);
  }
}
